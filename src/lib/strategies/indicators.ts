import type { Candle } from "@/lib/dataSources/naver";

export function sma(values: number[], period: number, endIndex: number): number | null {
  if (endIndex - period + 1 < 0) return null;
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i++) sum += values[i];
  return sum / period;
}

/** 종가 배열에서 단기선이 장기선을 상향 돌파했는지(골든크로스) 마지막 시점 기준으로 확인. */
export function hasGoldenCross(closes: number[], shortPeriod: number, longPeriod: number): boolean {
  const last = closes.length - 1;
  if (last < longPeriod) return false;
  const shortNow = sma(closes, shortPeriod, last);
  const longNow = sma(closes, longPeriod, last);
  const shortPrev = sma(closes, shortPeriod, last - 1);
  const longPrev = sma(closes, longPeriod, last - 1);
  if (shortNow == null || longNow == null || shortPrev == null || longPrev == null) return false;
  return shortPrev <= longPrev && shortNow > longNow;
}

export function isCloseAboveMA(closes: number[], period: number): boolean {
  const last = closes.length - 1;
  const ma = sma(closes, period, last);
  if (ma == null) return false;
  return closes[last] > ma;
}

/** 최근 lookbackDays 이내에 장대양봉(몸통 비율 >= minBodyPct%)이 있었는지. */
export function hasBigBullishCandle(candles: Candle[], lookbackDays: number, minBodyPct: number): boolean {
  const recent = candles.slice(-lookbackDays);
  return recent.some((c) => c.open > 0 && ((c.close - c.open) / c.open) * 100 >= minBodyPct);
}

/** 종가와 N일 이동평균의 이격도(%)가 maxPct 이내인지. */
export function isDeviationWithin(candles: Candle[], period: number, maxPct: number): boolean {
  const closes = candles.map((c) => c.close);
  const last = closes.length - 1;
  const ma = sma(closes, period, last);
  if (ma == null || ma === 0) return false;
  const deviation = (Math.abs(closes[last] - ma) / ma) * 100;
  return deviation <= maxPct;
}

/** 최근 lookbackDays 중 하루라도 거래량이 baseline 평균의 multiplier배 이상이었는지. */
export function hasVolumeSurge(
  candles: Candle[],
  lookbackDays: number,
  baselinePeriod: number,
  multiplier: number
): boolean {
  if (candles.length < baselinePeriod + 1) return false;
  const volumes = candles.map((c) => c.volume);
  const recentStart = volumes.length - lookbackDays;
  for (let i = Math.max(recentStart, baselinePeriod); i < volumes.length; i++) {
    const baseline = sma(volumes, baselinePeriod, i - 1);
    if (baseline != null && baseline > 0 && volumes[i] >= baseline * multiplier) return true;
  }
  return false;
}

export function isUpTrend(candles: Candle[], maPeriod: number): boolean {
  return isCloseAboveMA(
    candles.map((c) => c.close),
    maPeriod
  );
}

/** 일봉 캔들을 월요일 시작 주 단위로 묶어 각 주의 마지막 종가를 뽑는다.
 * 진행 중인(미완성) 이번 주도 지금까지의 마지막 거래일 종가로 포함한다 —
 * 실제 주봉 차트에서 이번 주 캔들이 실시간으로 형성되는 것과 같은 방식이다. */
function toWeeklyCloses(candles: Candle[]): number[] {
  const weekStartKey = (dateStr: string): string => {
    const y = Number(dateStr.slice(0, 4));
    const m = Number(dateStr.slice(4, 6)) - 1;
    const d = Number(dateStr.slice(6, 8));
    const date = new Date(y, m, d);
    const diffToMonday = (date.getDay() + 6) % 7; // 월=0 ... 일=6
    date.setDate(date.getDate() - diffToMonday);
    return date.toISOString().slice(0, 10);
  };
  const weeks = new Map<string, number>();
  for (const c of candles) weeks.set(weekStartKey(c.date), c.close); // 같은 주는 뒤에 올수록(최신 거래일) 덮어쓴다
  return [...weeks.values()];
}

/**
 * 주봉 N주 이동평균선을 이번 주 시점에 상향 돌파했는지: 이번 주 종가는 이번 주
 * 시점 이평선보다 위, 지난주 종가는 지난주 시점 이평선 이하였는지 확인한다
 * (이평선 값 자체도 매주 갱신되므로 각 시점의 이평선과 비교한다).
 */
export function hasWeeklyMABreakout(candles: Candle[], maPeriod: number): boolean {
  const weeklyCloses = toWeeklyCloses(candles);
  const last = weeklyCloses.length - 1;
  if (last < maPeriod) return false; // 지난주 시점 이평선까지 계산하려면 최소 maPeriod+1개 주봉 필요
  const maNow = sma(weeklyCloses, maPeriod, last);
  const maPrev = sma(weeklyCloses, maPeriod, last - 1);
  if (maNow == null || maPrev == null) return false;
  return weeklyCloses[last - 1] <= maPrev && weeklyCloses[last] > maNow;
}

/** 최근 N거래일 평균 거래량(주). */
export function avgRecentVolume(candles: Candle[], days: number): number {
  const recent = candles.slice(-days);
  if (recent.length === 0) return 0;
  return recent.reduce((sum, c) => sum + c.volume, 0) / recent.length;
}

/** 최근 N거래일 평균 거래대금(원). 일별 거래대금 원본이 없어 거래량×종가로 근사한다. */
export function avgRecentTradingValue(candles: Candle[], days: number): number {
  const recent = candles.slice(-days);
  if (recent.length === 0) return 0;
  return recent.reduce((sum, c) => sum + c.volume * c.close, 0) / recent.length;
}

/**
 * 보유한 캔들 범위 내에서의 최고가 경신 여부.
 * "역사적 신고가"의 정확한 판정에는 상장 이후 전체 시세가 필요하지만,
 * 실용적으로 긴 기간(예: 10년치)의 캔들을 조회해 그 범위 내 최고가 경신으로 근사한다.
 * 종목의 실제 역사가 이보다 길면 과거의 더 높은 고가를 놓칠 수 있다.
 */
export function isHighInRange(candles: Candle[]): boolean {
  if (candles.length === 0) return false;
  const lastClose = candles[candles.length - 1].close;
  const maxHigh = Math.max(...candles.map((c) => c.high));
  return lastClose >= maxHigh;
}
