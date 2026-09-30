/**
 * LLM 호출 공용 모듈.
 *
 * Provider는 LLM_PROVIDER로 정하고, 없으면 기존 MATERIAL_JUDGE_PROVIDER를 따른다 —
 * 이미 운영 중인 환경변수를 그대로 쓰기 위함이다(새 키를 설정하지 않아도 동작한다).
 * - "anthropic": Claude API. ANTHROPIC_API_KEY 필요.
 * - "gemini": Google Gemini API. GEMINI_API_KEY 필요, 무료 티어로 운영 가능.
 * - "ollama": 로컬 Ollama. 클라우드 배포에서는 로컬호스트에 접근할 수 없어 개발용.
 *
 * 재료 판단 Agent(materialJudge.ts)에도 같은 역할의 코드가 있지만, 그쪽은 이미
 * 운영 중이라 건드리지 않았다(DESIGN.md §13 "기존 로직과의 격리"). 나중에 재료
 * 판단 쪽을 이 모듈로 옮기는 것은 별개 작업으로 남겨둔다.
 */
import Anthropic from "@anthropic-ai/sdk";

const PROVIDER = (process.env.LLM_PROVIDER || process.env.MATERIAL_JUDGE_PROVIDER || "anthropic").toLowerCase();

async function completeWithAnthropic(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");
  const client = new Anthropic({ apiKey });
  const model = process.env.LLM_MODEL || process.env.MATERIAL_JUDGE_MODEL || "claude-sonnet-5";
  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
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

/** 429 응답의 RetryInfo에 담긴 "56s" 같은 권장 대기시간(초)을 뽑아낸다. 없으면 null. */
function extractRetryDelaySeconds(data: unknown): number | null {
  const details = (data as { error?: { details?: { "@type"?: string; retryDelay?: string }[] } })?.error?.details;
  const retryInfo = details?.find((d) => d["@type"]?.includes("RetryInfo"));
  const match = retryInfo?.retryDelay?.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Number(match[1]) : null;
}

// 무료 티어 Gemini는 분당 5회 제한이 있어, 호출 전에 최소 간격을 확보한다.
const MIN_GEMINI_INTERVAL_MS = 15_000;
let lastGeminiCallAt = 0;

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

  const sinceLastCall = Date.now() - lastGeminiCallAt;
  if (sinceLastCall < MIN_GEMINI_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_GEMINI_INTERVAL_MS - sinceLastCall));
  }
  lastGeminiCallAt = Date.now();

  let res = await callGeminiOnce(model, apiKey, systemPrompt, userPrompt);
  let data = await res.json();
  // 503(일시 과부하)은 재시도로 풀릴 수 있어 몇 번 더 시도하고, 429는 대부분
  // 일일 한도 소진이라 한 번만 시도하고 빨리 포기한다 (materialJudge.ts와 동일한 판단).
  for (let attempt = 0; !res.ok && (res.status === 503 || res.status === 429) && attempt < 3; attempt++) {
    if (res.status === 429 && attempt >= 1) break;
    const waitSec = res.status === 429 ? Math.min(extractRetryDelaySeconds(data) ?? 10, 20) : 3 * 2 ** attempt;
    await new Promise((r) => setTimeout(r, waitSec * 1000));
    lastGeminiCallAt = Date.now();
    res = await callGeminiOnce(model, apiKey, systemPrompt, userPrompt);
    data = await res.json();
  }
  if (!res.ok) throw new Error(`Gemini 호출 실패: ${JSON.stringify(data)}`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
}

export async function completeChat(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens?: number } = {}
): Promise<string> {
  const maxTokens = opts.maxTokens ?? 2048;
  if (PROVIDER === "ollama") return completeWithOllama(systemPrompt, userPrompt);
  if (PROVIDER === "gemini") return completeWithGemini(systemPrompt, userPrompt);
  return completeWithAnthropic(systemPrompt, userPrompt, maxTokens);
}

/** 모델 응답에서 JSON 객체 하나를 뽑아 파싱한다. 실패하면 null. */
export function parseJsonObject(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(match ? match[0] : text);
  } catch {
    return null;
  }
}
