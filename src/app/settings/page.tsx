"use client";

import { useEffect, useState } from "react";
import { AppNav } from "@/components/AppNav";

interface StrategySetting {
  strategyKey: string;
  strategyName: string;
  params: Record<string, unknown>;
}

const FIELD_LABELS: Record<string, string> = {
  minVolume: "거래량 절대치 (주)",
  minTradingValue: "거래대금 절대치 (원)",
  goldenCrossShortPeriod: "골든크로스 단기 이동평균 기간(일)",
  goldenCrossLongPeriod: "골든크로스 장기 이동평균 기간(일)",
  bigBullishCandleMinBodyPct: "장대양봉 최소 몸통 비율(%)",
  bigBullishLookbackDays: "장대양봉 탐색 기간(일)",
  maDeviationMaxPct: "이격도 허용 최대치(%)",
  maPeriod: "이동평균 기간(일)",
  themeKeywords: "테마 키워드 (쉼표로 구분)",
  volumeSurgeMultiplier: "거래량 급증 배수",
  volumeBaselinePeriod: "거래량 평균 계산 기준 기간(일)",
  volumeSurgeLookbackDays: "거래량 급증 탐색 기간(일)",
  institutionalWindowDays: "기관수급 판정 기준 기간(일)",
  institutionalMinBuyDays: "기관수급 최소 순매수 일수",
};

function StrategySettingForm({ setting, onSaved }: { setting: StrategySetting; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, unknown>>(setting.params);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(values)) {
        if (Array.isArray(val) || typeof val === "string") {
          body[key] = typeof val === "string" && key === "themeKeywords" ? val.split(",").map((s) => s.trim()).filter(Boolean) : val;
        } else {
          body[key] = Number(val);
        }
      }
      const res = await fetch(`/api/settings/${setting.strategyKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setSavedAt(Date.now());
      onSaved();
    } catch {
      alert("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <h3 className="mb-3 font-medium">{setting.strategyName}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(values).map(([key, val]) => (
          <label key={key} className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-500">{FIELD_LABELS[key] ?? key}</span>
            <input
              className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
              value={Array.isArray(val) ? val.join(", ") : String(val)}
              onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        {savedAt && <span className="text-xs text-neutral-400">저장됨 — 다음 실행부터 반영됩니다.</span>}
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<StrategySetting[] | null>(null);

  function load() {
    fetch("/api/settings")
      .then((res) => res.json())
      .then(setSettings);
  }

  useEffect(load, []);

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <AppNav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-1 text-xl font-semibold">전략 파라미터 설정</h1>
        <p className="mb-6 text-sm text-neutral-500">
          숫자 파라미터는 저장 즉시 다음 리포트 생성부터 반영됩니다. 재료 판단 기준은 skills/material-judgment/SKILL.md 파일로 관리합니다.
        </p>
        {settings == null ? (
          <p className="py-12 text-center text-sm text-neutral-500">불러오는 중...</p>
        ) : (
          <div className="space-y-6">
            {settings.map((s) => (
              <StrategySettingForm key={s.strategyKey} setting={s} onSaved={load} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
