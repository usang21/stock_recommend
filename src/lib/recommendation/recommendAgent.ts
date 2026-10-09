/**
 * 최종 추천 Agent (DESIGN.md §13).
 * 전략1~4의 최종 통과 종목을 종합해 추천 자격을 넘는 종목만 순위와 근거로 추천한다
 * (최대 5개, 자격 미달이면 0개).
 * 판단 기준은 추천 로직 저장소(logicStore)의 criteria 버전을 쓰고, 학습 기록은
 * 프롬프트에 함께 넣어 피드백 루프의 관찰이 추천에 반영되게 한다.
 */
import { completeChat, parseJsonObject } from "@/lib/llm";
import { getCurrentLogic, loadCriteria } from "./logicStore";

export interface Candidate {
  code: string;
  name: string;
  price: number;
  changeRate: number | null;
  volume: number | null;
  tradingValue: number | null;
  /** 이 종목을 최종 단계까지 통과시킨 전략 키 목록 */
  strategyKeys: string[];
  materialVerdict?: string | null;
  materialSummary?: string | null;
  institutionalSummary?: string | null;
  newHighLabel?: string | null;
}

export interface RecommendationResult {
  recommendations: { code: string; rank: number; reason: string }[];
  excluded: { code: string; reason: string }[];
  criteriaVersion: number;
  lessonVersion: number;
}

const MAX_RECOMMENDATIONS = 5;

const STRATEGY_LABELS: Record<string, string> = {
  strategy1: "전략1(상한가+재료+거래량)",
  strategy2: "전략2(강세장+테마+장대양봉+이격도)",
  strategy3: "전략3(거래량급증+신고가+기관수급+상승추세)",
  strategy4: "전략4(주봉5이평돌파+거래량+20일선상회)",
};

const VERDICT_LABELS: Record<string, string> = {
  positive: "호재",
  negative: "악재",
  none: "재료 없음",
};

function describeCandidate(c: Candidate): string {
  const lines = [
    `- 종목코드 ${c.code} / ${c.name}`,
    `  통과 전략(${c.strategyKeys.length}개): ${c.strategyKeys.map((k) => STRATEGY_LABELS[k] ?? k).join(", ")}`,
    `  현재가 ${c.price.toLocaleString()}원, 등락률 ${c.changeRate ?? "-"}%, 거래대금 ${
      c.tradingValue != null ? `${Math.round(c.tradingValue / 100_000_000).toLocaleString()}억원` : "-"
    }`,
  ];
  if (c.materialVerdict) {
    lines.push(`  재료 판단: ${VERDICT_LABELS[c.materialVerdict] ?? c.materialVerdict} — ${c.materialSummary ?? ""}`);
  }
  if (c.institutionalSummary) lines.push(`  기관수급: ${c.institutionalSummary}`);
  if (c.newHighLabel) lines.push(`  신고가: ${c.newHighLabel}`);
  return lines.join("\n");
}

interface RawResponse {
  recommendations?: { code?: unknown; rank?: unknown; reason?: unknown }[];
  excluded?: { code?: unknown; reason?: unknown }[];
}

