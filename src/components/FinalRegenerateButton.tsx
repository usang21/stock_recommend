"use client";

import { useState } from "react";

export function FinalRegenerateButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/final-recommendation/regenerate", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { status: string; message?: string };
      if (result.status === "skipped") {
        alert(result.message ?? "리포트가 준비되지 않아 종합 추천을 건너뛰었습니다.");
        return;
      }
      window.location.reload();
    } catch {
      alert("종합 추천 실행에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
    >
      {loading ? "실행 중... (최대 몇 분 소요)" : "종합 추천 다시 실행"}
    </button>
  );
}
