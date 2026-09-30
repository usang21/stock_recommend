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

/**
 * 대시보드에만 추가로 붙는 탭 (DESIGN.md §13). 히스토리 화면에는 붙이지 않는다 —
 * 히스토리는 전략별 퍼널을 날짜로 되짚는 화면이라 종합 추천과 성격이 다르고,
 * /history/[date]/final 경로도 없기 때문이다.
 */
export const FINAL_RECOMMENDATION_TAB = { key: "final", label: "종합 추천" } as const;
