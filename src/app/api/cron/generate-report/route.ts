import { NextRequest, NextResponse } from "next/server";
import { generateDailyReport } from "@/lib/strategies/runAll";

export const maxDuration = 300; // 스크래핑 + Claude 판단 포함, 넉넉히 설정

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
