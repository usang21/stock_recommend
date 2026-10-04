"use client";

import { useState } from "react";

/**
 * 오늘의 브리핑을 Notion에 다시 기록한다.
 *
 * 화면은 열 때마다 네이버를 조회하므로 다시 만들 것이 없다. 이 버튼이 고치는 대상은
 * Notion 기록이고, 그래서 라벨도 "재생성"이 아니라 무엇을 하는지로 적는다.
 *
 * 다른 재생성 버튼들(`RegenerateButton`, `FinalRegenerateButton`)과 같은 방식으로
 * 동작한다 — 눌러서 완료되면 화면을 다시 불러온다.
 */
export function BriefingRegenerateButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/briefing/regenerate", { method: "POST" });
      if (!res.ok) throw new Error((await res.text()).slice(0, 200) || `HTTP ${res.status}`);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
      >
        {loading ? "기록 중..." : "Notion에 다시 기록"}
      </button>
      {error && <span className="max-w-xs text-right text-xs text-red-600">{error}</span>}
    </div>
  );
}
