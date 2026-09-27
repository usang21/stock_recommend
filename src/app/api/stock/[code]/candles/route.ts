import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStockCandles, getStockName, type Timeframe } from "@/lib/dataSources/naver";

const BAR_COUNT: Record<Timeframe, number> = { day: 180, week: 150, month: 120 };

function parseTimeframe(v: string | null): Timeframe {
  return v === "week" || v === "month" ? v : "day";
}

/**
 * 종목 캔들(일/주/월봉 전환) + 추천 마커 (DESIGN.md §6: 수익률 계산 대신 추천
 * 시점을 차트에 마커로 표시). 마커는 항상 실제 거래일 날짜라, 주봉/월봉으로
 * 보면 그 날짜에 정확히 맞는 봉이 없어 표시가 안 될 수 있다(의도된 동작).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const timeframe = parseTimeframe(request.nextUrl.searchParams.get("timeframe"));

  const [candles, picks, liveName, anyPick] = await Promise.all([
    getStockCandles(code, BAR_COUNT[timeframe], timeframe).catch(() => []),
    prisma.stockPick.findMany({
      where: { stockCode: code, funnelStep: { isFinal: true } },
      include: { funnelStep: { include: { strategyResult: { include: { reportRun: true } } } } },
    }),
    getStockName(code).catch(() => null),
    prisma.stockPick.findFirst({ where: { stockCode: code } }),
  ]);

  const markers = picks.map((p) => ({
    date: p.funnelStep.strategyResult.reportRun.runDate.toISOString().slice(0, 10),
    strategyKey: p.funnelStep.strategyResult.strategyKey,
  }));

  return NextResponse.json({ code, name: liveName ?? anyPick?.stockName ?? null, candles, markers });
}
