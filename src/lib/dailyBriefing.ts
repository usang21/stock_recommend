/**
 * 당일 상한가 / 거래량 급증 브리핑 (DESIGN.md §14).
 *
 * 스크리너(전략 1~4)와 달리 재료 판단이나 추세·수급 조건은 쓰지 않는다. 당일 상한가
 * 종목과 거래량 1,000만 주 이상 종목을 모아, 사람이 뉴스·공시를 직접 확인할 수
 * 있도록 링크를 붙여 전달하는 것이 목적이다.
 *
 * 다만 `universe.ts`의 제외 기준(관리종목·거래정지·SPAC·투자유의/경고/위험·ETF/ETN)은
 * 스크리너와 똑같이 적용한다. 애초에 매수 후보로 볼 수 없는 종목이 목록에 섞이면
 * 확인할 가치가 없는 줄이 늘어날 뿐이기 때문이다.
 *
 * 최소 시가총액 기준은 적용하지 않는다. 시총이 작아도 상한가에 들었다는 사실 자체는
 * 알 가치가 있다고 보고, 거르지 않고 보여준다 (`meetsMinMarketCap`은 호출하지 않는다).
 */
import {
  getStockCandles,
  getUpperLimitStocks,
  getVolumeTopRanking,
  type Candle,
  type NaverStockRow,
} from "@/lib/dataSources/naver";
import { mapWithConcurrency } from "@/lib/concurrency";
import { buildExcludedUniverse, filterUniverse } from "@/lib/strategies/universe";

/**
 * 대량거래 판정 기준. 거래량(주식 수)과 거래대금(금액) 중 **하나만 넘겨도** 포함한다.
 *
 * 주식 수만으로 재면 저가주에 심하게 편향된다. 1,000만 주를 채우는 데 필요한 돈이
 * 주가 100원이면 10억인데 주가 180만원이면 18조라, 고가 대형주는 거래대금 1위를
 * 해도 영구히 들어올 수 없다(2026-10-04 SK하이닉스: 거래대금 3.7조 전체 1위,
 * 거래량 201만 주로 탈락). 그래서 금액 기준을 OR로 함께 둔다.
 *
 * 전략 1·4의 `minVolume`/`minTradingValue`와 같은 수치이고 같은 OR 방식이다.
 */
export const VOLUME_THRESHOLD = 10_000_000;
export const TRADING_VALUE_THRESHOLD = 200_000_000_000;

/**
 * 절대치를 넘는 것만으로는 부족하다. 평소에도 그만큼 거래되는 종목(삼성전자 등)이
 * 매일 목록에 들어오면 "오늘 무슨 일이 있었는가"를 알려주지 못한다. 그래서 직전
 * 거래일들의 평균 대비 몇 배인지를 함께 본다.
 */
export const SURGE_MULTIPLIER = 2;

/** 평소 거래 수준을 재는 기간 (직전 거래일 수, 오늘 제외). */
export const BASELINE_TRADING_DAYS = 5;

/** 종목별 일봉 조회를 동시에 너무 많이 날리지 않도록 제한한다. */
const BASELINE_CONCURRENCY = 4;

/**
 * 거래량 랭킹에서 받아올 행 수. 2026-10-04 실측으로 100위가 약 160만 주였고
 * 기준치(1,000만 주)를 넘는 종목은 7개뿐이어서 여유가 크다. 급변동장에서
 * 기준치 초과 종목이 100개를 넘으면 이 값을 올려야 한다.
 */
const VOLUME_RANKING_SIZE = 100;

export const LIMIT_UP_TAG = "상한가";
// 거래량·거래대금 중 어느 쪽으로 들어왔든 같은 태그를 쓴다. 조건이 둘이라
// "거래량1000만주이상" 같은 이름은 사실과 어긋날 수 있어 중립적으로 둔다.
export const HIGH_VOLUME_TAG = "대량거래";

export type BriefingTag = typeof LIMIT_UP_TAG | typeof HIGH_VOLUME_TAG;

export interface BriefingStock {
  code: string;
  name: string;
  /** "KOSPI" | "KOSDAQ", 판별 불가 시 "확인불가". */
  market: string;
  price: number;
  changeRate: number;
  /** 상한가 조건만으로 들어온 종목도 거래량을 함께 담는다 (랭킹 응답에 늘 포함되므로). */
  volume: number;
  /** 거래대금 (원). 거래량만으로는 저가주 편향이 생겨 함께 보여준다. */
  tradingValue: number;
  /** 직전 거래일 평균 대비 배수. 일봉이 부족해 판정하지 못한 경우 null. */
  volumeRatio: number | null;
  tradingValueRatio: number | null;
  tags: BriefingTag[];
  newsUrl: string;
  dartUrl: string;
  quoteUrl: string;
}

