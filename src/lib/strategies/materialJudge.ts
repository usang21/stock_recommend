/**
 * 전략1 2단계: 재료(뉴스/공시) 판단 Agent (DESIGN.md §4).
 * 판단 기준은 skills/material-judgment/SKILL.md에서 관리한다 — 기준을 바꿀 때는
 * 코드가 아니라 그 파일을 수정한다.
 *
 * 판단에 쓰는 모델은 MATERIAL_JUDGE_PROVIDER로 전환한다:
 * - "anthropic" (기본): Claude API. ANTHROPIC_API_KEY 필요, 사용량만큼 과금.
 * - "gemini": Google Gemini API. GEMINI_API_KEY 필요, 무료 티어로 운영 가능.
 * - "ollama" (로컬 개발/테스트용): 로컬에서 돌아가는 Ollama 서버를 사용, 비용 없음.
 *   Vercel 등 클라우드에서는 로컬호스트에 접근할 수 없어 운영에는 쓸 수 없다.
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import path from "path";
import { getRecentDisclosures, disclosureUrl } from "@/lib/dataSources/dart";
import { searchRecentNews } from "@/lib/dataSources/stockNews";
import type { MaterialInfo, MaterialSource } from "./types";

let cachedSkill: string | null = null;
async function loadSkillPrompt(): Promise<string> {
  if (cachedSkill) return cachedSkill;
  const skillPath = path.join(process.cwd(), "skills", "material-judgment", "SKILL.md");
  cachedSkill = await readFile(skillPath, "utf-8");
  return cachedSkill;
}

const PROVIDER = (process.env.MATERIAL_JUDGE_PROVIDER || "anthropic").toLowerCase();

async function completeWithAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");
  const client = new Anthropic({ apiKey });
  const model = process.env.MATERIAL_JUDGE_MODEL || "claude-sonnet-5";
  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  return message.content.find((b) => b.type === "text")?.text ?? "{}";
}

async function completeWithOllama(systemPrompt: string, userPrompt: string): Promise<string> {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "qwen2.5:7b";
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
      stream: false,
      // 스키마 일치까지 보장하진 않지만, 최소한 문법적으로 유효한 JSON만 내도록 강제한다.
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Ollama 호출 실패 (${res.status}). 로컬에서 \`ollama serve\`가 실행 중이고 \`${model}\` 모델을 pull했는지 확인하세요.`
    );
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "{}";
}

/** 무료 티어 Gemini는 가끔 일시적으로 503(과부하)을 반환하므로 짧게 재시도한다. */
async function callGeminiOnce(model: string, apiKey: string, systemPrompt: string, userPrompt: string) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
}

async function completeWithGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";

  let res = await callGeminiOnce(model, apiKey, systemPrompt, userPrompt);
  for (let attempt = 0; !res.ok && res.status === 503 && attempt < 2; attempt++) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    res = await callGeminiOnce(model, apiKey, systemPrompt, userPrompt);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini 호출 실패: ${JSON.stringify(data)}`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
}

async function completeChat(systemPrompt: string, userPrompt: string): Promise<string> {
  if (PROVIDER === "ollama") return completeWithOllama(systemPrompt, userPrompt);
  if (PROVIDER === "gemini") return completeWithGemini(systemPrompt, userPrompt);
  return completeWithAnthropic(systemPrompt, userPrompt);
}

interface JudgeResponse {
  verdict: "positive" | "negative" | "none";
  summary: string;
  usedSourceIndexes: number[];
}

const VALID_VERDICTS = new Set(["positive", "negative", "none"]);

/** 파싱된 값이 기대한 스키마를 실제로 갖추고 있는지 확인한다 (모델이 형식을 무시하고
 * 임의 JSON을 낼 수 있으므로, JSON.parse 성공 여부만으로는 안전하지 않다). */
function isValidJudgeResponse(value: unknown): value is JudgeResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    VALID_VERDICTS.has(v.verdict as string) &&
    typeof v.summary === "string" &&
    v.summary.trim().length > 0
  );
}

function fallbackResult(sources: MaterialSource[], reason: string): MaterialInfo {
  return { verdict: "positive", summary: reason, sources };
}

/** 종목 하나에 대해 뉴스+공시 원문을 모아 LLM에게 재료 유무/호재·악재를 판단시킨다. */
export async function judgeMaterial(stockCode: string, stockName: string): Promise<MaterialInfo> {
  const [news, disclosures] = await Promise.all([
    searchRecentNews(stockCode, stockName, 3, 8).catch(() => []),
    getRecentDisclosures(stockCode, 3).catch(() => []),
  ]);

  const sources: MaterialSource[] = [
    ...news.map((n) => ({
      type: "news" as const,
      title: n.title,
      url: n.url,
      publishedAt: n.publishedAt,
      source: n.source,
    })),
    ...disclosures.map((d) => ({
      type: "disclosure" as const,
      title: d.report_nm,
      url: disclosureUrl(d.rcept_no),
      publishedAt: d.rcept_dt,
    })),
  ];

  if (sources.length === 0) {
    return { verdict: "none", summary: "최근 3일 이내 뉴스/공시가 확인되지 않았습니다.", sources: [] };
  }

  const skillPrompt = await loadSkillPrompt();
  const inputList = sources
    .map((s, i) => {
      const body = news[i]?.body; // news는 sources 앞부분과 인덱스가 같음
      const label = s.type === "news" ? `뉴스${s.source ? `/${s.source}` : ""}` : "공시";
      return `[${i}] (${label}) ${s.title}${body ? `\n${body.slice(0, 2000)}` : ""}`;
    })
    .join("\n\n");

  const userPrompt = `종목: ${stockName} (${stockCode})\n\n다음은 이 종목과 관련해 수집된 뉴스/공시 원문 목록이다:\n\n${inputList}\n\n위 SKILL 기준에 따라 이 종목의 재료 유무를 판단하고, JSON 하나만 응답하라.`;

  const text = await completeChat(skillPrompt, userPrompt);
  if (process.env.MATERIAL_JUDGE_DEBUG === "1") {
    console.log("=== RAW LLM RESPONSE START ===\n" + text + "\n=== RAW LLM RESPONSE END ===");
  }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {
    return fallbackResult(sources, "판단 모델 응답이 JSON이 아니어서 안전하게 재료 있음으로 분류했습니다.");
  }
  if (!isValidJudgeResponse(parsed)) {
    return fallbackResult(
      sources,
      "판단 모델이 예상한 형식으로 응답하지 않아 안전하게 재료 있음으로 분류했습니다."
    );
  }

  const usedSources =
    parsed.usedSourceIndexes?.map((i) => sources[i]).filter((s): s is MaterialSource => !!s) ?? sources;

  return {
    verdict: parsed.verdict,
    summary: parsed.summary,
    sources: usedSources.length > 0 ? usedSources : sources,
  };
}
