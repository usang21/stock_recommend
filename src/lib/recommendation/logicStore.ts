/**
 * 추천 로직(판단 기준 + 학습 기록)의 버전 저장소 (DESIGN.md §13).
 *
 * 왜 DB인가: 배포 환경(Vercel)의 파일시스템은 실행 간 유지되지 않아, 피드백
 * 루프가 런타임에 저장소의 md 파일을 append 할 수 없다. 그래서 md 본문을 DB에
 * 버전별로 쌓고, 사람에게는 웹에서 md 그대로 보여주고 편집하게 한다.
 *
 * 두 종류를 구분해서 관리한다 — 사람이 정한 기준과 시스템이 관찰로 얻은 내용이
 * 섞이면, 잘못 학습된 관찰이 기준을 침식해도 사람이 알아채기 어렵기 때문이다.
 * - criteria: 사람이 정한 판단 기준. skills/final-recommendation/SKILL.md를
 *   초기값으로 한 번 심고, 이후로는 DB 쪽이 실제로 쓰이는 값이다(웹에서 편집).
 * - lesson: 피드백 루프가 누적하는 학습 기록. 빈 문서에서 시작한다.
 */
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

export type LogicKind = "criteria" | "lesson";

const LESSON_INITIAL_CONTENT = `# 추천 결과 학습 기록

피드백 루프가 과거 추천의 실제 결과를 분석해 누적하는 기록이다. 아직 분석된
회차가 없다.
`;

async function readSkillFile(fileName: string): Promise<string> {
  const filePath = path.join(process.cwd(), "skills", "final-recommendation", fileName);
  return readFile(filePath, "utf-8");
}

/** 추천 판단 기준 프롬프트 (SKILL.md 원문). 프롬프트의 system 자리에 그대로 들어간다. */
export async function loadCriteriaPrompt(): Promise<string> {
  const current = await getCurrentLogic("criteria");
  return current.content;
}

/** 결과 사유 분석 기준 프롬프트. 사람이 웹에서 고치는 대상이 아니라 파일에서 직접 읽는다. */
export async function loadOutcomeAnalysisPrompt(): Promise<string> {
  return readSkillFile("OUTCOME_ANALYSIS.md");
}

export interface LogicVersion {
  version: number;
  content: string;
  changedBy: string;
  changeReason: string;
  createdAt: Date;
}

/** 현재 버전을 반환한다. 아직 없으면 초기값으로 version 1을 만든다. */
export async function getCurrentLogic(kind: LogicKind): Promise<LogicVersion> {
  const latest = await prisma.recommendationLogicVersion.findFirst({
    where: { kind },
    orderBy: { version: "desc" },
  });
  if (latest) return latest;

  const content = kind === "criteria" ? await readSkillFile("SKILL.md") : LESSON_INITIAL_CONTENT;
  const created = await prisma.recommendationLogicVersion.create({
    data: {
      kind,
      version: 1,
      content,
      changedBy: "agent",
      changeReason:
        kind === "criteria"
          ? "초기 판단 기준을 skills/final-recommendation/SKILL.md에서 가져왔습니다."
          : "학습 기록을 새로 시작했습니다.",
    },
  });
  return created;
}

/** 새 버전을 추가한다. 내용이 직전 버전과 같으면 아무것도 하지 않는다. */
export async function saveLogicVersion(
  kind: LogicKind,
  content: string,
  changedBy: "agent" | "human",
  changeReason: string
): Promise<LogicVersion> {
  const current = await getCurrentLogic(kind);
  if (current.content === content) return current;

  return prisma.recommendationLogicVersion.create({
    data: { kind, version: current.version + 1, content, changedBy, changeReason },
  });
}

/** 학습 기록 맨 끝에 이번 회차의 관찰을 한 항목으로 덧붙인다. */
export async function appendLesson(entryTitle: string, entryBody: string, changeReason: string): Promise<LogicVersion> {
  const current = await getCurrentLogic("lesson");
  const next = `${current.content.trimEnd()}\n\n## ${entryTitle}\n\n${entryBody.trim()}\n`;
  return saveLogicVersion("lesson", next, "agent", changeReason);
}

export async function listLogicVersions(kind: LogicKind): Promise<LogicVersion[]> {
  return prisma.recommendationLogicVersion.findMany({
    where: { kind },
    orderBy: { version: "desc" },
  });
}