export interface DailyBriefing {
  /** 대상 거래일 (KST 기준 YYYY-MM-DD). */
  tradeDate: string;
  stocks: BriefingStock[];
  limitUpCount: number;
  highVolumeCount: number;
  volumeThreshold: number;
  tradingValueThreshold: number;
  surgeMultiplier: number;
  baselineTradingDays: number;
}

/**
 * KST 기준 오늘 날짜. Vercel 함수는 UTC로 돌기 때문에 명시적으로 변환한다.
 * 현재 실행 시각(KST 15:45~16:44)에서는 UTC 날짜와 결과가 같지만, 스케줄을
 * 옮겼을 때 조용히 하루 어긋나는 것을 막기 위해 타임존을 박아둔다.
 */
export function kstToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

/** 시장 구분을 판별할 수 없을 때 쓰는 표시. 종목 코드가 실질 식별자이므로, 여기서
 *  브리핑 전체를 실패시키는 대신 모르는 것을 모른다고 표시하고 계속 진행한다. */
const UNKNOWN_MARKET = "확인불가";

function marketOf(row: NaverStockRow): string {
  const sosok = String(row.sosok ?? "");
  if (sosok === "0") return "KOSPI";
  if (sosok === "1") return "KOSDAQ";
  console.warn(`sosok 값이 예상과 다릅니다 (${row.itemcode} ${row.itemname}): ${JSON.stringify(row.sosok)}`);
  return UNKNOWN_MARKET;
}

function newsUrl(name: string, code: string): string {
  return `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(`${name} ${code}`)}`;
}

function dartUrl(name: string): string {
  return `https://dart.fss.or.kr/dsab001/main.do?textCrpNm=${encodeURIComponent(name)}`;
}

function quoteUrl(code: string): string {
  return `https://finance.naver.com/item/main.naver?code=${code}`;
}

function toBriefingStock(row: NaverStockRow): BriefingStock {
  return {
    code: row.itemcode,
    name: row.itemname,
    market: marketOf(row),
    price: Number(row.nowPrice),
    changeRate: Number(row.prevChangeRate),
    volume: Number(row.tradeVolume),
    tradingValue: Number(row.tradeAmount),
    volumeRatio: null,
    tradingValueRatio: null,
    tags: [],
    newsUrl: newsUrl(row.itemname, row.itemcode),
    dartUrl: dartUrl(row.itemname),
    quoteUrl: quoteUrl(row.itemcode),
  };
}

interface Baseline {
  /** 직전 N거래일 평균 거래량 (주). */
  volume: number;
  /** 직전 N거래일 평균 거래대금 (원, 추정치 — 아래 주석 참고). */
  tradingValue: number;
}

/**
 * 직전 거래일들의 평균 거래 수준. 오늘은 평균에서 제외한다.
 *
 * 거래대금은 **추정치**다. 네이버의 일봉 API가 주는 컬럼이 날짜·시가·고가·저가·종가·
 * 거래량·외국인소진율이어서 일별 거래대금이 없고(2026-10-04 확인), 다른 공개
 * 엔드포인트에서도 일별 시계열을 찾지 못했다. 그래서 `종가 × 거래량`으로 추정한다.
 * 실제 거래대금과의 오차는 당일 수치로 대조했을 때 대부분 ±3% 안쪽이었다(동전주는
 * 가격 단위 때문에 10%를 넘기도 하지만, 그런 종목은 관리종목으로 이미 제외된다).
 *
 * 배수를 구할 때 오늘 값도 같은 방식으로 추정해 비교하므로, 추정 오차가 분자와
 * 분모에서 함께 상쇄된다.
 */
function baselineFrom(candles: Candle[], tradeDate: string): Baseline | null {
  const todayCompact = tradeDate.replace(/-/g, "");
  // 오늘 일봉이 이미 올라와 있을 수도, 아직 없을 수도 있어 날짜로 걸러낸다.
  const past = candles.filter((c) => c.date < todayCompact).slice(-BASELINE_TRADING_DAYS);
  if (past.length < BASELINE_TRADING_DAYS) return null;
  const volume = past.reduce((sum, c) => sum + c.volume, 0) / past.length;
  const tradingValue = past.reduce((sum, c) => sum + c.close * c.volume, 0) / past.length;
  return { volume, tradingValue };
}

interface SurgeVerdict {
  qualifies: boolean;
  volumeRatio: number | null;
  tradingValueRatio: number | null;
}

/**
 * 대량거래 판정. 거래량과 거래대금 각각 **절대치와 급증배수를 함께** 만족해야 하고,
 * 둘 중 하나만 통과해도 포함한다.
 *
 * 일봉이 부족해 평소 수준을 모르는 경우(신규 상장 등)는 통과시킨다. 판정할 수 없다는
 * 이유로 거래가 몰린 종목을 빠뜨리는 쪽이, 몇 줄 더 보는 것보다 나쁘다고 보았다.
 */
