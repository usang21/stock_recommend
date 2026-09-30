/**
 * 피드백 루프 (DESIGN.md §13).
 * 1. 최근 1~5거래일 사이에 추천한 종목의 등락을 추천일 종가 기준으로 판정한다.
 * 2. 상승/하락으로 판정된 종목의 사유를 분석한다.
 * 3. 분석 결과를 학습 기록에 누적한다 (다음 추천이 이 기록을 참고한다).
 */
import { prisma } from "@/lib/prisma";
import { getStockCandles } from "@/lib/dataSources/naver";
import { mapWithConcurrency } from "@/lib/concurrency";
import { completeChat, parseJsonObject } from "@/lib/llm";
import { appendLesson, loadOutcomeAnalysisPrompt } from "./logicStore";

/** 상승/하락으로 볼 임계치(%). 이 사이는 보합으로 본다. */
const VERDICT_THRESHOLD_PCT = 3;
/** 추천 후 이 거래일 수까지만 판정 대상으로 삼는다. */
const MAX_REVIEW_TRADING_DAYS = 5;
const FETCH_CONCURRENCY = 6;

export interface ReviewSummary {
  evaluated: number;
  up: number;
  down: number;
  flat: number;
  analyzed: number;
  lessonAdded: boolean;
}

function toYmd(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
}

function verdictOf(changeRate: number): "up" | "down" | "flat" {
  if (changeRate >= VERDICT_THRESHOLD_PCT) return "up";
  if (changeRate <= -VERDICT_THRESHOLD_PCT) return "down";
  return "flat";
}

interface AnalysisTarget {
  pickId: string;
  code: string;
  name: string;
  rank: number | null;
  reason: string;
  strategyKeys: string[];
  basePrice: number;
  currentPrice: number;
  changeRate: number;
  tradingDays: number;
  verdict: "up" | "down";
}

interface RawAnalysis {
  perStock?: { code?: unknown; analysis?: unknown }[];
  lesson?: unknown;
  skip?: unknown;
}

/** 추천 후 아직 5거래일이 지나지 않은 추천 종목들의 등락을 갱신 판정한다. */
async function evaluateRecentPicks(): Promise<{ targets: AnalysisTarget[]; summary: Omit<ReviewSummary, "analyzed" | "lessonAdded"> }> {
  // 달력 기준으로 넉넉히(약 2주) 가져온 뒤, 실제 경과 거래일 수로 걸러낸다.
  const since = new Date();
  since.setDate(since.getDate() - 14);

  const picks = await prisma.recommendationPick.findMany({
    where: { isRecommended: true, recommendedAt: { gte: since } },
    include: { outcome: true },
    orderBy: { recommendedAt: "desc" },
  });

  const targets: AnalysisTarget[] = [];
  let up = 0;
  let down = 0;
  let flat = 0;
  let evaluated = 0;

  await mapWithConcurrency(picks, FETCH_CONCURRENCY, async (pick) => {
    const candles = await getStockCandles(pick.stockCode, 20).catch(() => []);
    const recYmd = toYmd(pick.recommendedAt);
    const after = candles.filter((c) => c.date > recYmd);
    // 추천 다음 거래일이 아직 오지 않았거나, 5거래일을 넘겨 판정이 끝난 종목은 건너뛴다.
    if (after.length === 0 || after.length > MAX_REVIEW_TRADING_DAYS) return null;

    const currentPrice = after[after.length - 1].close;
    const changeRate = ((currentPrice - pick.basePrice) / pick.basePrice) * 100;
    const verdict = verdictOf(changeRate);
    const tradingDays = after.length;

    await prisma.recommendationOutcome.upsert({
      where: { pickId: pick.id },
      update: { evaluatedAt: new Date(), tradingDays, currentPrice, changeRate, verdict },
      create: { pickId: pick.id, tradingDays, currentPrice, changeRate, verdict },
    });

    evaluated += 1;
    if (verdict === "up") up += 1;
    else if (verdict === "down") down += 1;
    else flat += 1;

    // 사유 분석은 상승/하락이 확정된 종목에 대해 한 번만 한다. 같은 종목을
    // 매일 다시 분석하면 같은 관찰이 학습 기록에 중복으로 쌓인다.
    if (verdict !== "flat" && pick.outcome?.analyzedAt == null) {
      targets.push({
        pickId: pick.id,
        code: pick.stockCode,
        name: pick.stockName,
        rank: pick.rank,
        reason: pick.reason,
        strategyKeys: Array.isArray(pick.strategyKeys) ? (pick.strategyKeys as string[]) : [],
        basePrice: pick.basePrice,
        currentPrice,
        changeRate,
        tradingDays,
        verdict,
      });
    }
    return null;
  });

  return { targets, summary: { evaluated, up, down, flat } };
}

