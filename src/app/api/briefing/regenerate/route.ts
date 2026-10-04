import { NextResponse } from "next/server";
import { buildDailyBriefing } from "@/lib/dailyBriefing";
import { pushBriefingToNotion } from "@/lib/notion";

// 네이버 랭킹 2회 + Notion 기록(종목당 1회, 초당 3요청 제한에 맞춰 간격 유지).
export const maxDuration = 120;

/**
 * 사용자가 "오늘의 브리핑" 화면에서 Notion 기록을 다시 요청하면 즉시 실행한다.
 *
 * 화면 자체는 열 때마다 네이버를 조회하므로 다시 만들 것이 없다. 이 버튼이 고치는
 * 대상은 **Notion 기록**이다 — 13시 개장 판정이 잘못돼 15:45 cron이 건너뛰었거나,
 * Notion 쪽 장애로 기록이 실패한 날에 쓴다.
 *
 * 휴장일 가드(DESIGN.md §15)를 두지 않는다. 사람이 명시적으로 누른 것이므로 의도로
 * 보고 실행한다 — 리포트·최종 추천의 재생성 버튼과 같은 방침이다.
 */
export async function POST() {
  const briefing = await buildDailyBriefing();
  const notion = await pushBriefingToNotion(briefing);

  return NextResponse.json({
    tradeDate: briefing.tradeDate,
    limitUpCount: briefing.limitUpCount,
    highVolumeCount: briefing.highVolumeCount,
    stockCount: briefing.stocks.length,
    notion: notion === null ? { status: "skipped" } : { status: "ok", ...notion },
  });
}
