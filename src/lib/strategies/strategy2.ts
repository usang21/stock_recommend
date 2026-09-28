import { getIndexCandles, getStockCandles, getStocksByThemeKeyword, toStockQuote } from "@/lib/dataSources/naver";
import { buildExcludedUniverse, filterUniverse } from "./universe";
import { hasGoldenCross, isCloseAboveMA, hasBigBullishCandle, isDeviationWithin } from "./indicators";
import { mapWithConcurrency } from "@/lib/concurrency";
import type { Strategy2Params } from "./defaultParams";
import type { FunnelStepResult, PickWithMaterial, StrategyRunResult } from "./types";

const FETCH_CONCURRENCY = 6;

/**
 * 전략2 — 강세장 + 테마 + 장대양봉 + 이격도 (DESIGN.md §3).
 *
 * DESIGN.md의 1단계(강세장 확인)는 개별 종목을 거르는 단계가 아니라 코스피
 * 지수 전체에 대한 시장 상태 게이트다. 강세장이 아니면 이 전략은 그날 후보를
 * 내지 않는다(모든 단계 0종목). 강세장이면 그 게이트를 통과한 뒤 시대중심주
 * 테마 종목 전체를 1단계 결과로 삼아 이후 장대양봉/이격도로 좁혀간다.
 * 지수는 KOSPI를 기준으로 한다(DESIGN.md에 지수 종류가 명시되지 않아 채택한 가정).
 */
export async function runStrategy2(params: Strategy2Params): Promise<StrategyRunResult> {
  const indexCandles = await getIndexCandles(
    "KOSPI",
    Math.max(params.goldenCrossLongPeriod + 5, 90)
  );
  const indexCloses = indexCandles.map((c) => c.close);
  const marketBullish =
    hasGoldenCross(indexCloses, params.goldenCrossShortPeriod, params.goldenCrossLongPeriod) &&
    isCloseAboveMA(indexCloses, params.goldenCrossLongPeriod);

  let step1Picks: PickWithMaterial[] = [];
  if (marketBullish) {
    const universe = await buildExcludedUniverse();
    const themeRowLists = await Promise.all(params.themeKeywords.map((k) => getStocksByThemeKeyword(k)));
    const byCode = new Map<string, ReturnType<typeof toStockQuote>>();
    for (const rows of themeRowLists) {
      for (const row of filterUniverse(rows, universe)) {
        byCode.set(row.itemcode, toStockQuote(row));
      }
    }
    step1Picks = [...byCode.values()];
  }

  const candleLookback = Math.max(params.bigBullishLookbackDays + 5, params.maPeriod + 5, 30);
  const candlesByCode = new Map<string, Awaited<ReturnType<typeof getStockCandles>>>();
  const step2Checked = await mapWithConcurrency(step1Picks, FETCH_CONCURRENCY, async (pick) => {
    const candles = await getStockCandles(pick.code, candleLookback).catch(() => []);
    candlesByCode.set(pick.code, candles);
    return hasBigBullishCandle(candles, params.bigBullishLookbackDays, params.bigBullishCandleMinBodyPct)
      ? pick
      : null;
  });
  const step2Picks: PickWithMaterial[] = step2Checked.filter((p): p is PickWithMaterial => p != null);

  const step3Picks: PickWithMaterial[] = step2Picks.filter((pick) => {
    const candles = candlesByCode.get(pick.code) ?? [];
    return isDeviationWithin(candles, params.maPeriod, params.maDeviationMaxPct);
  });

  const steps: FunnelStepResult[] = [
    {
      stepIndex: 1,
      stepName: marketBullish
        ? `강세장 확인 통과 + 테마(${params.themeKeywords.join("/")}) 종목`
        : "강세장 확인 실패 (지수 골든크로스 또는 60일선 상회 조건 미충족)",
      isFinal: false,
      picks: step1Picks,
    },
    {
      stepIndex: 2,
      stepName: `최근 ${params.bigBullishLookbackDays}일 이내 장대양봉`,
      isFinal: false,
      picks: step2Picks,
    },
    {
      stepIndex: 3,
      stepName: `${params.maPeriod}일선 이격도 ${params.maDeviationMaxPct}% 이내`,
      isFinal: true,
      picks: step3Picks,
    },
  ];

  return {
    strategyKey: "strategy2",
    strategyName: "강세장 + 테마 + 장대양봉 + 이격도",
    paramsSnapshot: { ...params, marketBullish },
    steps,
  };
}
