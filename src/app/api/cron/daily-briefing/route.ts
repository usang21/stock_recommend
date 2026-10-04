import { NextRequest, NextResponse } from "next/server";
import { buildDailyBriefing } from "@/lib/dailyBriefing";
import { sendDailyBriefingEmail } from "@/lib/briefingEmail";
import { pushBriefingToNotion } from "@/lib/notion";

// 네이버 랭킹 2회 + Notion 기록(종목당 1회, 초당 3요청 제한에 맞춰 간격 유지)이라
// 평시 20초 안쪽이다. 조건 충족 종목이 아주 많은 날을 감안해 넉넉히 둔다.
export const maxDuration = 120;

/**
 * Vercel Cron이 평일 장 마감 후 호출한다 (DESIGN.md §14). vercel.json 참고.
 *
 * 메일과 Notion은 서로 독립적으로 처리한다 — 한쪽이 실패해도 다른 쪽은 전달되어야
 * 하고, 둘 다 실패해도 어느 쪽이 왜 실패했는지 응답에 남아야 하기 때문이다.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const briefing = await buildDailyBriefing();

  const [emailResult, notionResult] = await Promise.allSettled([
    sendDailyBriefingEmail(briefing),
    pushBriefingToNotion(briefing),
  ]);

  /**
   * 세 상태를 구분해 보고한다. 설정이 빠져 건너뛴 것(`skipped`)을 성공으로
   * 뭉개면, 환경변수가 빠진 채 발송이 멈춘 걸 모르고 지나치게 된다.
   */
  function report(result: PromiseSettledResult<object | null>, label: string) {
    if (result.status === "rejected") {
      const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error(`${label} 실패:`, error);
      return { status: "failed" as const, error };
    }
    if (result.value === null) return { status: "skipped" as const };
    return { status: "ok" as const, ...result.value };
  }

  return NextResponse.json({
    tradeDate: briefing.tradeDate,
    limitUpCount: briefing.limitUpCount,
    highVolumeCount: briefing.highVolumeCount,
    stockCount: briefing.stocks.length,
    // 배포 후 수동 호출로 결과를 눈으로 확인할 수 있도록 종목 요약을 함께 돌려준다.
    stocks: briefing.stocks.map((s) => `${s.name}(${s.code}) ${s.tags.join("/")}`),
    email: report(emailResult, "브리핑 메일 발송"),
    notion: report(notionResult, "브리핑 Notion 기록"),
  });
}
