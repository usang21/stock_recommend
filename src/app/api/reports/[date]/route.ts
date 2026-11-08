import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeReportRun } from "@/lib/serializeReport";
import { computeStrategy2Streaks } from "@/lib/strategies/strategy2Streak";

const include = {
  strategyResults: { include: { steps: { include: { picks: true } } } },
} as const;

/** date는 "latest" 또는 "YYYY-MM-DD". */
export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;

  const report =
    date === "latest"
      ? await prisma.reportRun.findFirst({ orderBy: { runDate: "desc" }, include })
      : await prisma.reportRun.findUnique({ where: { runDate: new Date(date) }, include });

  if (!report) {
    return NextResponse.json({ error: "리포트를 찾을 수 없습니다." }, { status: 404 });
  }

  const serialized = serializeReportRun(report);
  const strategy2 = serialized.strategyResults.find((sr) => sr.strategyKey === "strategy2");
  const finalStep = strategy2?.steps.find((s) => s.isFinal);
  if (finalStep && finalStep.picks.length > 0) {
    const streaks = await computeStrategy2Streaks(report.runDate, finalStep.picks.map((p) => p.code));
    for (const pick of finalStep.picks) {
      pick.consecutiveDays = streaks.get(pick.code) ?? 0;
    }
  }

  return NextResponse.json(serialized);
}
