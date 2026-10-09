import { NextRequest, NextResponse } from "next/server";
import {
  getCriteriaFileStatus,
  getCurrentLogic,
  listLogicVersions,
  reloadCriteriaFromSkillFile,
  saveLogicVersion,
  type LogicKind,
} from "@/lib/recommendation/logicStore";

function parseKind(value: string): LogicKind | null {
  return value === "criteria" || value === "lesson" ? value : null;
}

/** 현재 버전 + 전체 변경 이력 (DESIGN.md §13 추천 로직 변경 이력). */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const kind = parseKind((await params).kind);
  if (!kind) return NextResponse.json({ error: "알 수 없는 종류입니다." }, { status: 400 });

  const [current, versions] = await Promise.all([getCurrentLogic(kind), listLogicVersions(kind)]);
  // 판단 기준은 저장소의 파일과 어긋날 수 있어, 화면이 그 사실을 띄울 수 있게 함께 준다.
  const fileStatus = kind === "criteria" ? await getCriteriaFileStatus() : null;
  return NextResponse.json({
    kind,
    current: { version: current.version, content: current.content },
    fileStatus,
    versions: versions.map((v) => ({
      version: v.version,
      content: v.content,
      changedBy: v.changedBy,
      changeReason: v.changeReason,
      createdAt: v.createdAt.toISOString(),
    })),
  });
}

/** 사람이 웹에서 직접 수정하면 새 버전으로 쌓는다 (이전 버전은 지우지 않는다). */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const kind = parseKind((await params).kind);
  if (!kind) return NextResponse.json({ error: "알 수 없는 종류입니다." }, { status: 400 });

  const body = (await request.json().catch(() => null)) as { content?: unknown; changeReason?: unknown } | null;
  if (!body || typeof body.content !== "string" || body.content.trim().length === 0) {
    return NextResponse.json({ error: "내용이 비어 있습니다." }, { status: 400 });
  }

  const changeReason =
    typeof body.changeReason === "string" && body.changeReason.trim().length > 0
      ? body.changeReason.trim()
      : "웹 화면에서 직접 수정했습니다.";

  const saved = await saveLogicVersion(kind, body.content, "human", changeReason);
  return NextResponse.json({ version: saved.version });
}

/**
 * 저장소의 SKILL.md 내용을 criteria의 새 버전으로 올린다 (판단 기준 전용).
 * 학습 기록(lesson)은 파일 원본이 없으므로 대상이 아니다.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const kind = parseKind((await params).kind);
  if (kind !== "criteria") {
    return NextResponse.json({ error: "판단 기준만 파일에서 다시 불러올 수 있습니다." }, { status: 400 });
  }

  const saved = await reloadCriteriaFromSkillFile();
  return NextResponse.json({ version: saved.version });
}
