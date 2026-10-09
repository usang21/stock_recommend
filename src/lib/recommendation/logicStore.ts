/**
 * 추천 로직(판단 기준 + 학습 기록)의 버전 저장소 (DESIGN.md §13).
 *
 * 왜 DB인가: 배포 환경(Vercel)의 파일시스템은 실행 간 유지되지 않아, 피드백
 * 루프가 런타임에 저장소의 md 파일을 append 할 수 없다. 그래서 md 본문을 DB에
 * 버전별로 쌓고, 사람에게는 웹에서 md 그대로 보여주고 편집하게 한다.
 *
 * 두 종류를 구분해서 관리한다 — 사람이 정한 기준과 시스템이 관찰로 얻은 내용이
 * 섞이면, 잘못 학습된 관찰이 기준을 침식해도 사람이 알아채기 어렵기 때문이다.
 * - criteria: 사람이 정한 판단 기준. skills/final-recommendation/SKILL.md가 원본이고
 *   DB 쪽이 실제로 쓰이는 값이다(웹에서 편집 가능).
 * - lesson: 피드백 루프가 누적하는 학습 기록. 빈 문서에서 시작한다.
 *
 * criteria는 쓰는 쪽이 둘(저장소의 md, 웹 편집)이라 둘이 어긋날 수 있다. 그래서
 * 버전마다 `changedBy`로 출처를 남기고, **현재 버전이 파일에서 온 것일 때만** 파일
 * 변경을 자동으로 새 버전으로 올린다(`syncCriteriaFromSkillFile`). 사람이 웹에서
 * 고친 상태라면 자동으로 덮지 않고 어긋났다는 사실만 화면에 드러낸다 — 어느 쪽을
 * 따를지는 사람이 정해야 하는 판단이다.
 */
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

export type LogicKind = "criteria" | "lesson";

/**
 * 버전을 만든 주체.
 * - "file": 저장소의 SKILL.md에서 그대로 올라온 버전. 이 상태에서만 자동 반영한다.
 * - "human": 사람이 웹에서 직접 고친 버전. 자동 반영이 덮지 않는다.
 * - "agent": 피드백 루프가 쌓은 버전(lesson).
 */
export type LogicChangedBy = "agent" | "human" | "file";

const FILE_RELOAD_REASON = "저장소의 skills/final-recommendation/SKILL.md 내용을 올렸습니다.";

/**
 * `changedBy: "file"`을 쓰기 전에 만들어진 버전들의 사유 문구.
 *
 * 그때는 파일에서 올린 버전도 "human"(다시 불러오기 버튼)이나 "agent"(최초 심기)로
 * 기록됐다. 이 문구들이 그 버전이 파일에서 왔다는 유일한 단서다 — 이것 없이는 기존
 * DB에서 자동 반영이 영구히 멈춘다(현재 버전이 "human"으로 보이므로).
 */
const LEGACY_FILE_REASONS = [
  "초기 판단 기준을 skills/final-recommendation/SKILL.md에서 가져왔습니다.",
  "저장소의 skills/final-recommendation/SKILL.md 내용을 다시 불러왔습니다.",
];

/** 이 버전이 저장소의 파일에서 올라온 것인가 (사람이 웹에서 고친 것이 아닌가). */
function isFromSkillFile(version: LogicVersion): boolean {
  return version.changedBy === "file" || LEGACY_FILE_REASONS.includes(version.changeReason);
}

const LESSON_INITIAL_CONTENT = `# 추천 결과 학습 기록

피드백 루프가 과거 추천의 실제 결과를 분석해 누적하는 기록이다. 아직 분석된
회차가 없다.
`;

async function readSkillFile(fileName: string): Promise<string> {
  const filePath = path.join(process.cwd(), "skills", "final-recommendation", fileName);
  return readFile(filePath, "utf-8");
}

