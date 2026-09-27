export const STRATEGY_TABS = [
  { key: "strategy1", label: "전략1" },
  { key: "strategy2", label: "전략2" },
  { key: "strategy3", label: "전략3" },
  { key: "strategy4", label: "전략4" },
] as const;

export type StrategyTabKey = (typeof STRATEGY_TABS)[number]["key"];

export function isStrategyKey(v: string): v is StrategyTabKey {
  return STRATEGY_TABS.some((t) => t.key === v);
}
