import Link from "next/link";
import { STRATEGY_TABS, type StrategyTabKey } from "@/lib/strategyMeta";

export function StrategyTabs({ basePath, active }: { basePath: string; active: StrategyTabKey }) {
  return (
    <div className="mb-6 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
      {STRATEGY_TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`${basePath}/${tab.key}`}
          className={`px-4 py-2 text-sm font-medium ${
            active === tab.key
              ? "border-b-2 border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100"
              : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
