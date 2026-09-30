import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const include = { picks: { include: { outcome: true } } } as const;

/** 최근 추천 성과 섹션에 쓸 과거 추천 기록을 가져올 범위(일). */
const RECENT_OUTCOME_DAYS = 21;

/** date는 "latest" 또는 "YYYY-MM-DD". */
export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;

  const run =
    date === "latest"
      ? await prisma.finalRecommendationRun.findFirst({ orderBy: { runDate: "desc" }, include })
      : await prisma.finalRecommendationRun.findUnique({ where: { runDate: new Date(date) }, include });

  if (!run) {
    return NextResponse.json({ error: "종합 추천 결과를 찾을 수 없습니다." }, { status: 404 });
  }

  const since = new Date();
  since.setDate(since.getDate() - RECENT_OUTCOME_DAYS);
  const pastPicks = await prisma.recommendationPick.findMany({
    where: { isRecommended: true, recommendedAt: { gte: since }, runId: { not: run.id } },
    include: { outcome: true },
    orderBy: [{ recommendedAt: "desc" }, { rank: "asc" }],
  });

  return NextResponse.json({
    runDate: run.runDate.toISOString().slice(0, 10),
    status: run.status,
    errorMessage: run.errorMessage,
    criteriaVersion: run.criteriaVersion,
    lessonVersion: run.lessonVersion,
    recommendations: run.picks
      .filter((p) => p.isRecommended)
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
      .map((p) => ({
        rank: p.rank,
        code: p.stockCode,
        name: p.stockName,
        reason: p.reason,
        basePrice: p.basePrice,
        strategyKeys: p.strategyKeys,
      })),
    excluded: run.picks
      .filter((p) => !p.isRecommended)
      .map((p) => ({ code: p.stockCode, name: p.stockName, reason: p.reason })),
    recentOutcomes: pastPicks.map((p) => ({
      recommendedAt: p.recommendedAt.toISOString().slice(0, 10),
      rank: p.rank,
      code: p.stockCode,
      name: p.stockName,
      reason: p.reason,
      basePrice: p.basePrice,
      strategyKeys: p.strategyKeys,
      outcome: p.outcome
        ? {
            tradingDays: p.outcome.tradingDays,
            currentPrice: p.outcome.currentPrice,
            changeRate: p.outcome.changeRate,
            verdict: p.outcome.verdict,
            analysis: p.outcome.analysis,
          }
        : null,
    })),
  });
}
