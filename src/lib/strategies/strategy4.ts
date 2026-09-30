import { getStockCandles, getVolumeTopRanking, toStockQuote } from "@/lib/dataSources/naver";
import { buildExcludedUniverse, filterUniverse, meetsMinMarketCap } from "./universe";
import { avgRecentTradingValue, avgRecentVolume, hasWeeklyMABreakout, isUpTrend } from "./indicators";
import { mapWithConcurrency } from "@/lib/concurrency";
import type { Strategy4Params } from "./defaultParams";
import type { FunnelStepResult, PickWithMaterial, StrategyRunResult } from "./types";

const FETCH_CONCURRENCY = 6;
const CANDLE_LOOKBACK_DAYS = 90; // 주봉 5주선 계산에 필요한 최소 주수(5~6주)보다 넉넉히(약 13주)

/**
 * 전략4 — 주봉 5이평선 돌파 + 거래량 + 20일선 상회.
 * 1단계 후보군은 네이버 "거래량 상위"(당일 거래량 절대치 기준) 랭킹으로 좁힌 뒤,
 * 각 종목의 일봉을 주 단위로 묶어 주봉 5주 이동평균선을 이번 주 시점에 상향
 * 돌파했는지 확인한다. 전체 시장을 매일 스캔하는 대신 이 랭킹을 1차 필터로
 * 쓴다(전략3과 동일한 실용적 근사).
 */
export async function runStrategy4(params: Strategy4Params): Promise<StrategyRunResult> {
  const universe = await buildExcludedUniverse();
  const rankingRows = await getVolumeTopRanking(100);
  const candidateRows = filterUniverse(rankingRows, universe).filter((r) =>
    meetsMinMarketCap(r, params.minMarketCap)
  );

  const candlesByCode = new Map<string, Awaited<ReturnType<typeof getStockCandles>>>();
  const step1Checked = await mapWithConcurrency(candidateRows, FETCH_CONCURRENCY, async (row) => {
    const candles = await getStockCandles(row.itemcode, CANDLE_LOOKBACK_DAYS).catch(() => []);
    candlesByCode.set(row.itemcode, candles);
    return hasWeeklyMABreakout(candles, params.weeklyMaPeriod) ? toStockQuote(row) : null;
  });
  const step1Picks: PickWithMaterial[] = step1Checked.filter((p): p is PickWithMaterial => p != null);

  const step2Picks: PickWithMaterial[] = step1Picks.filter((pick) => {
    const candles = candlesByCode.get(pick.code) ?? [];
    const avgVolume = avgRecentVolume(candles, params.volumeAvgDays);
    const avgTradingValue = avgRecentTradingValue(candles, params.volumeAvgDays);
    return avgVolume >= params.minVolume || avgTradingValue >= params.minTradingValue;
  });

  const step3Picks: PickWithMaterial[] = step2Picks.filter((pick) => {
    const candles = candlesByCode.get(pick.code) ?? [];
    return isUpTrend(candles, params.maPeriod);
  });

  const steps: FunnelStepResult[] = [
    {
      stepIndex: 1,
      stepName: `거래량 상위 종목 중 주봉 ${params.weeklyMaPeriod}주선 상향 돌파 + 시가총액 ${(
        params.minMarketCap / 100_000_000
      ).toLocaleString()}억원 이상`,
      isFinal: false,
      picks: step1Picks,
    },
    {
      stepIndex: 2,
      stepName: `최근 ${params.volumeAvgDays}거래일 평균 거래량 ${params.minVolume.toLocaleString()}주 이상 또는 거래대금 ${(
        params.minTradingValue / 100_000_000
      ).toLocaleString()}억 이상`,
      isFinal: false,
      picks: step2Picks,
    },
    {
      stepIndex: 3,
      stepName: `현재가 ${params.maPeriod}일선 위`,
      isFinal: true,
      picks: step3Picks,
    },
  ];

  return {
    strategyKey: "strategy4",
    strategyName: "주봉 5이평선 돌파 + 거래량 + 20일선 상회",
    paramsSnapshot: { ...params },
    steps,
  };
}
