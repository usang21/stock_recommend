/**
 * 그날 주식시장이 열렸는지 판정한다 (DESIGN.md §15).
 *
 * 평일이어도 국경일·임시공휴일이면 휴장이다. 그런 날에 리포트나 브리핑이 돌면 전
 * 거래일 수치를 그날 날짜로 기록하고, 알림까지 "준비됐습니다"로 나간다.
 *
 * 판정은 네이버 랭킹 응답의 `marketStatus`를 쓴다. 다만 이 값은 **장중에만** 쓸모가
 * 있다 — 장 마감 후에는 휴장일이든 정상 거래일이든 똑같이 `CLOSE`가 되어 둘을
 * 구분할 수 없다. 그래서 정규장이 열려 있는 13시에 한 번 확인해 DB에 남겨두고,
 * 장 마감 후 실행되는 cron들은 그 기록을 읽는다.
 *
 * 일봉의 마지막 날짜로 판정하는 방법도 가능하지만, 장 마감 후 일봉이 언제 게시되는지
 * 보장이 없어 정상 거래일을 휴장으로 오판할 위험이 있다. 장중 확인은 그 위험이 없다.
 */
import { prisma } from "@/lib/prisma";
import { getVolumeTopRanking } from "@/lib/dataSources/naver";

/** 네이버가 장이 닫혔을 때 보고하는 값. 그 밖의 값은 장이 열려 있다고 본다. */
const CLOSED_STATUS = "CLOSE";

/** KST 기준 오늘 날짜 (YYYY-MM-DD). Vercel 함수는 UTC로 돌기 때문에 명시적으로 변환한다. */
export function kstDateString(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

/** DB의 DATE 컬럼과 맞추기 위해 UTC 자정으로 고정한 Date를 만든다. */
function dateOnly(kstDate: string): Date {
  return new Date(`${kstDate}T00:00:00.000Z`);
}

export interface MarketDayCheck {
  tradeDate: string;
  isOpen: boolean;
  marketStatus: string;
}

/**
 * 지금 장이 열려 있는지 확인해 기록한다. 13시 cron이 호출한다.
 *
 * 같은 날 다시 호출하면 결과를 덮어쓴다 — 수동 재실행으로 바로잡을 수 있어야 한다.
 */
export async function checkAndRecordMarketDay(now: Date = new Date()): Promise<MarketDayCheck> {
  // 랭킹 한 건만 받아도 marketStatus를 알 수 있다.
  const rows = await getVolumeTopRanking(1);
  const marketStatus = String(rows[0]?.marketStatus ?? "");
  if (!marketStatus) {
    throw new Error("네이버 응답에서 marketStatus를 찾지 못했습니다.");
  }

  const tradeDate = kstDateString(now);
  const isOpen = marketStatus !== CLOSED_STATUS;

  await prisma.marketDayStatus.upsert({
    where: { tradeDate: dateOnly(tradeDate) },
    update: { isOpen, marketStatus, checkedAt: new Date() },
    create: { tradeDate: dateOnly(tradeDate), isOpen, marketStatus },
  });

  return { tradeDate, isOpen, marketStatus };
}

export type MarketDayVerdict =
  | { run: true; reason: "open" | "no-record" }
  | { run: false; reason: "closed"; marketStatus: string };

/**
 * 장 마감 후 실행되는 cron들이 호출한다. 13시에 남긴 기록을 읽어 실행 여부를 정한다.
 *
 * 기록이 없으면 **실행하는 쪽으로** 판단한다. Vercel cron 전달은 best effort라서 13시
 * 확인이 누락될 수 있는데, 그때 건너뛰면 정상 거래일 데이터를 영구히 잃는다. 반대로
 * 휴장일에 잘못 실행하면 잘못된 행 몇 개가 생기고 그건 지우면 된다. 덜 나쁜 실패를
 * 고른 것이고, 호출부는 이 경우를 응답에 표시해 사람이 알아챌 수 있게 한다.
 */
export async function shouldRunToday(now: Date = new Date()): Promise<MarketDayVerdict> {
  const tradeDate = kstDateString(now);
  const record = await prisma.marketDayStatus.findUnique({
    where: { tradeDate: dateOnly(tradeDate) },
  });

  if (!record) {
    console.warn(`${tradeDate} 개장 여부 기록이 없습니다. 13시 확인이 누락된 것으로 보고 실행합니다.`);
    return { run: true, reason: "no-record" };
  }
  if (!record.isOpen) {
    return { run: false, reason: "closed", marketStatus: record.marketStatus };
  }
  return { run: true, reason: "open" };
}
