import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStockCandles } from "@/lib/dataSources/naver";

/**
 * 종목 일봉 + 추천 마커 (DESIGN.md §6: 수익률 계산 대신 추천 시점을 차트에 마커로 표시).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const [candles, picks] = await Promise.all([
    getStockCandles(code, 180).catch(() => []),
    prisma.stockPick.findMany({
      where: { stockCode: code, funnelStep: { isFinal: true } },
      include: { funnelStep: { include: { strategyResult: { include: { reportRun: true } } } } },
    }),
  ]);

  const markers = picks.map((p) => ({
    date: p.funnelStep.strategyResult.reportRun.runDate.toISOString().slice(0, 10),
    strategyKey: p.funnelStep.strategyResult.strategyKey,
  }));

  return NextResponse.json({ code, candles, markers });
}
