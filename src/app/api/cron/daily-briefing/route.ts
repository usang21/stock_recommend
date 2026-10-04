import { NextRequest, NextResponse } from "next/server";
import { buildDailyBriefing } from "@/lib/dailyBriefing";
import { pushBriefingToNotion } from "@/lib/notion";
import { shouldRunToday } from "@/lib/marketDay";

// 네이버 랭킹 2회 + Notion 기록(종목당 1회, 초당 3요청 제한에 맞춰 간격 유지)이라
// 평시 20초 안쪽이다. 조건 충족 종목이 아주 많은 날을 감안해 넉넉히 둔다.
export const maxDuration = 120;

/**
 * Vercel Cron이 평일 장 마감 후 호출한다 (DESIGN.md §14). vercel.json 참고.
 *
 * 이 Cron은 Notion 누적 기록만 한다. 알림을 따로 보내지 않는 이유는 하루에 카카오톡이
 * 두 번 오는 것이 번거롭다는 판단이다 — 알림은 16:00 리포트 완료 카카오톡 하나로
 * 통일하고, 브리핑 내용은 웹의 "오늘의 브리핑" 탭에서 본다.
 */
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

  const briefing = await buildDailyBriefing();

  let notion: Record<string, unknown>;
  try {
    const result = await pushBriefingToNotion(briefing);
    // 환경변수가 없어 건너뛴 것을 성공으로 뭉개면, 설정이 빠진 채 기록이 멈춘 것을
    // Cron 응답만 보고는 알 수 없게 된다.
    notion = result === null ? { status: "skipped" } : { status: "ok", ...result };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("브리핑 Notion 기록 실패:", error);
    notion = { status: "failed", error };
  }

  return NextResponse.json({
    tradeDate: briefing.tradeDate,
    limitUpCount: briefing.limitUpCount,
    highVolumeCount: briefing.highVolumeCount,
    stockCount: briefing.stocks.length,
    // 배포 후 수동 호출로 결과를 눈으로 확인할 수 있도록 종목 요약을 함께 돌려준다.
    stocks: briefing.stocks.map((s) => `${s.name}(${s.code}) ${s.tags.join("/")}`),
    marketDayCheck: verdict.reason,
    notion,
  });
}