export async function recommendFinalPicks(candidates: Candidate[]): Promise<RecommendationResult> {
  // 저장소의 SKILL.md가 바뀌었으면 여기서 자동으로 새 버전이 되어 그 내용이 쓰인다.
  const criteria = await loadCriteria();
  const lesson = await getCurrentLogic("lesson");
  const criteriaVersion = criteria.version;

  const userPrompt = [
    `오늘 전략1~4의 최종 단계를 통과한 종목은 다음 ${candidates.length}개다.`,
    "",
    candidates.map(describeCandidate).join("\n"),
    "",
    "## 학습 기록 (과거 추천 결과에서 얻은 관찰)",
    "",
    lesson.content,
    "",
    `위 판단 기준의 "추천 자격"을 넘는 종목만 순위와 근거로 고르고, JSON 하나만 응답하라.`,
    `${MAX_RECOMMENDATIONS}개는 상한이지 목표가 아니다 — 자격을 넘는 종목이 ${MAX_RECOMMENDATIONS}개보다 적으면 있는 만큼만, 하나도 없으면 빈 배열로 응답하고 후보 전부를 excluded에 넣어라. 빈 자리를 채우려고 근거가 약한 종목을 올리지 마라.`,
  ].join("\n");

  const text = await completeChat(criteria.content, userPrompt, { maxTokens: 4096 });
  const parsed = parseJsonObject(text) as RawResponse | null;
  if (!parsed) {
    throw new Error(`추천 모델 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
  }

  const byCode = new Map(candidates.map((c) => [c.code, c]));

  // 추천 0개는 정상적인 결론("오늘은 자격을 넘는 종목이 없었다")이므로, 키 자체가
  // 없는 응답 형식 오류와 구분한다. 빈 배열은 그대로 받아들인다.
  if (!Array.isArray(parsed.recommendations)) {
    throw new Error(`추천 모델 응답에 recommendations 배열이 없습니다: ${text.slice(0, 300)}`);
  }

  const deduped = new Set<string>();
  const valid = parsed.recommendations
    .filter((r) => typeof r?.code === "string" && byCode.has(r.code) && typeof r?.reason === "string")
    .map((r) => ({ code: r.code as string, rank: Number(r.rank), reason: (r.reason as string).trim() }))
    .filter((r) => {
      if (deduped.has(r.code)) return false; // 모델이 같은 종목을 두 번 낸 경우
      deduped.add(r.code);
      return true;
    })
    .sort((a, b) => (Number.isFinite(a.rank) ? a.rank : 99) - (Number.isFinite(b.rank) ? b.rank : 99));

  const recommendations = valid
    .slice(0, MAX_RECOMMENDATIONS)
    .map((r, i) => ({ ...r, rank: i + 1 })); // 모델이 매긴 순위에 구멍이 있어도 1..N으로 다시 매긴다

  // 상한을 넘어 잘린 종목. 추천에 들지 못했으므로 제외 목록에 넣어야 하는데, 자격을
  // 넘었다는 모델의 판단은 유효하므로 "자격 미달"로 적으면 사실과 다르다.
  const trimmed = new Set(valid.slice(MAX_RECOMMENDATIONS).map((r) => r.code));
  const picked = new Set(recommendations.map((r) => r.code));

  // 모델이 종목을 올렸는데 하나도 살아남지 못한 경우만 오류로 본다 — 입력에 없는
  // 종목코드를 지어냈거나 reason이 빠진 응답이고, 추천 0개와는 성격이 다르다.
  if (recommendations.length === 0 && parsed.recommendations.length > 0) {
    throw new Error(
      `추천 모델이 올린 ${parsed.recommendations.length}개 종목이 모두 유효하지 않습니다 (입력에 없는 종목코드이거나 reason 누락): ${text.slice(0, 300)}`
    );
  }

  const excludedFromModel = new Map(
    (Array.isArray(parsed.excluded) ? parsed.excluded : [])
      .filter((e) => typeof e?.code === "string" && byCode.has(e.code) && typeof e?.reason === "string")
      .map((e) => [e.code as string, (e.reason as string).trim()])
  );

  // 모델이 빠뜨린 후보도 제외 목록에 넣는다 — 모든 후보가 추천/제외 중 한 곳에는
  // 들어가야 사람이 무엇이 어떻게 처리됐는지 확인할 수 있다.
  const excluded = candidates
    .filter((c) => !picked.has(c.code))
    .map((c) => ({
      code: c.code,
      reason: trimmed.has(c.code)
        ? `추천 자격은 넘었으나 상위 ${MAX_RECOMMENDATIONS}개에 들지 못했습니다.`
        : excludedFromModel.get(c.code) ?? "추천 자격에 미달했습니다 (모델이 사유를 제시하지 않음).",
    }));

  return { recommendations, excluded, criteriaVersion, lessonVersion: lesson.version };
}
