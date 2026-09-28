import { NextRequest, NextResponse } from "next/server";
import { generateDailyReport } from "@/lib/strategies/runAll";

// Gemini 무료 티어 분당 5회 제한 때문에 전략1이 상한가 종목 수 × 약 12.5초로
// 늘어질 수 있어(2026-09-28 12종목 기준 약 5분40초 실측) 여유를 크게 잡는다.
export const maxDuration = 800;

/** Vercel Cron이 매일 정규장 마감 후 호출한다 (DESIGN.md §7). vercel.json 참고. */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await generateDailyReport();
  return NextResponse.json(result);
}