function describeTarget(t: AnalysisTarget): string {
  return [
    `- 종목코드 ${t.code} / ${t.name} — ${t.verdict === "up" ? "상승" : "하락"} (${t.changeRate.toFixed(2)}%, ${t.tradingDays}거래일 경과)`,
    `  추천 순위: ${t.rank ?? "-"}위, 통과 전략: ${t.strategyKeys.join(", ") || "-"}`,
    `  추천일 종가 ${t.basePrice.toLocaleString()}원 → 현재가 ${t.currentPrice.toLocaleString()}원`,
    `  당시 추천 근거: ${t.reason}`,
  ].join("\n");
}

/** 상승/하락 종목의 사유를 분석해 종목별 분석과 학습 기록 한 항목을 남긴다. */
async function analyzeOutcomes(allTargets: AnalysisTarget[], runDateLabel: string): Promise<{ analyzed: number; lessonAdded: boolean }> {
  // 같은 종목이 서로 다른 날짜에 추천돼 둘 다 분석 대기 중일 수 있다. 한 회차에는
  // 종목당 하나만 분석한다 — 모델에게 같은 종목코드를 두 번 주면 어느 쪽 분석인지
  // 구분할 수 없기 때문이다. 나머지는 다음 회차에 처리된다.
  const deduped = new Map<string, AnalysisTarget>();
  for (const t of allTargets) if (!deduped.has(t.code)) deduped.set(t.code, t);
  const targets = [...deduped.values()];

  if (targets.length === 0) return { analyzed: 0, lessonAdded: false };

  const systemPrompt = await loadOutcomeAnalysisPrompt();
  const userPrompt = [
    `추천 후 1~${MAX_REVIEW_TRADING_DAYS}거래일이 지나 상승(+${VERDICT_THRESHOLD_PCT}% 이상) 또는 하락(-${VERDICT_THRESHOLD_PCT}% 이하)으로 판정된 종목은 다음 ${targets.length}개다.`,
    "",
    targets.map(describeTarget).join("\n"),
    "",
    "위 기준에 따라 각 종목이 오르거나 내린 사유를 분석하고, JSON 하나만 응답하라.",
  ].join("\n");

  const text = await completeChat(systemPrompt, userPrompt, { maxTokens: 4096 });
  const parsed = parseJsonObject(text) as RawAnalysis | null;
  if (!parsed) throw new Error(`결과 분석 모델 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);

  const byCode = new Map(targets.map((t) => [t.code, t]));
  const perStock = (Array.isArray(parsed.perStock) ? parsed.perStock : []).filter(
    (p) => typeof p?.code === "string" && byCode.has(p.code) && typeof p?.analysis === "string"
  );

  let analyzed = 0;
  for (const entry of perStock) {
    // 같은 종목이 다른 날짜에도 추천됐을 수 있으므로, 종목코드로 다시 찾지 않고
    // 판정 단계에서 들고 온 pickId에 그대로 기록한다.
    const target = byCode.get(entry.code as string)!;
    await prisma.recommendationOutcome.update({
      where: { pickId: target.pickId },
      data: { analysis: (entry.analysis as string).trim(), analyzedAt: new Date() },
    });
    analyzed += 1;
  }

  const lesson = typeof parsed.lesson === "string" ? parsed.lesson.trim() : "";
  if (parsed.skip === true || lesson.length === 0) return { analyzed, lessonAdded: false };

  const upCount = targets.filter((t) => t.verdict === "up").length;
  const downCount = targets.length - upCount;
  await appendLesson(
    `${runDateLabel} — 상승 ${upCount}건 / 하락 ${downCount}건 분석`,
    lesson,
    `${runDateLabel} 피드백 루프가 상승 ${upCount}건, 하락 ${downCount}건을 분석해 관찰을 추가했습니다.`
  );
  return { analyzed, lessonAdded: true };
}

/** 피드백 루프 전체. 추천을 만들기 전에 먼저 돈다. */
export async function reviewPastRecommendations(runDateLabel: string): Promise<ReviewSummary> {
  const { targets, summary } = await evaluateRecentPicks();
  const { analyzed, lessonAdded } = await analyzeOutcomes(targets, runDateLabel);
  return { ...summary, analyzed, lessonAdded };
}
