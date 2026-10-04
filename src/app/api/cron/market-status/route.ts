import { NextRequest, NextResponse } from "next/server";
import { checkAndRecordMarketDay } from "@/lib/marketDay";

// 네이버 랭킹 1건 조회 + DB 쓰기 한 번이라 수 초면 끝난다.
export const maxDuration = 60;

/**
 * Vercel Cron이 평일 04:00 UTC(KST 13:00)에 호출한다 (DESIGN.md §15). vercel.json 참고.
 *
 * 정규장(09:00~15:30) 한가운데에 확인하는 것이 핵심이다. 장 마감 후에는 휴장일과
 * 정상 거래일이 모두 `marketStatus: "CLOSE"`로 보여 구분할 수 없다. Hobby 플랜의
 * cron 시각 정밀도가 ±59분이라 실제로는 13:00~13:59 사이에 실행되는데, 그 구간은
 * 전부 장중이라 판정에 영향이 없다.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await checkAndRecordMarketDay();
  return NextResponse.json(result);
}
