import { NextRequest, NextResponse } from "next/server";
import { generateFinalRecommendation, type FinalRecommendationRunResult } from "@/lib/recommendation/run";
import { notifyAllKakaoRecipients } from "@/lib/dataSources/kakao";
import { shouldRunToday } from "@/lib/marketDay";

// 리포트 생성과 별도의 실행이므로 시간 예산도 따로 쓴다 (DESIGN.md §13
// "실행 시간 침범 금지"). Vercel Hobby 플랜 최댓값.
export const maxDuration = 300;

/**
 * 하루 일과의 마지막 실행이므로 카카오톡 알림도 여기서 보낸다.
 *
 * 리포트 생성(§7) 직후에 보내면 최종 추천이 아직 만들어지지 않아, 받은 사람이
 * 들어가도 빈 화면을 보게 된다. 그래서 알림을 이 cron 끝으로 옮겨 하루에 한 번만
 * 보낸다. 알림 코드를 `generateFinalRecommendation()` 안이 아니라 이 라우트에 두는
 * 이유는, 그 함수를 대시보드의 "다시 실행" 버튼(`/api/final-recommendation/regenerate`)도
 * 쓰기 때문이다 — 안에 넣으면 버튼을 누를 때마다 카카오톡이 간다.
 */
function notificationFor(result: FinalRecommendationRunResult): { text: string; path: string } {
  if (result.status === "success") {
    const count = result.recommendedCount ?? 0;
    return {
      text: `[데일리 스크리너] ${result.runDate}자 리포트와 최종 추천이 준비됐습니다. (추천 ${count}개)`,
      path: "/dashboard/final",
    };
  }
  if (result.status === "skipped") {
    // 조용히 넘기지 않는다. Hobby 플랜 cron은 시각 정밀도가 ±59분이라 리포트 생성보다
    // 먼저 실행될 수 있고, 그날 최종 추천이 없는 이유를 받는 사람이 알아야 한다.
    return {
      text: `[데일리 스크리너] ${result.runDate}자 최종 추천을 건너뛰었습니다. ${result.message ?? ""}`.trim(),
      path: "/dashboard/strategy1",
    };
  }
  return {
    text: `[데일리 스크리너] ${result.runDate}자 최종 추천 생성에 실패했습니다. ${result.message ?? ""}`.trim(),
    path: "/dashboard/strategy1",
  };
}

/** Vercel Cron이 리포트 생성 cron 이후에 호출한다. vercel.json 참고. */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 휴장일(국경일·임시공휴일 포함)에는 아무것도 실행하지 않는다 (DESIGN.md §15).
  // 판정은 13시 cron이 장중에 남긴 기록을 읽는다 — 장 마감 후에는 휴장일과 정상
  // 거래일을 구분할 수 없기 때문이다.
  const verdict = await shouldRunToday();
  if (!verdict.run) {
    return NextResponse.json({
      status: "skipped",
      reason: "non-trading-day",
      marketStatus: verdict.marketStatus,
    });
  }

  const result = await generateFinalRecommendation();

  // 알림 실패가 최종 추천 결과를 덮지 않도록 분리해 처리한다.
  const { text, path } = notificationFor(result);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  await notifyAllKakaoRecipients(text, `${baseUrl}${path}`).catch((err) => {
    console.error("카카오톡 알림 발송 실패:", err);
  });

  return NextResponse.json({ ...result, marketDayCheck: verdict.reason });
}
