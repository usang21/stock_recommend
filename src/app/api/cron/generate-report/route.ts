import { NextRequest, NextResponse } from "next/server";
import { generateDailyReport } from "@/lib/strategies/runAll";

// Vercel Hobby 플랜의 최댓값(300)으로 고정 — 이보다 크게 설정하면 배포 자체가
// 거부된다. Gemini 무료 티어 분당 5회 제한 때문에 전략1이 상한가 종목 수 ×
// 약 15초로 늘어날 수 있으니(2026-09-28 실측), 상한가 종목이 아주 많은 날은
// 이 예산 안에서 일부 종목이 재료판단 실패로 표시될 수 있다(리포트 자체는
// 안 깨짐 — materialJudge.ts의 폴백 처리 참고).
export const maxDuration = 300;

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
