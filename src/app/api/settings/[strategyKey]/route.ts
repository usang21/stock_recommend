import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { STRATEGY_DEFS } from "@/lib/strategies/defaultParams";

/** 저장 즉시 다음 실행부터 반영된다 (DESIGN.md §8). */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ strategyKey: string }> }) {
  const { strategyKey } = await params;
  if (!(strategyKey in STRATEGY_DEFS)) {
    return NextResponse.json({ error: "알 수 없는 전략입니다." }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const row = await prisma.strategyParams.upsert({
    where: { strategyKey },
    update: { paramsJson: body },
    create: { strategyKey, paramsJson: body },
  });

  return NextResponse.json({ strategyKey: row.strategyKey, params: row.paramsJson });
}
