"use client";

import { useEffect, useState } from "react";
import { FunnelView, type StrategyResultData } from "./FunnelView";
import { STRATEGY_TABS, type StrategyTabKey } from "@/lib/strategyMeta";

interface ReportData {
  runDate: string;
  status: string;
  errorMessage: string | null;
  strategyResults: StrategyResultData[];
}

export function ReportView({ date, activeTab }: { date: string; activeTab: StrategyTabKey }) {
  const [report, setReport] = useState<ReportData | null | "not-found">(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reports/${date}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch(() => {
        if (!cancelled) setReport("not-found");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  if (loading) return <p className="py-12 text-center text-sm text-neutral-500">불러오는 중...</p>;
  if (report === "not-found" || report === null) {
    return <p className="py-12 text-center text-sm text-neutral-500">아직 생성된 리포트가 없습니다.</p>;
  }

  const strategyResult = report.strategyResults.find((s) => s.strategyKey === activeTab);
  const label = STRATEGY_TABS.find((t) => t.key === activeTab)?.label ?? activeTab;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-neutral-500">{report.runDate} 리포트</p>
        {report.status !== "success" && (
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              report.status === "failed"
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {report.status === "failed" ? "생성 실패" : report.status === "running" ? "생성 중" : "일부 실패"}
          </span>
        )}
      </div>
      {report.errorMessage && (
        <pre className="mb-4 whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {report.errorMessage}
        </pre>
      )}
      {strategyResult ? (
        <FunnelView result={strategyResult} reportDate={report.runDate} />
      ) : (
        <p className="py-8 text-center text-sm text-neutral-500">{label} 결과가 없습니다.</p>
      )}
    </div>
  );
}
