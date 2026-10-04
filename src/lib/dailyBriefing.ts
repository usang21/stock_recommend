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
import { getUpperLimitStocks, getVolumeTopRanking, type NaverStockRow } from "@/lib/dataSources/naver";
import { buildExcludedUniverse, filterUniverse } from "@/lib/strategies/universe";

/** 거래량 기준치 (주). 이 수치 이상인 종목만 거래량 조건으로 포함한다. */
export const VOLUME_THRESHOLD = 10_000_000;

/**
 * 거래량 랭킹에서 받아올 행 수. 2026-10-04 실측으로 100위가 약 160만 주였고
 * 기준치(1,000만 주)를 넘는 종목은 7개뿐이어서 여유가 크다. 급변동장에서
 * 기준치 초과 종목이 100개를 넘으면 이 값을 올려야 한다.
 */
const VOLUME_RANKING_SIZE = 100;

export const LIMIT_UP_TAG = "상한가";
export const HIGH_VOLUME_TAG = "거래량1000만주이상";

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
    tags: [],
    newsUrl: newsUrl(row.itemname, row.itemcode),
    dartUrl: dartUrl(row.itemname),
    quoteUrl: quoteUrl(row.itemcode),
  };
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

  const highVolume = filterUniverse(volumeRows, universe).filter(
    (row) => Number(row.tradeVolume) >= VOLUME_THRESHOLD
  );
  for (const row of highVolume) addTag(row, HIGH_VOLUME_TAG);

  // 상한가를 먼저, 그 안에서는 거래량이 많은 순서로 — 메일과 Notion에서 같은 순서를 쓴다.
  const stocks = [...byCode.values()].sort((a, b) => {
    const aLimitUp = a.tags.includes(LIMIT_UP_TAG);
    const bLimitUp = b.tags.includes(LIMIT_UP_TAG);
    if (aLimitUp !== bLimitUp) return aLimitUp ? -1 : 1;
    return b.volume - a.volume;
  });

  return {
    tradeDate: kstToday(now),
    stocks,
    limitUpCount: limitUp.length,
    highVolumeCount: highVolume.length,
    volumeThreshold: VOLUME_THRESHOLD,
  };
}
