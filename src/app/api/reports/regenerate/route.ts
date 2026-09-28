import { NextResponse } from "next/server";
import { generateDailyReport } from "@/lib/strategies/runAll";

// generate-report/route.ts와 동일한 이유로 여유를 크게 잡는다.
export const maxDuration = 800;

/** 사용자가 웹페이지에서 "리포트 재생성" 버튼을 누르면 즉시 재실행한다 (DESIGN.md §7). */
export async function POST() {
  const result = await generateDailyReport();
  return NextResponse.json(result);
}