function judgeSurge(row: NaverStockRow, baseline: Baseline | null): SurgeVerdict {
  const volume = Number(row.tradeVolume);
  const tradingValue = Number(row.tradeAmount);
  const approxTradingValue = Number(row.nowPrice) * volume;

  const volumeRatio = baseline && baseline.volume > 0 ? volume / baseline.volume : null;
  const tradingValueRatio =
    baseline && baseline.tradingValue > 0 ? approxTradingValue / baseline.tradingValue : null;

  const volumeSurged = volumeRatio === null || volumeRatio >= SURGE_MULTIPLIER;
  const valueSurged = tradingValueRatio === null || tradingValueRatio >= SURGE_MULTIPLIER;

  const qualifies =
    (volume >= VOLUME_THRESHOLD && volumeSurged) ||
    (tradingValue >= TRADING_VALUE_THRESHOLD && valueSurged);

  return { qualifies, volumeRatio, tradingValueRatio };
}

/**
 * 두 조건을 종목 단위로 합친다. 상한가이면서 거래량도 기준치를 넘는 종목은
 * 행이 둘로 갈리지 않고 태그 두 개를 함께 갖는다.
 */
export async function buildDailyBriefing(now: Date = new Date()): Promise<DailyBriefing> {
  const [universe, upperLimitRows, volumeRows] = await Promise.all([
    buildExcludedUniverse(),
    getUpperLimitStocks(),
    getVolumeTopRanking(VOLUME_RANKING_SIZE),
  ]);

  const byCode = new Map<string, BriefingStock>();
  const addTag = (row: NaverStockRow, tag: BriefingTag) => {
    const existing = byCode.get(row.itemcode);
    const stock = existing ?? toBriefingStock(row);
    if (!stock.tags.includes(tag)) stock.tags.push(tag);
    byCode.set(row.itemcode, stock);
  };

  const limitUp = filterUniverse(upperLimitRows, universe);
  for (const row of limitUp) addTag(row, LIMIT_UP_TAG);

  // 급증 판정은 일봉을 종목마다 받아야 하므로, 절대치를 넘긴 후보에만 적용해
  // 요청 수를 줄인다.
  const tradeDate = kstToday(now);
  const candidates = filterUniverse(volumeRows, universe).filter(
    (row) =>
      Number(row.tradeVolume) >= VOLUME_THRESHOLD ||
      Number(row.tradeAmount) >= TRADING_VALUE_THRESHOLD
  );

  const judged = await mapWithConcurrency(candidates, BASELINE_CONCURRENCY, async (row) => {
    let baseline: Baseline | null = null;
    try {
      // 휴일을 감안해 넉넉히 받아 날짜로 걸러낸다.
      const candles = await getStockCandles(row.itemcode, BASELINE_TRADING_DAYS + 10);
      baseline = baselineFrom(candles, tradeDate);
    } catch (err) {
      // 한 종목의 일봉 조회 실패가 브리핑 전체를 깨뜨리지 않도록 한다. 평소 수준을
      // 모르는 것으로 보고 통과시킨다 (judgeSurge의 null 처리와 같은 방침).
      console.warn(`${row.itemname}(${row.itemcode}) 일봉 조회 실패 — 급증 판정을 건너뜁니다:`, err);
    }
    return { row, verdict: judgeSurge(row, baseline) };
  });

  const highVolume = judged.filter((j) => j.verdict.qualifies);
  for (const { row, verdict } of highVolume) {
    addTag(row, HIGH_VOLUME_TAG);
    const stock = byCode.get(row.itemcode);
    if (stock) {
      stock.volumeRatio = verdict.volumeRatio;
      stock.tradingValueRatio = verdict.tradingValueRatio;
    }
  }

  // 상한가를 먼저, 그 안에서는 거래량이 많은 순서로 — 메일과 Notion에서 같은 순서를 쓴다.
  const stocks = [...byCode.values()].sort((a, b) => {
    const aLimitUp = a.tags.includes(LIMIT_UP_TAG);
    const bLimitUp = b.tags.includes(LIMIT_UP_TAG);
    if (aLimitUp !== bLimitUp) return aLimitUp ? -1 : 1;
    return b.volume - a.volume;
  });

  return {
    tradeDate,
    stocks,
    limitUpCount: limitUp.length,
    highVolumeCount: highVolume.length,
    volumeThreshold: VOLUME_THRESHOLD,
    tradingValueThreshold: TRADING_VALUE_THRESHOLD,
    surgeMultiplier: SURGE_MULTIPLIER,
    baselineTradingDays: BASELINE_TRADING_DAYS,
  };
}
