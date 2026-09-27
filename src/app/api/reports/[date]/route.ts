import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeReportRun } from "@/lib/serializeReport";

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
  return NextResponse.json(serializeReportRun(report));
}
