/**
 * 네이버증권(비공식) 데이터 소스.
 *
 * 엔드포인트는 dd3ok/naverstock-api-skill (https://github.com/dd3ok/naverstock-api-skill)
 * 카탈로그와 직접 호출 검증(2026-09-22)을 근거로 한다. 네이버증권 내부 API는
 * 문서화되어 있지 않고 예고 없이 바뀔 수 있으므로(DESIGN.md §5 참고 미결 항목),
 * 이 모듈이 실패하기 시작하면 가장 먼저 의심할 대상이다.
 */

const STOCK_API_BASE = "https://stock.naver.com/api";
const LEGACY_CHART_BASE = "https://api.finance.naver.com";

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Referer: "https://stock.naver.com/",
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: COMMON_HEADERS, cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Naver API 호출 실패 (${res.status}): ${url}\n${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

/** `/api/domestic/market/stock/default` 랭킹 응답 한 행. */
export interface NaverStockRow {
  itemname: string;
  itemcode: string;
  // "0" = KOSPI, "1" = KOSDAQ (2026-10-04 실 응답 12종목으로 확인). 문자/숫자 모두 올 수 있다.
  // 기존 코드가 이 타입의 객체 리터럴을 만들더라도 깨지지 않도록 optional로 둔다.
  sosok?: string | number;
  type: string | null; // "ST" = 일반주. ETF/ETN은 별도 API라 보통 섞이지 않지만 방어적으로 확인한다.
  manageStatusGb: string; // "0" 정상, "1" 관리종목
  tradeStopYn: "Y" | "N";
  marketAlertType: string; // "00" 없음, "01"/"02"/"03" 투자유의/경고/위험
  // 장 상태. "CLOSE"면 장이 닫혀 있고, 장중에는 다른 값이 온다(2026-10-04 확인).
  // 장 마감 후에는 휴장일과 정상 거래일이 모두 "CLOSE"라 장중에만 판정에 쓸 수 있다
  // (marketDay.ts 참고). 기존 코드가 객체 리터럴을 만들더라도 깨지지 않도록 optional.
  marketStatus?: string;
  nowPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  prevChangePrice: string;
  prevChangeRate: string;
  tradeVolume: string;
  tradeAmount: string;
  week52HighPrice: string;
  week52LowPrice: string;
  listedDate: string;
  marketSum: string; // 시가총액 (원). orderType과 무관하게 모든 랭킹 응답에 포함된다(2026-09-30 실 확인).
}

export type RankingOrderType =
  | "marketSum"
  | "quantTop"
  | "priceTop"
  | "up"
  | "flat"
  | "down"
  | "upperLimit"
  | "lowerLimit"
  | "upperQuantTop"
  | "lowerQuantTop"
  | "high52week"
  | "low52week"
  | "frgnRate"
  | "tradeStopYn"
  | "marketAlertType"
  | "statusTag"
  | "newStock";

async function fetchRanking(
  orderType: RankingOrderType,
  opts: { pageSize?: number; startIdx?: number; marketType?: string; alertType?: "01" | "02" | "03" } = {}
): Promise<NaverStockRow[]> {
  const { pageSize = 100, startIdx = 0, marketType = "ALL", alertType } = opts;
  const params = new URLSearchParams({
    tradeType: "KRX",
    marketType,
    orderType,
    startIdx: String(startIdx),
    pageSize: String(pageSize),
  });
  if (alertType) params.set("alertType", alertType);
  const url = `${STOCK_API_BASE}/domestic/market/stock/default?${params.toString()}`;
  return getJson<NaverStockRow[]>(url);
}

/** 전략1 1단계: 전일(직전 거래일) 상한가 종목. */
export async function getUpperLimitStocks(): Promise<NaverStockRow[]> {
  return fetchRanking("upperLimit", { pageSize: 100 });
}

/** 거래량 급증 랭킹 (전략3 1단계 후보군 산출용). */
export async function getVolumeSurgeRanking(pageSize = 100): Promise<NaverStockRow[]> {
  return fetchRanking("upperQuantTop", { pageSize });
}

/** 52주 신고가 랭킹 (전략3 2단계 후보군 산출용). */
export async function getHigh52WeekRanking(pageSize = 100): Promise<NaverStockRow[]> {
  return fetchRanking("high52week", { pageSize });
}

/** 거래량 상위 랭킹 (전략4 후보군 산출용). "급증률"이 아니라 당일 거래량 절대치 순위다. */
export async function getVolumeTopRanking(pageSize = 100): Promise<NaverStockRow[]> {
  return fetchRanking("quantTop", { pageSize });
}

/** 관리종목 목록 (유니버스 제외용, DESIGN.md §5). */
export async function getManagementStocks(): Promise<NaverStockRow[]> {
  return fetchRanking("statusTag", { pageSize: 200 });
}

/** 거래정지 종목 목록 (유니버스 제외용). */
export async function getTradingHaltStocks(): Promise<NaverStockRow[]> {
  return fetchRanking("tradeStopYn", { pageSize: 200 });
}

/**
 * 투자유의/경고/위험 종목 (신용거래 불가 종목의 근사치로 사용, DESIGN.md §12 미결 항목).
 * 신용거래 가능 여부를 직접 제공하는 공개 API를 찾지 못해, 투자위험 지정 종목을
 * 대리 지표로 제외한다. 정확한 신용거래 가능 여부가 필요하면 증권사 API 연동이 필요하다.
 */
export async function getInvestmentAlertStocks(): Promise<NaverStockRow[]> {
  const [alert, warning, risk] = await Promise.all([
    fetchRanking("marketAlertType", { pageSize: 200, alertType: "01" }),
    fetchRanking("marketAlertType", { pageSize: 200, alertType: "02" }),
    fetchRanking("marketAlertType", { pageSize: 200, alertType: "03" }),
  ]);
  return [...alert, ...warning, ...risk];
}

export interface NaverThemeRow {
  no: string;
  name: string;
  changeRate: string;
  totalCnt: string;
}

export async function getThemeList(): Promise<NaverThemeRow[]> {
  // pageSize 최대값이 200이다(그 이상은 400 에러). 2026-09-28 실제 확인.
  return getJson<NaverThemeRow[]>(
    `${STOCK_API_BASE}/domestic/market/theme/list?startIdx=0&pageSize=200&sortType=changeRate`
  );
}

/** 테마 이름에 keyword가 포함된 모든 테마의 구성 종목을 모아 중복 제거해 반환한다. */
export async function getStocksByThemeKeyword(keyword: string): Promise<NaverStockRow[]> {
  const themes = await getThemeList();
  const matched = themes.filter((t) => t.name.includes(keyword));
  const results = await Promise.all(
    matched.map((t) =>
      getJson<NaverStockRow[]>(
        `${STOCK_API_BASE}/domestic/market/theme/${t.no}/stocklist?marketType=ALL&orderType=quantTop&startIdx=0&pageSize=100`
      ).catch(() => [] as NaverStockRow[])
    )
  );
  const byCode = new Map<string, NaverStockRow>();
  for (const list of results) {
    for (const row of list) byCode.set(row.itemcode, row);
  }
  return [...byCode.values()];
}

/** 종목별 기관/외국인/개인 순매수 일별 추이. */
export interface NaverTrendRow {
  itemCode: string;
  bizdate: string; // YYYYMMDD
  organPureBuyQuant: string; // 기관 순매수 수량 (음수 가능)
  foreignerPureBuyQuant: string;
  individualPureBuyQuant: string;
  closePrice: string;
  tradeVolume: string;
}

export async function getInstitutionalTrend(code: string, days = 15): Promise<NaverTrendRow[]> {
  return getJson<NaverTrendRow[]>(
    `${STOCK_API_BASE}/domestic/detail/${code}/trend?tradeType=KRX&startIdx=0&pageSize=${days}`
  );
}

/** 종목코드로 종목명을 조회한다 (종목 상세 페이지 제목 등에 사용). */
export async function getStockName(code: string): Promise<string | null> {
  const data = await getJson<{ datas?: { itemCode: string; stockName: string }[] }>(
    `${STOCK_API_BASE}/polling/domestic/stock?itemCodes=${code}`
  );
  return data.datas?.[0]?.stockName ?? null;
}

/** 일봉 캔들 1건. */
export interface Candle {
  date: string; // YYYYMMDD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = "day" | "week" | "month";

// timeframe별 캔들 1개가 차지하는 평균 달력일 수(휴장일 감안 여유 포함) — 원하는
// 캔들 개수(count)만큼 확보하려면 대략 며칠 전부터 조회해야 하는지 역산하는 데 쓴다.
const CALENDAR_DAYS_PER_BAR: Record<Timeframe, number> = { day: 2.2, week: 8, month: 32 };

function parseSiseJson(raw: string): Candle[] {
  // 응답이 JS 배열 리터럴 텍스트로 온다 (JSON이 아님): [['날짜',...], ["20260901", 100, ...], ...]
  // 일부 종목/기간 조합에서 행 끝에 후행 콤마(",]")가 섞여 와 JSON.parse가 실패하는
  // 사례가 실제로 확인되어(2026-09-28), 파싱 전에 후행 콤마를 제거해 방어한다.
  const cleaned = raw.replace(/'/g, '"').replace(/,(\s*[\]}])/g, "$1");
  const rows = JSON.parse(cleaned) as (string | number)[][];
  return rows
    .slice(1)
    .filter((r) => Array.isArray(r) && r.length >= 6)
    .map((r) => ({
      date: String(r[0]),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
    }));
}

async function getSiseJsonCandles(symbol: string, count: number, timeframe: Timeframe): Promise<Candle[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - Math.ceil(count * CALENDAR_DAYS_PER_BAR[timeframe]));
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const url = `${LEGACY_CHART_BASE}/siseJson.naver?symbol=${symbol}&requestType=1&startTime=${fmt(
    start
  )}&endTime=${fmt(end)}&timeframe=${timeframe}`;
  const res = await fetch(url, { headers: COMMON_HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`네이버 캔들 API 호출 실패 (${res.status}): ${symbol}`);
  const raw = await res.text();
  const candles = parseSiseJson(raw);
  return candles.slice(-count);
}

/** 종목 캔들 (최근 N개). timeframe으로 일봉/주봉/월봉을 전환한다(네이버 API가 직접 집계해서 준다). */
export async function getStockCandles(code: string, count = 90, timeframe: Timeframe = "day"): Promise<Candle[]> {
  return getSiseJsonCandles(code, count, timeframe);
}

/** 지수 일봉 (KOSPI | KOSDAQ). */
export async function getIndexCandles(index: "KOSPI" | "KOSDAQ", days = 90): Promise<Candle[]> {
  return getSiseJsonCandles(index, days, "day");
}

export function toStockQuote(row: NaverStockRow) {
  return {
    code: row.itemcode,
    name: row.itemname,
    price: Number(row.nowPrice),
    changeRate: Number(row.prevChangeRate),
    volume: Number(row.tradeVolume),
    tradingValue: Number(row.tradeAmount),
  };
}
