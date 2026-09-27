import {
  getInstitutionalTrend,
  getStockCandles,
  getVolumeSurgeRanking,
  toStockQuote,
} from "@/lib/dataSources/naver";
import { buildExcludedUniverse, filterUniverse } from "./universe";
import { hasVolumeSurge, isHighInRange, isUpTrend } from "./indicators";
import { mapWithConcurrency } from "@/lib/concurrency";
import type { Strategy3Params } from "./defaultParams";
import type { FunnelStepResult, PickWithMaterial, StrategyRunResult } from "./types";

const ALL_TIME_HIGH_LOOKBACK_DAYS = 3650; // 약 10년치, "역사적 신고가"의 실용적 근사(indicators.ts 주석 참고)
const SHORT_HIGH_LOOKBACK_DAYS = 20;
const MID_HIGH_LOOKBACK_DAYS = 60;
const FETCH_CONCURRENCY = 6;

/**
 * 전략3 — 거래량 급증 + 신고가 + 기관수급 + 상승추세 (DESIGN.md §3).
 * 1단계 후보군은 네이버 "거래량 급증" 랭킹(당일 기준) 상위 종목으로 좁힌 뒤,
 * 각 종목의 최근 캔들로 지정 기간 내 실제 거래량 급증(배수) 여부를 재확인한다.
 * 전체 시장(약 2,500종목)을 매일 스캔하는 대신 이 랭킹을 1차 필터로 사용해
 * API 호출량을 실용적인 수준으로 유지한다.
 */
export async function runStrategy3(params: Strategy3Params): Promise<StrategyRunResult> {
  const universe = await buildExcludedUniverse();
  const rankingRows = await getVolumeSurgeRanking(100);
  const candidateRows = filterUniverse(rankingRows, universe);

  const candlesByCode = new Map<string, Awaited<ReturnType<typeof getStockCandles>>>();
  const step1Checked = await mapWithConcurrency(candidateRows, FETCH_CONCURRENCY, async (row) => {
    const candles = await getStockCandles(
      row.itemcode,
      params.volumeBaselinePeriod + params.volumeSurgeLookbackDays + 5
    );
    candlesByCode.set(row.itemcode, candles);
    const surged = hasVolumeSurge(
      candles,
      params.volumeSurgeLookbackDays,
      params.volumeBaselinePeriod,
      params.volumeSurgeMultiplier
    );
    return surged ? toStockQuote(row) : null;
  });
  const step1Picks: PickWithMaterial[] = step1Checked.filter((p): p is PickWithMaterial => p != null);

  // 신고가 판정 범위를 20일/60일/52주/역사적 신고가로 넓힌다. 짧은 기간부터
  // 확인해 대부분의 경우 비싼 10년치 캔들 조회(역사적 신고가)까지 가지 않도록 한다.
  const step2Checked = await mapWithConcurrency(step1Picks, FETCH_CONCURRENCY, async (pick): Promise<PickWithMaterial | null> => {
    const row = candidateRows.find((r) => r.itemcode === pick.code)!;

    let midCandles = candlesByCode.get(pick.code);
    if (!midCandles || midCandles.length < MID_HIGH_LOOKBACK_DAYS) {
      midCandles = await getStockCandles(pick.code, MID_HIGH_LOOKBACK_DAYS + 5);
      candlesByCode.set(pick.code, midCandles);
    }

    let newHighLabel: string | null = null;
    if (isHighInRange(midCandles.slice(-SHORT_HIGH_LOOKBACK_DAYS))) {
      newHighLabel = `${SHORT_HIGH_LOOKBACK_DAYS}일 신고가`;
    } else if (isHighInRange(midCandles.slice(-MID_HIGH_LOOKBACK_DAYS))) {
      newHighLabel = `${MID_HIGH_LOOKBACK_DAYS}일 신고가`;
    } else if (Number(row.nowPrice) >= Number(row.week52HighPrice)) {
      newHighLabel = "52주 신고가";
    } else {
      const longCandles = await getStockCandles(pick.code, ALL_TIME_HIGH_LOOKBACK_DAYS);
      if (isHighInRange(longCandles)) newHighLabel = "역사적 신고가";
    }

    return newHighLabel ? { ...pick, newHighLabel } : null;
  });
  const step2Picks: PickWithMaterial[] = step2Checked.filter((p): p is PickWithMaterial => p != null);

  // 3단계는 더 이상 필터링하지 않고, 2단계를 통과한 종목 전체의 최근 수급
  // 현황을 그대로 보여준다 (기준 미달 종목도 실제 데이터를 볼 수 있도록).
  // 기준 충족 여부는 institutional.meetsThreshold로 표시만 하고, 실제 필터링은
  // 4단계(상승추세)에서 수급 기준과 함께 한 번에 적용한다.
  const step3Picks: PickWithMaterial[] = await mapWithConcurrency(step2Picks, FETCH_CONCURRENCY, async (pick) => {
    const trend = await getInstitutionalTrend(pick.code, params.institutionalWindowDays + 5);
    const recentDays = trend.slice(0, params.institutionalWindowDays);
    const buyDaysCount = recentDays.filter((t) => Number(t.organPureBuyQuant) > 0).length;
    return {
      ...pick,
      institutional: {
        meetsThreshold: buyDaysCount >= params.institutionalMinBuyDays,
        buyDaysCount,
        windowDays: params.institutionalWindowDays,
        minBuyDays: params.institutionalMinBuyDays,
        days: recentDays.map((t) => ({
          date: t.bizdate,
          organNetBuy: Number(t.organPureBuyQuant),
          foreignerNetBuy: Number(t.foreignerPureBuyQuant),
        })),
      },
    };
  });

  const step4Checked = await mapWithConcurrency(step3Picks, FETCH_CONCURRENCY, async (pick) => {
    if (!pick.institutional?.meetsThreshold) return null;
    const candles = candlesByCode.get(pick.code) ?? (await getStockCandles(pick.code, params.maPeriod + 5));
    return isUpTrend(candles, params.maPeriod) ? pick : null;
  });
  const step4Picks: PickWithMaterial[] = step4Checked.filter((p): p is PickWithMaterial => p != null);

  const steps: FunnelStepResult[] = [
    {
      stepIndex: 1,
      stepName: `최근 ${params.volumeSurgeLookbackDays}일 이내 평소 대비 ${params.volumeSurgeMultiplier}배 이상 거래량`,
      isFinal: false,
      picks: step1Picks,
    },
    {
      stepIndex: 2,
      stepName: "20일/60일/52주 신고가 또는 역사적 신고가",
      isFinal: false,
      picks: step2Picks,
    },
    {
      stepIndex: 3,
      stepName: `최근 ${params.institutionalWindowDays}거래일 기관/외국인 수급 현황 (기준: ${params.institutionalMinBuyDays}일 이상 순매수)`,
      isFinal: false,
      picks: step3Picks,
    },
    {
      stepIndex: 4,
      stepName: `기관수급 기준 충족 + 상승추세 (${params.maPeriod}일선 위)`,
      isFinal: true,
      picks: step4Picks,
    },
  ];

  return {
    strategyKey: "strategy3",
    strategyName: "거래량 급증 + 신고가 + 기관수급 + 상승추세",
    paramsSnapshot: { ...params },
    steps,
  };
}
