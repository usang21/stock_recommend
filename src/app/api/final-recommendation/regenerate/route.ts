import { NextResponse } from "next/server";
import { generateFinalRecommendation } from "@/lib/recommendation/run";

export const maxDuration = 300;

/** 사용자가 대시보드에서 "종합 추천 다시 실행"을 누르면 즉시 재실행한다. */
export async function POST() {
  const result = await generateFinalRecommendation();
  return NextResponse.json(result);
}
