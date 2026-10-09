/**
 * 최종 추천 실행 (DESIGN.md §13).
 *
 * 기존 리포트 생성(runAll.ts)과 완전히 분리된 실행이다. 리포트가 DB에 저장해둔
 * 결과를 읽기만 하고, 리포트 쪽 테이블이나 로직은 건드리지 않는다. 여기서 무슨
 * 일이 생겨도 리포트의 status에는 영향이 없다.
 *
 * 순서: 피드백 루프(과거 추천 판정/분석) → 후보 수집 → 추천 생성 → 저장.
 * 피드백 루프를 먼저 도는 이유는, 이번 추천이 방금 얻은 학습 기록까지 반영해야
 * 하기 때문이다(closed loop).
 */
import { prisma } from "@/lib/prisma";
import { reviewPastRecommendations } from "./outcomeReview";
import { recommendFinalPicks, type Candidate } from "./recommendAgent";

export interface FinalRecommendationRunResult {
  status: "success" | "failed" | "skipped";
  runDate: string;
  recommendedCount?: number;
  excludedCount?: number;
  review?: Awaited<ReturnType<typeof reviewPastRecommendations>>;
  message?: string;
}

const reportInclude = {
  strategyResults: { include: { steps: { include: { picks: true } } } },
} as const;

type ReportWithResults = NonNullable<
  Awaited<ReturnType<typeof prisma.reportRun.findFirst<{ include: typeof reportInclude }>>>
>;

/** 전략별 최종 단계 통과 종목을 종목코드 기준으로 합친다. */
function collectCandidates(report: ReportWithResults): Candidate[] {
  const byCode = new Map<string, Candidate>();

  for (const result of report.strategyResults) {
    const finalStep = result.steps.find((s) => s.isFinal);
    if (!finalStep) continue;

    for (const pick of finalStep.picks) {
      const existing = byCode.get(pick.stockCode);
      if (existing) {
        existing.strategyKeys.push(result.strategyKey);
        // 전략마다 채우는 부가 정보가 달라, 먼저 들어온 쪽에 없는 값만 채운다.
        existing.materialVerdict ??= pick.materialVerdict;
        existing.materialSummary ??= pick.materialSummary;
        existing.newHighLabel ??= pick.newHighLabel;
        existing.institutionalSummary ??= institutionalSummaryOf(pick);
        continue;
      }
      byCode.set(pick.stockCode, {
        code: pick.stockCode,
        name: pick.stockName,
        price: pick.price ?? 0,
        changeRate: pick.changeRate,
        volume: pick.volume != null ? Number(pick.volume) : null,
        tradingValue: pick.tradingValue != null ? Number(pick.tradingValue) : null,
        strategyKeys: [result.strategyKey],
        materialVerdict: pick.materialVerdict,
        materialSummary: pick.materialSummary,
        newHighLabel: pick.newHighLabel,
        institutionalSummary: institutionalSummaryOf(pick),
      });
    }
  }

  // 여러 전략을 동시에 통과한 종목이 앞에 오게 둔다 — 모델에게도 중복 통과가
  // 핵심 신호라는 점이 드러나도록.
  return [...byCode.values()]
    .filter((c) => c.price > 0)
    .sort((a, b) => b.strategyKeys.length - a.strategyKeys.length);
}

function institutionalSummaryOf(pick: {
  institutionalBuyDaysCount: number | null;
  institutionalWindowDays: number | null;
}): string | null {
  if (pick.institutionalBuyDaysCount == null || pick.institutionalWindowDays == null) return null;
  return `최근 ${pick.institutionalWindowDays}거래일 중 ${pick.institutionalBuyDaysCount}일 기관 순매수`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function generateFinalRecommendation(): Promise<FinalRecommendationRunResult> {
  const report = await prisma.reportRun.findFirst({ orderBy: { runDate: "desc" }, include: reportInclude });

  if (!report) {
    return { status: "skipped", runDate: formatDate(new Date()), message: "아직 생성된 리포트가 없습니다." };
  }
  if (report.status === "running" || report.status === "failed") {
    return {
      status: "skipped",
      runDate: formatDate(report.runDate),
      message: `리포트가 아직 준비되지 않았습니다 (status: ${report.status}).`,
    };
  }

  const runDate = report.runDate;
  const runDateLabel = formatDate(runDate);

  const existing = await prisma.finalRecommendationRun.findUnique({ where: { runDate } });
  const run = existing
    ? await prisma.finalRecommendationRun.update({
        where: { id: existing.id },
        data: { status: "running", errorMessage: null },
      })
    : await prisma.finalRecommendationRun.create({ data: { runDate, status: "running" } });

  try {
    const review = await reviewPastRecommendations(runDateLabel);

    const candidates = collectCandidates(report);
    if (candidates.length === 0) {
      // 후보가 없는 회차의 올바른 결과는 pick 0건이다. 재실행이면 여기서 지운다.
      await prisma.recommendationPick.deleteMany({ where: { runId: run.id } });
      await prisma.finalRecommendationRun.update({
        where: { id: run.id },
        data: { status: "success", errorMessage: null },
      });
      return { status: "success", runDate: runDateLabel, recommendedCount: 0, excludedCount: 0, review };
    }

    const result = await recommendFinalPicks(candidates);
    const byCode = new Map(candidates.map((c) => [c.code, c]));

    // 재실행이면 이번 회차의 추천 종목만 지우고 새 결과를 넣는다. 지우는 것과 넣는
    // 것을 한 트랜잭션으로 묶어, 중간에 실패해도 회차가 pick 없는 상태로 남지 않게
    // 한다. 과거 회차의 추천 기록(memory)은 피드백 루프의 입력이므로 건드리지 않는다.
    await prisma.$transaction([
      prisma.recommendationPick.deleteMany({ where: { runId: run.id } }),
      prisma.recommendationPick.createMany({
        data: [
          ...result.recommendations.map((r) => ({
            runId: run.id,
            rank: r.rank,
            isRecommended: true,
            stockCode: r.code,
            stockName: byCode.get(r.code)!.name,
            reason: r.reason,
            basePrice: byCode.get(r.code)!.price,
            strategyKeys: byCode.get(r.code)!.strategyKeys,
            recommendedAt: runDate,
          })),
          ...result.excluded.map((e) => ({
            runId: run.id,
            isRecommended: false,
            stockCode: e.code,
            stockName: byCode.get(e.code)!.name,
            reason: e.reason,
            basePrice: byCode.get(e.code)!.price,
            strategyKeys: byCode.get(e.code)!.strategyKeys,
            recommendedAt: runDate,
          })),
        ],
      }),
    ]);

    await prisma.finalRecommendationRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        errorMessage: null,
        criteriaVersion: result.criteriaVersion,
        lessonVersion: result.lessonVersion,
      },
    });

    return {
      status: "success",
      runDate: runDateLabel,
      recommendedCount: result.recommendations.length,
      excludedCount: result.excluded.length,
      review,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.finalRecommendationRun.update({
      where: { id: run.id },
      data: { status: "failed", errorMessage: message },
    });
    return { status: "failed", runDate: runDateLabel, message };
  }
}