/**
 * 추천 판단 기준 프롬프트. 프롬프트의 system 자리에 그대로 들어간다.
 *
 * 읽기 전에 파일 변경을 자동으로 반영하므로(`syncCriteriaFromSkillFile`), 기준을
 * 코드와 함께 바꿔 배포하면 다음 실행부터 그대로 쓰인다 — 사람이 화면에서 버튼을
 * 누를 필요가 없다. 사람이 웹에서 고친 상태라면 그 수정이 유지된다.
 */
export async function loadCriteria(): Promise<{ content: string; version: number }> {
  const current = await syncCriteriaFromSkillFile();
  return { content: current.content, version: current.version };
}

/**
 * 저장소의 SKILL.md가 바뀌었으면 새 버전으로 올리고, 현재 버전을 반환한다.
 *
 * 현재 버전이 사람이 웹에서 고친 것이면 아무것도 하지 않는다 — 사람의 수정을 조용히
 * 되돌리지 않기 위함이다. 그 어긋남은 `getCriteriaFileStatus`가 화면에 드러낸다.
 *
 * 파일을 읽지 못해도(배포 번들에서 빠진 경우 등) 추천 실행을 멈추지 않는다. DB에
 * 들어 있는 현재 버전으로 계속 진행한다.
 */
export async function syncCriteriaFromSkillFile(): Promise<LogicVersion> {
  const current = await getCurrentLogic("criteria");
  if (!isFromSkillFile(current)) return current;

  let fileContent: string;
  try {
    fileContent = await readSkillFile("SKILL.md");
  } catch {
    return current;
  }

  // 내용이 같으면 saveLogicVersion이 그대로 현재 버전을 돌려준다(버전이 늘지 않는다).
  return saveLogicVersion("criteria", fileContent, "file", FILE_RELOAD_REASON);
}

/** 화면에 "파일과 DB가 어긋났다"를 띄우기 위한 상태. */
export interface CriteriaFileStatus {
  /** 현재 버전이 파일에서 온 것인가 (아니면 사람이 웹에서 고친 것) */
  currentFromFile: boolean;
  /** 파일 내용이 현재 버전과 다른가 */
  fileDiffers: boolean;
  /** 파일을 읽을 수 없었는가 */
  fileUnavailable: boolean;
}

export async function getCriteriaFileStatus(): Promise<CriteriaFileStatus> {
  const current = await getCurrentLogic("criteria");
  const currentFromFile = isFromSkillFile(current);
  try {
    const fileContent = await readSkillFile("SKILL.md");
    return { currentFromFile, fileDiffers: fileContent !== current.content, fileUnavailable: false };
  } catch {
    return { currentFromFile, fileDiffers: false, fileUnavailable: true };
  }
}

/** 결과 사유 분석 기준 프롬프트. 사람이 웹에서 고치는 대상이 아니라 파일에서 직접 읽는다. */
export async function loadOutcomeAnalysisPrompt(): Promise<string> {
  return readSkillFile("OUTCOME_ANALYSIS.md");
}

/**
 * 저장소의 SKILL.md 원문을 criteria의 새 버전으로 올린다 — 화면의 "다시 불러오기".
 *
 * 평소에는 `syncCriteriaFromSkillFile`이 자동으로 하므로 누를 일이 없다. 이 통로가
 * 남아 있는 이유는 사람이 웹에서 고친 상태일 때다 — 그때는 자동 반영이 멈추므로,
 * 파일 쪽을 따르겠다고 사람이 결정하면 이 버튼으로 올린다. 덮어쓰는 것이 아니라 새
 * 버전으로 쌓이므로 웹에서 고친 내용은 이력과 diff에 그대로 남는다.
 */
export async function reloadCriteriaFromSkillFile(): Promise<LogicVersion> {
  const content = await readSkillFile("SKILL.md");
  return saveLogicVersion("criteria", content, "file", FILE_RELOAD_REASON);
}

export interface LogicVersion {
  version: number;
  content: string;
  changedBy: string; // LogicChangedBy 중 하나. DB는 String이라 넓은 타입으로 받는다.
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
      changedBy: kind === "criteria" ? "file" : "agent",
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
  changedBy: LogicChangedBy,
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
