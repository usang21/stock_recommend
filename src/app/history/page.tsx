"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";

interface ReportSummary {
  id: string;
  runDate: string;
  status: string;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  success: "성공",
  partial: "일부 실패",
  failed: "실패",
  running: "생성 중",
};

export default function HistoryPage() {
  const [reports, setReports] = useState<ReportSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/reports")
      .then((res) => res.json())
      .then(setReports)
      .catch(() => setReports([]));
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <AppNav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-1 text-xl font-semibold">리포트 히스토리</h1>
        <p className="mb-6 text-sm text-neutral-500">최근 1개월간 생성된 리포트를 조회할 수 있습니다.</p>

        {reports == null ? (
          <p className="py-12 text-center text-sm text-neutral-500">불러오는 중...</p>
        ) : reports.length === 0 ? (
          <p className="py-12 text-center text-sm text-neutral-500">생성된 리포트가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/history/${r.runDate}/strategy1`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <span className="font-medium">{r.runDate}</span>
                  <span
                    className={
                      r.status === "failed"
                        ? "text-red-600"
                        : r.status === "success"
                          ? "text-neutral-400"
                          : "text-amber-600"
                    }
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
