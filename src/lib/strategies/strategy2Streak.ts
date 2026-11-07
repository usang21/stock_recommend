import { prisma } from "@/lib/prisma";

export { STRATEGY2_STREAK_ALERT_THRESHOLD } from "./strategy2StreakConfig";

/**
 * 전략2 최종 단계는 "장대양봉 후 5일선 이격도 3% 이내"를 매일 다시 검사한다.
 * 종목이 이 리스트에 연속으로 남아있다는 것은 큰 흔들림 없이 좁게 횡보 중이라는
 * 뜻이고, bigBullishLookbackDays(기본 5)가 끝나기 전에 이 상태가 길어질수록
 * 눌림목 없이 재차 상승을 시도할 시점(매수 타이밍)이 가까워진다고 본다.
 */
const LOOKBACK_RUNS = 10;

/**
 * uptoRunDate(포함) 이전 리포트들에서 전략2 최종 단계에 연속으로 등장한 일수를
 * 종목코드별로 센다. 가장 최근 리포트부터 거슬러 올라가다 리스트에서 빠진
 * 첫 지점에서 멈춘다.
 */
export async function computeStrategy2Streaks(
  uptoRunDate: Date,
  codes: string[]
): Promise<Map<string, number>> {
  const result = new Map(codes.map((c) => [c, 0]));
  if (codes.length === 0) return result;

  const runs = await prisma.reportRun.findMany({
    where: { runDate: { lte: uptoRunDate } },
    orderBy: { runDate: "desc" },
    take: LOOKBACK_RUNS,
    select: {
      strategyResults: {
        where: { strategyKey: "strategy2" },
        select: {
          steps: {
            where: { isFinal: true },
            select: { picks: { select: { stockCode: true } } },
          },
        },
      },
    },
  });

  const codeSetsByRun = runs.map(
    (run) => new Set(run.strategyResults.flatMap((sr) => sr.steps.flatMap((s) => s.picks.map((p) => p.stockCode))))
  );

  for (const code of codes) {
    let streak = 0;
    for (const codeSet of codeSetsByRun) {
      if (!codeSet.has(code)) break;
      streak += 1;
    }
    result.set(code, streak);
  }
  return result;
}
