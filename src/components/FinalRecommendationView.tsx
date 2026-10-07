"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Recommendation {
  rank: number | null;
  code: string;
  name: string;
  reason: string;
  basePrice: number;
  strategyKeys: unknown;
}

interface Excluded {
  code: string;
  name: string;
  reason: string;
}

interface PastOutcome {
  recommendedAt: string;
  rank: number | null;
  code: string;
  name: string;
  reason: string;
  basePrice: number;
  strategyKeys: unknown;
  outcome: {
    tradingDays: number;
    currentPrice: number;
    changeRate: number;
    verdict: string;
    analysis: string | null;
  } | null;
}

interface FinalRecommendationData {
  runDate: string;
  status: string;
  errorMessage: string | null;
  criteriaVersion: number | null;
  lessonVersion: number | null;
  recommendations: Recommendation[];
  excluded: Excluded[];
  recentOutcomes: PastOutcome[];
}

const STRATEGY_SHORT: Record<string, string> = {
  strategy1: "전략1",
  strategy2: "전략2",
  strategy3: "전략3",
  strategy4: "전략4",
};

const VERDICT_BADGE: Record<string, { label: string; className: string }> = {
  up: { label: "상승", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  down: { label: "하락", className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  flat: { label: "보합", className: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" },
};

function strategyList(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

function StrategyBadges({ keys }: { keys: string[] }) {
  return (
    <span className="ml-2 inline-flex gap-1">
      {keys.map((k) => (
        <span
          key={k}
          className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
        >
          {STRATEGY_SHORT[k] ?? k}
        </span>
      ))}
    </span>
  );
}

function RecommendationCard({ item, reportDate }: { item: Recommendation; reportDate: string }) {
  const keys = strategyList(item.strategyKeys);
  return (
    <li className="flex gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900">
        {item.rank}
      </span>
      <div className="min-w-0">
        <p className="font-medium">
          <Link href={`/stock/${item.code}?date=${reportDate}`} className="hover:underline">
            {item.name}
          </Link>
          <span className="ml-1 text-xs text-neutral-400">{item.code}</span>
          {keys.length > 1 && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              {keys.length}개 전략 중복
            </span>
          )}
          <StrategyBadges keys={keys} />
        </p>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{item.reason}</p>
        <p className="mt-1 text-xs text-neutral-400">
          추천일 종가 {item.basePrice.toLocaleString()}원 (상승/하락 판정 기준가)
        </p>
      </div>
    </li>
  );
}

function RecentOutcomes({ items }: { items: PastOutcome[] }) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-neutral-500">
        아직 판정된 과거 추천이 없습니다. 추천 다음 거래일부터 결과가 쌓입니다.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
          <tr>
            <th className="px-3 py-2 font-medium">추천일</th>
            <th className="px-3 py-2 font-medium">종목</th>
            <th className="px-3 py-2 font-medium">등락률</th>
            <th className="px-3 py-2 font-medium">판정</th>
            <th className="px-3 py-2 font-medium">분석</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const badge = item.outcome ? VERDICT_BADGE[item.outcome.verdict] : null;
            return (
              <tr key={`${item.recommendedAt}-${item.code}`} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="whitespace-nowrap px-3 py-2 text-neutral-500">{item.recommendedAt}</td>
                <td className="px-3 py-2">
                  <Link href={`/stock/${item.code}?date=${item.recommendedAt}`} className="font-medium hover:underline">
                    {item.name}
                  </Link>
                  <span className="ml-1 text-xs text-neutral-400">{item.rank}위</span>
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-2 ${
                    item.outcome == null
                      ? "text-neutral-400"
                      : item.outcome.changeRate > 0
                        ? "text-red-600"
                        : item.outcome.changeRate < 0
                          ? "text-blue-600"
                          : ""
                  }`}
                >
                  {item.outcome
                    ? `${item.outcome.changeRate > 0 ? "+" : ""}${item.outcome.changeRate.toFixed(2)}% (${item.outcome.tradingDays}거래일)`
                    : "판정 전"}
                </td>
                <td className="px-3 py-2">
                  {badge && (
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                  )}
                </td>
                <td className="max-w-md px-3 py-2 text-xs text-neutral-500">{item.outcome?.analysis ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FinalRecommendationView() {
  const [data, setData] = useState<FinalRecommendationData | null | "not-found">(null);
  const [loading, setLoading] = useState(true);
  const [showExcluded, setShowExcluded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/final-recommendation/latest")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData("not-found");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="py-12 text-center text-sm text-neutral-500">불러오는 중...</p>;
  if (data === "not-found" || data === null) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">
        아직 생성된 종합 추천이 없습니다. 리포트가 준비된 뒤 자동으로 생성되며, 위 버튼으로 직접 실행할 수도 있습니다.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-500">
          {data.runDate} 기준
          {data.criteriaVersion != null && data.lessonVersion != null && (
            <span className="ml-2 text-xs text-neutral-400">
              판단 기준 v{data.criteriaVersion} · 학습 기록 v{data.lessonVersion}
            </span>
          )}
        </p>
        {data.status !== "success" && (
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              data.status === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {data.status === "failed" ? "생성 실패" : data.status === "running" ? "생성 중" : data.status}
          </span>
        )}
      </div>

      {data.errorMessage && (
        <pre className="mb-4 whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {data.errorMessage}
        </pre>
      )}

      <h3 className="mb-2 text-base font-semibold">추천 종목 ({data.recommendations.length}개)</h3>
      {data.recommendations.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">
          {data.excluded.length > 0
            ? `추천 자격을 넘는 종목이 없었습니다. 후보 ${data.excluded.length}개는 아래에서 제외 사유와 함께 확인할 수 있습니다.`
            : "오늘은 전략을 최종 통과한 후보 자체가 없었습니다."}
        </p>
      ) : (
        <ul className="space-y-2">
          {data.recommendations.map((item) => (
            <RecommendationCard key={item.code} item={item} reportDate={data.runDate} />
          ))}
        </ul>
      )}

      {data.excluded.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowExcluded((v) => !v)}
            className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            {showExcluded ? "제외된 종목 접기" : `제외된 종목 보기 (${data.excluded.length}개)`}
          </button>
          {showExcluded && (
            <ul className="mt-3 space-y-2">
              {data.excluded.map((item) => (
                <li key={item.code} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                  <p className="text-sm font-medium">
                    {item.name}
                    <span className="ml-1 text-xs text-neutral-400">{item.code}</span>
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">{item.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-10">
        <h3 className="mb-1 text-base font-semibold">최근 추천 성과</h3>
        <p className="mb-3 text-xs text-neutral-500">
          추천일 종가 대비 +3% 이상이면 상승, -3% 이하면 하락으로 판정합니다. 추천 후 5거래일까지 갱신되며, 상승/하락
          종목의 분석 내용은 학습 기록에 누적되어 다음 추천에 반영됩니다.
        </p>
        <RecentOutcomes items={data.recentOutcomes} />
      </div>
    </div>
  );
}
