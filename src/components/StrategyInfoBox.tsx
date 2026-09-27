import { STRATEGY_DESCRIPTIONS } from "@/lib/strategyDescriptions";
import type { StrategyTabKey } from "@/lib/strategyMeta";

export function StrategyInfoBox({ strategyKey }: { strategyKey: StrategyTabKey }) {
  const info = STRATEGY_DESCRIPTIONS[strategyKey];
  return (
    <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-2 text-sm font-semibold">{info.title}</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-600 dark:text-neutral-400">
        {info.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
