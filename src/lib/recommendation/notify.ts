/**
 * 최종 추천 완료 알림 (DESIGN.md §7).
 *
 * 하루 일과의 마지막이 최종 추천이므로 카카오톡 알림도 여기서 보낸다. 리포트 생성
 * 직후에 보내면 받는 사람이 들어가도 최종 추천이 아직 만들어지지 않아 빈 화면을 본다.
 *
 * 자동 cron과 수동 전체 재실행이 같은 문구로 알리도록 이 모듈을 공유한다. 반대로
 * `generateFinalRecommendation()` 안에는 두지 않는다 — 그 함수는 알림이 필요 없는
 * 경로에서도 쓸 수 있어야 한다.
 */
import { notifyAllKakaoRecipients } from "@/lib/dataSources/kakao";
import type { FinalRecommendationRunResult } from "./run";

function messageFor(result: FinalRecommendationRunResult): { text: string; path: string } {
  if (result.status === "success") {
    const count = result.recommendedCount ?? 0;
    // 추천 0개는 실패가 아니라 "자격을 넘는 종목이 없었다"는 결론이다(§13). 숫자만
    // 보내면 받는 사람이 생성 실패로 읽으므로 문구로 구분해준다.
    const summary = count === 0 ? "추천 자격을 넘는 종목이 없었습니다" : `추천 ${count}개`;
    return {
      text: `[데일리 스크리너] ${result.runDate}자 리포트와 최종 추천이 준비됐습니다. (${summary})`,
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

/** 알림 실패가 최종 추천 결과를 덮지 않도록, 실패해도 던지지 않는다. */
export async function notifyFinalRecommendation(result: FinalRecommendationRunResult): Promise<void> {
  const { text, path } = messageFor(result);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  await notifyAllKakaoRecipients(text, `${baseUrl}${path}`).catch((err) => {
    console.error("카카오톡 알림 발송 실패:", err);
  });
}
