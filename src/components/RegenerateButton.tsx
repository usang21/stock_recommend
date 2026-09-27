"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RegenerateButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/regenerate", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
      window.location.reload();
    } catch {
      alert("리포트 재생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
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
      {loading ? "재생성 중... (최대 몇 분 소요)" : "리포트 재생성"}
    </button>
  );
}
