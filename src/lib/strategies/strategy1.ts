import { getUpperLimitStocks, toStockQuote } from "@/lib/dataSources/naver";
import { buildExcludedUniverse, filterUniverse } from "./universe";
import { judgeMaterial } from "./materialJudge";
import { mapWithConcurrency } from "@/lib/concurrency";
import type { Strategy1Params } from "./defaultParams";
import type { FunnelStepResult, PickWithMaterial, StrategyRunResult } from "./types";

const MATERIAL_JUDGE_CONCURRENCY = 4;

/**
 * 전략1 — 상한가 + 재료 + 거래량 (DESIGN.md §3).
 * 1단계: 전일 상한가 종목
 * 2단계: 재료(뉴스/공시) 판단 — 필터링하지 않고 전 종목을 호재/악재/중립으로 분류해 전부 보여준다
 *        (사람이 원문 링크를 보고 최종 판단할 수 있도록, DESIGN.md §4의 "근거와 원문을 함께
 *        표시해 사람이 확인" 취지를 반영). 악재/중립 종목도 매수 리스트에서 완전히 사라지지
 *        않고 이 단계에서 계속 조회 가능하다.
 * 3단계: 호재로 판단된 종목 중 거래량 최소치 이상만 최종 리스트로 통과
 */
export async function runStrategy1(params: Strategy1Params): Promise<StrategyRunResult> {
  const universe = await buildExcludedUniverse();
  const rawUpperLimit = await getUpperLimitStocks();
  const step1Rows = filterUniverse(rawUpperLimit, universe);
  const step1Picks: PickWithMaterial[] = step1Rows.map(toStockQuote);

  const judged = await mapWithConcurrency(step1Picks, MATERIAL_JUDGE_CONCURRENCY, async (pick) => ({
    pick,
    material: await judgeMaterial(pick.code, pick.name),
  }));
  const step2Picks: PickWithMaterial[] = judged.map((j) => ({ ...j.pick, material: j.material }));

  const step3Picks = step2Picks.filter(
    (p) =>
      p.material?.verdict === "positive" &&
      (p.volume >= params.minVolume || p.tradingValue >= params.minTradingValue)
  );

  const steps: FunnelStepResult[] = [
    { stepIndex: 1, stepName: "전일 상한가", isFinal: false, picks: step1Picks },
    { stepIndex: 2, stepName: "재료(뉴스/공시) 판단 — 호재/악재/중립", isFinal: false, picks: step2Picks },
    {
      stepIndex: 3,
      stepName: `호재 + (거래량 ${params.minVolume.toLocaleString()}주 이상 또는 거래대금 ${(
        params.minTradingValue / 100_000_000
      ).toLocaleString()}억 이상)`,
      isFinal: true,
      picks: step3Picks,
    },
  ];

  return {
    strategyKey: "strategy1",
    strategyName: "상한가 + 재료 + 거래량",
    paramsSnapshot: { ...params },
    steps,
  };
}
