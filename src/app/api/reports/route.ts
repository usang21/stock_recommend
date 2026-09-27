import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** 히스토리 조회용 리포트 날짜 목록 (DESIGN.md §6, §9: 최근 1개월). */
export async function GET() {
  const reports = await prisma.reportRun.findMany({
    orderBy: { runDate: "desc" },
    select: { id: true, runDate: true, status: true, createdAt: true },
  });
  return NextResponse.json(
    reports.map((r) => ({
      id: r.id,
      runDate: r.runDate.toISOString().slice(0, 10),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }))
  );
}
