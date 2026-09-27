import { Prisma } from "@prisma/client";

type ReportRunWithRelations = Prisma.ReportRunGetPayload<{
  include: {
    strategyResults: {
      include: {
        steps: {
          include: { picks: true };
        };
      };
    };
  };
}>;

/** BigInt 등 JSON으로 바로 직렬화되지 않는 값을 안전한 형태로 변환한다. */
export function serializeReportRun(report: ReportRunWithRelations) {
  return {
    id: report.id,
    runDate: report.runDate.toISOString().slice(0, 10),
    status: report.status,
    errorMessage: report.errorMessage,
    createdAt: report.createdAt.toISOString(),
    strategyResults: report.strategyResults.map((sr) => ({
      strategyKey: sr.strategyKey,
      strategyName: sr.strategyName,
      paramsSnapshot: sr.paramsSnapshot,
      steps: sr.steps
        .sort((a, b) => a.stepIndex - b.stepIndex)
        .map((step) => ({
          stepIndex: step.stepIndex,
          stepName: step.stepName,
          isFinal: step.isFinal,
          picks: step.picks.map((p) => ({
            code: p.stockCode,
            name: p.stockName,
            price: p.price,
            changeRate: p.changeRate,
            volume: p.volume != null ? Number(p.volume) : null,
            tradingValue: p.tradingValue != null ? Number(p.tradingValue) : null,
            materialVerdict: p.materialVerdict,
            materialSummary: p.materialSummary,
            materialSources: p.materialSources,
            institutionalMeetsThreshold: p.institutionalMeetsThreshold,
            institutionalBuyDaysCount: p.institutionalBuyDaysCount,
            institutionalWindowDays: p.institutionalWindowDays,
            institutionalMinBuyDays: p.institutionalMinBuyDays,
            institutionalDays: p.institutionalDays,
            newHighLabel: p.newHighLabel,
          })),
        })),
    })),
  };
}

export type SerializedReport = ReturnType<typeof serializeReportRun>;
