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
