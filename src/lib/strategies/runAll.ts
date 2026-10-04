import { prisma } from "@/lib/prisma";
import { sendReportReadyEmail } from "@/lib/email";
import { runStrategy1 } from "./strategy1";
import { runStrategy2 } from "./strategy2";
import { runStrategy3 } from "./strategy3";
import { runStrategy4 } from "./strategy4";
import {
  DEFAULT_STRATEGY1_PARAMS,
  DEFAULT_STRATEGY2_PARAMS,
  DEFAULT_STRATEGY3_PARAMS,
  DEFAULT_STRATEGY4_PARAMS,
  STRATEGY_DEFS,
  type StrategyKey,
} from "./defaultParams";
import type { StrategyRunResult } from "./types";

const RETENTION_DAYS = 30; // DESIGN.md §9

async function loadParams<T>(strategyKey: StrategyKey, fallback: T): Promise<T> {
  const row = await prisma.strategyParams.findUnique({ where: { strategyKey } });
  if (!row) {
    await prisma.strategyParams.create({ data: { strategyKey, paramsJson: fallback as object } });
    return fallback;
  }
  return { ...fallback, ...(row.paramsJson as object) };
}

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function persistStrategyResult(reportRunId: string, result: StrategyRunResult) {
  const strategyResult = await prisma.strategyResult.create({
    data: {
      reportRunId,
      strategyKey: result.strategyKey,
      strategyName: result.strategyName,
      paramsSnapshot: result.paramsSnapshot as object,
    },
  });

  for (const step of result.steps) {
    const funnelStep = await prisma.funnelStep.create({
      data: {
        strategyResultId: strategyResult.id,
        stepIndex: step.stepIndex,
        stepName: step.stepName,
        isFinal: step.isFinal,
      },
    });
    if (step.picks.length === 0) continue;
    await prisma.stockPick.createMany({
      data: step.picks.map((p) => ({
        funnelStepId: funnelStep.id,
        stockCode: p.code,
        stockName: p.name,
        price: Math.round(p.price),
        changeRate: p.changeRate,
        volume: BigInt(Math.round(p.volume)),
        tradingValue: BigInt(Math.round(p.tradingValue)),
        materialVerdict: p.material?.verdict,
        materialSummary: p.material?.summary,
        materialSources: p.material ? (p.material.sources as object) : undefined,
        institutionalMeetsThreshold: p.institutional?.meetsThreshold,
        institutionalBuyDaysCount: p.institutional?.buyDaysCount,
        institutionalWindowDays: p.institutional?.windowDays,
        institutionalMinBuyDays: p.institutional?.minBuyDays,
        institutionalDays: p.institutional ? (p.institutional.days as object) : undefined,
        newHighLabel: p.newHighLabel,
      })),
    });
  }
}

async function cleanupOldReports() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  await prisma.reportRun.deleteMany({ where: { runDate: { lt: cutoff } } });
}

/** 하루치 리포트를 생성한다: 전략 1~3 실행 -> DB 저장 -> 보관기간 정리 -> 이메일 알림. */
export async function generateDailyReport(): Promise<{ reportRunId: string; status: string }> {
  const runDate = todayDateOnly();

  const existing = await prisma.reportRun.findUnique({ where: { runDate } });
  if (existing) {
    await prisma.strategyResult.deleteMany({ where: { reportRunId: existing.id } });
  }

  const reportRun = existing
    ? await prisma.reportRun.update({
        where: { id: existing.id },
        data: { status: "running", errorMessage: null },
      })
    : await prisma.reportRun.create({ data: { runDate, status: "running" } });

  const params1 = await loadParams("strategy1", DEFAULT_STRATEGY1_PARAMS);
  const params2 = await loadParams("strategy2", DEFAULT_STRATEGY2_PARAMS);
  const params3 = await loadParams("strategy3", DEFAULT_STRATEGY3_PARAMS);
  const params4 = await loadParams("strategy4", DEFAULT_STRATEGY4_PARAMS);

  const runners: [StrategyKey, () => Promise<StrategyRunResult>][] = [
    ["strategy1", () => runStrategy1(params1)],
    ["strategy2", () => runStrategy2(params2)],
    ["strategy3", () => runStrategy3(params3)],
    ["strategy4", () => runStrategy4(params4)],
  ];

  const errors: string[] = [];
  for (const [key, run] of runners) {
    try {
      const result = await run();
      await persistStrategyResult(reportRun.id, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${STRATEGY_DEFS[key].name}: ${message}`);
    }
  }

  const status = errors.length === 0 ? "success" : errors.length === runners.length ? "failed" : "partial";
  await prisma.reportRun.update({
    where: { id: reportRun.id },
    data: { status, errorMessage: errors.length > 0 ? errors.join("\n") : null },
  });

  await cleanupOldReports();

  await sendReportReadyEmail(runDate).catch((err) => {
    console.error("리포트 완료 이메일 발송 실패:", err);
  });

  // 카카오톡 알림은 여기서 보내지 않는다. 리포트가 끝나도 최종 추천(§13)이 아직
  // 남아 있어, 이 시점에 알리면 받는 사람이 들어가도 최종 추천이 비어 있다. 하루
  // 일과의 마지막인 최종 추천 cron이 끝난 뒤 한 번만 보낸다
  // (src/app/api/cron/final-recommendation/route.ts).

  return { reportRunId: reportRun.id, status };
}
