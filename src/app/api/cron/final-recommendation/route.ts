import { NextRequest, NextResponse } from "next/server";
import { generateFinalRecommendation } from "@/lib/recommendation/run";
import { notifyFinalRecommendation } from "@/lib/recommendation/notify";
import { shouldRunToday } from "@/lib/marketDay";

// 리포트 생성과 별도의 실행이므로 시간 예산도 따로 쓴다 (DESIGN.md §13
// "실행 시간 침범 금지"). Vercel Hobby 플랜 최댓값.
export const maxDuration = 300;

/**
 * Vercel Cron이 리포트 생성 cron 이후에 호출한다. vercel.json 참고.
 *
 * 하루 일과의 마지막 실행이므로 카카오톡 알림도 여기서 보낸다 (DESIGN.md §7).
 * 알림 코드를 `generateFinalRecommendation()` 안이 아니라 이 라우트에 두는 이유는,
 * 그 함수를 알림이 필요 없는 경로에서도 쓸 수 있어야 하기 때문이다.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 휴장일(국경일·임시공휴일 포함)에는 아무것도 실행하지 않는다 (DESIGN.md §15).
  // 판정은 13시 cron이 장중에 남긴 기록을 읽는다 — 장 마감 후에는 휴장일과 정상
  // 거래일을 구분할 수 없기 때문이다. 알림보다 앞에 두어 휴장일에는 카카오톡도
  // 가지 않게 한다.
  const verdict = await shouldRunToday();
  if (!verdict.run) {
    return NextResponse.json({
      status: "skipped",
      reason: "non-trading-day",
      marketStatus: verdict.marketStatus,
    });
  }

  const result = await generateFinalRecommendation();
  await notifyFinalRecommendation(result);

  return NextResponse.json({ ...result, marketDayCheck: verdict.reason });
}
