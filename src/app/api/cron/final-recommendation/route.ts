import { NextRequest, NextResponse } from "next/server";
import { generateFinalRecommendation } from "@/lib/recommendation/run";

// 리포트 생성과 별도의 실행이므로 시간 예산도 따로 쓴다 (DESIGN.md §13
// "실행 시간 침범 금지"). Vercel Hobby 플랜 최댓값.
export const maxDuration = 300;

/** Vercel Cron이 리포트 생성 cron 이후에 호출한다. vercel.json 참고. */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await generateFinalRecommendation();
  return NextResponse.json(result);
}
