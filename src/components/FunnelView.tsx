"use client";

import { useState } from "react";
import { StockTable, type PickRow } from "./StockTable";

export interface FunnelStepData {
  stepIndex: number;
  stepName: string;
  isFinal: boolean;
  picks: PickRow[];
}

export interface StrategyResultData {
  strategyKey: string;
  strategyName: string;
  paramsSnapshot: Record<string, unknown>;
  steps: FunnelStepData[];
}

const VERDICT_ORDER: Record<string, number> = { positive: 0, negative: 1, none: 2 };

/** 재료 판단이 매겨진 단계인지: 종목 중 하나라도 materialVerdict가 있으면 해당 단계로 본다. */
function hasMaterialVerdicts(picks: PickRow[]): boolean {
  return picks.some((p) => p.materialVerdict != null);
}

/** 기관수급 현황이 매겨진 단계인지 (전략3). */
function hasInstitutionalInfo(picks: PickRow[]): boolean {
  return picks.some((p) => p.institutionalBuyDaysCount != null);
}

/** 호재/악재/중립을 표 하나에 행 순서로만 구분한다 — 판단 결과는 이미 맨 오른쪽 열에 표시된다. */
function sortByVerdict(picks: PickRow[]): PickRow[] {
  return [...picks].sort(
    (a, b) => (VERDICT_ORDER[a.materialVerdict ?? "none"] ?? 3) - (VERDICT_ORDER[b.materialVerdict ?? "none"] ?? 3)
  );
}

export function FunnelView({ result }: { result: StrategyResultData }) {
  const [expanded, setExpanded] = useState(false);
  const finalStep = result.steps.find((s) => s.isFinal) ?? result.steps[result.steps.length - 1];
  const priorSteps = result.steps.filter((s) => s !== finalStep);
  const isStrategy1 = result.strategyKey === "strategy1";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
        {result.steps.map((s, i) => (
          <span key={s.stepIndex} className="flex items-center gap-2">
            {i > 0 && <span>→</span>}
            <span className={s.isFinal ? "font-semibold text-neutral-900 dark:text-neutral-100" : ""}>
              {s.stepIndex}단계 {s.picks.length}종목
            </span>
          </span>
        ))}
      </div>

      <h3 className="mb-2 text-base font-semibold">
        최종 후보 — {finalStep.stepName} ({finalStep.picks.length}종목)
      </h3>

      <StockTable
        picks={finalStep.picks}
        showMaterial={isStrategy1}
        showInstitutional={hasInstitutionalInfo(finalStep.picks)}
      />

      {priorSteps.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            {expanded ? "이전 단계 접기" : "이전 단계에서 걸러진 종목 보기"}
          </button>
          {expanded && (
            <div className="mt-4 space-y-6">
              {priorSteps
                .sort((a, b) => a.stepIndex - b.stepIndex)
                .map((step) => (
                  <div key={step.stepIndex}>
                    <h4 className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-400">
                      {step.stepIndex}단계 — {step.stepName} ({step.picks.length}종목)
                    </h4>
                    <StockTable
                      picks={hasMaterialVerdicts(step.picks) ? sortByVerdict(step.picks) : step.picks}
                      showMaterial={hasMaterialVerdicts(step.picks)}
                      showInstitutional={hasInstitutionalInfo(step.picks)}
                    />
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
