import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { STRATEGY_DEFS } from "@/lib/strategies/defaultParams";

/** 전략별 설정 파라미터 (DESIGN.md §8: 웹페이지에서 직접 조정). */
export async function GET() {
  const rows = await prisma.strategyParams.findMany();
  const byKey = new Map(rows.map((r) => [r.strategyKey, r.paramsJson]));

  const result = (Object.keys(STRATEGY_DEFS) as (keyof typeof STRATEGY_DEFS)[]).map((key) => ({
    strategyKey: key,
    strategyName: STRATEGY_DEFS[key].name,
    params: { ...STRATEGY_DEFS[key].defaults, ...((byKey.get(key) as object) ?? {}) },
  }));

  return NextResponse.json(result);
}
