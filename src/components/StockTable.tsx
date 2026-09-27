"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface PickRow {
  code: string;
  name: string;
  price: number | null;
  changeRate: number | null;
  volume: number | null;
  tradingValue: number | null;
  materialVerdict?: string | null;
  materialSummary?: string | null;
  materialSources?: unknown;
  institutionalMeetsThreshold?: boolean | null;
  institutionalBuyDaysCount?: number | null;
  institutionalWindowDays?: number | null;
  institutionalMinBuyDays?: number | null;
  institutionalDays?: unknown;
  newHighLabel?: string | null;
}

interface InstitutionalDay {
  date: string; // YYYYMMDD
  organNetBuy: number;
  foreignerNetBuy: number;
}

function fmtDate(yyyymmdd: string): string {
  const m = yyyymmdd.match(/^\d{4}(\d{2})(\d{2})$/);
  return m ? `${m[1]}/${m[2]}` : yyyymmdd;
}

function fmtSigned(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString()}`;
}

function fmtNum(n: number | null) {
  if (n == null) return "-";
  return n.toLocaleString();
}

function fmtRate(n: number | null) {
  if (n == null) return "-";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function rateColor(n: number | null) {
  if (n == null) return "";
  if (n > 0) return "text-red-600";
  if (n < 0) return "text-blue-600";
  return "text-neutral-500";
}

const VERDICT_BADGE: Record<string, { label: string; className: string }> = {
  positive: { label: "호재", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  negative: { label: "악재", className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  none: {
    label: "중립",
    className: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  },
};

type SortKey = "changeRate" | "volume" | "tradingValue";
type SortDir = "asc" | "desc";

const SORTABLE_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "changeRate", label: "등락률" },
  { key: "volume", label: "거래량" },
  { key: "tradingValue", label: "거래대금" },
];

export function StockTable({
  picks,
  showMaterial = false,
  showInstitutional = false,
  reportDate,
}: {
  picks: PickRow[];
  showMaterial?: boolean;
  showInstitutional?: boolean;
  /** 이 표가 속한 리포트의 날짜 (YYYY-MM-DD). 종목 클릭 시 차트에 추천시점으로 표시한다. */
  reportDate?: string;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  const sortedPicks = useMemo(() => {
    if (!sort) return picks;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...picks].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // null은 항상 뒤로
      if (bv == null) return -1;
      return (av - bv) * factor;
    });
  }, [picks, sort]);

  if (picks.length === 0) {
    return <p className="py-8 text-center text-sm text-neutral-500">해당 단계를 통과한 종목이 없습니다.</p>;
  }

  function handleSort(key: SortKey) {
    setSort((prev) => {
      if (prev?.key === key) return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
      return { key, dir: "desc" }; // 처음 클릭하면 큰 값이 먼저 오도록 내림차순부터
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
          <tr>
            <th className="px-3 py-2 font-medium">종목명</th>
            <th className="px-3 py-2 font-medium">현재가</th>
            {SORTABLE_COLUMNS.map((col) => (
              <th key={col.key} className="px-3 py-2 font-medium">
                <button
                  onClick={() => handleSort(col.key)}
                  className="flex items-center gap-0.5 hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  {col.label}
                  <span className="w-3 text-[10px] leading-none">
                    {sort?.key === col.key ? (sort.dir === "desc" ? "▼" : "▲") : ""}
                  </span>
                </button>
              </th>
            ))}
            {showMaterial && <th className="px-3 py-2 font-medium">재료 판단</th>}
            {showInstitutional && <th className="px-3 py-2 font-medium">최근 기관/외국인 수급</th>}
          </tr>
        </thead>
        <tbody>
          {sortedPicks.map((p) => (
            <tr key={p.code} className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="px-3 py-2">
                <Link
                  href={reportDate ? `/stock/${p.code}?date=${reportDate}` : `/stock/${p.code}`}
                  className="font-medium hover:underline"
                >
                  {p.name}
                </Link>
                <span className="ml-1 text-xs text-neutral-400">{p.code}</span>
              </td>
              <td className="px-3 py-2">
                {fmtNum(p.price)}
                {p.newHighLabel && (
                  <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    {p.newHighLabel}
                  </span>
                )}
              </td>
              <td className={`px-3 py-2 ${rateColor(p.changeRate)}`}>{fmtRate(p.changeRate)}</td>
              <td className="px-3 py-2">{fmtNum(p.volume)}</td>
              <td className="px-3 py-2">{fmtNum(p.tradingValue)}</td>
              {showMaterial && (
                <td className="max-w-xs px-3 py-2">
                  {p.materialVerdict && VERDICT_BADGE[p.materialVerdict] && (
                    <span
                      className={`mr-1 rounded px-1.5 py-0.5 text-xs font-medium ${VERDICT_BADGE[p.materialVerdict].className}`}
                    >
                      {VERDICT_BADGE[p.materialVerdict].label}
                    </span>
                  )}
                  <p className="mt-1 text-xs text-neutral-500">{p.materialSummary}</p>
                  {Array.isArray(p.materialSources) &&
                    (p.materialSources as { title: string; url: string; source?: string }[]).map((s, i) => (
                      <a
                        key={i}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 block truncate text-xs text-neutral-400 hover:underline"
                      >
                        {s.source ? `[${s.source}] ` : ""}
                        {s.title}
                      </a>
                    ))}
                </td>
              )}
              {showInstitutional && (
                <td className="max-w-sm px-3 py-2">
                  {p.institutionalBuyDaysCount != null && (
                    <>
                      <span
                        className={`mr-1 rounded px-1.5 py-0.5 text-xs font-medium ${
                          p.institutionalMeetsThreshold
                            ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                            : "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                        }`}
                      >
                        {p.institutionalMeetsThreshold ? "충족" : "미달"}
                      </span>
                      <span className="text-xs text-neutral-500">
                        최근 {p.institutionalWindowDays}일 중 {p.institutionalBuyDaysCount}일 기관 순매수
                        (기준 {p.institutionalMinBuyDays}일)
                      </span>
                      {Array.isArray(p.institutionalDays) && (
                        <ul className="mt-1 space-y-0.5 text-xs text-neutral-400">
                          {(p.institutionalDays as InstitutionalDay[]).map((d) => (
                            <li key={d.date}>
                              {fmtDate(d.date)} 기관{" "}
                              <span className={d.organNetBuy >= 0 ? "text-red-600" : "text-blue-600"}>
                                {fmtSigned(d.organNetBuy)}
                              </span>
                              {" · "}외국인{" "}
                              <span className={d.foreignerNetBuy >= 0 ? "text-red-600" : "text-blue-600"}>
                                {fmtSigned(d.foreignerNetBuy)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
