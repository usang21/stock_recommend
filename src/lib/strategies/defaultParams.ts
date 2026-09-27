/** 전략별 기본 파라미터 (DESIGN.md §3 "조정 가능해야 하는 파라미터 예시"). */

export interface Strategy1Params {
  /** 전략1 3단계: 거래량 절대치 필터 (주). minTradingValue와 OR 조건. */
  minVolume: number;
  /** 전략1 3단계: 거래대금 절대치 필터 (원). minVolume과 OR 조건. */
  minTradingValue: number;
}

export interface Strategy2Params {
  /** 강세장 판정용 이동평균 단기/장기 기간 (일) */
  goldenCrossShortPeriod: number;
  goldenCrossLongPeriod: number;
  /** 장대양봉 판정 기준: (종가-시가)/시가 최소 비율(%) */
  bigBullishCandleMinBodyPct: number;
  /** 장대양봉을 찾을 최근 거래일 범위 */
  bigBullishLookbackDays: number;
  /** 이격도(주가-5일선)/5일선 절대값 허용 최대치(%) */
  maDeviationMaxPct: number;
  maPeriod: number;
  /** 시가총액 중심주 테마 키워드 목록 */
  themeKeywords: string[];
}

export interface Strategy3Params {
  /** 거래량 급증 배수 (평소 대비) */
  volumeSurgeMultiplier: number;
  /** 평소 거래량 계산에 쓰는 기준 기간(일) */
  volumeBaselinePeriod: number;
  /** 거래량 급증을 찾을 최근 거래일 범위 */
  volumeSurgeLookbackDays: number;
  /** 기관수급 판정: 최근 N거래일 */
  institutionalWindowDays: number;
  /** 기관수급 판정: N일 중 순매수 최소 일수 */
  institutionalMinBuyDays: number;
  maPeriod: number;
}

export interface Strategy4Params {
  /** 주봉 이동평균 기간(주) */
  weeklyMaPeriod: number;
  /** 최근 N거래일 평균 거래량/거래대금 조건 계산 기간(일) */
  volumeAvgDays: number;
  /** 거래량 절대치 필터 (주). minTradingValue와 OR 조건. */
  minVolume: number;
  /** 거래대금 절대치 필터 (원). minVolume과 OR 조건. */
  minTradingValue: number;
  /** 현재가와 비교할 이동평균 기간(일) */
  maPeriod: number;
}

export const DEFAULT_STRATEGY1_PARAMS: Strategy1Params = {
  minVolume: 10_000_000,
  minTradingValue: 200_000_000_000,
};

export const DEFAULT_STRATEGY2_PARAMS: Strategy2Params = {
  goldenCrossShortPeriod: 20,
  goldenCrossLongPeriod: 60,
  bigBullishCandleMinBodyPct: 5,
  bigBullishLookbackDays: 5,
  maDeviationMaxPct: 3,
  maPeriod: 5,
  themeKeywords: ["반도체", "조선", "방산", "원전", "로봇", "2차전지", "전력"],
};

export const DEFAULT_STRATEGY3_PARAMS: Strategy3Params = {
  volumeSurgeMultiplier: 1.5,
  volumeBaselinePeriod: 20,
  volumeSurgeLookbackDays: 5,
  institutionalWindowDays: 10,
  institutionalMinBuyDays: 8,
  maPeriod: 5,
};

export const DEFAULT_STRATEGY4_PARAMS: Strategy4Params = {
  weeklyMaPeriod: 5,
  volumeAvgDays: 3,
  minVolume: 10_000_000,
  minTradingValue: 200_000_000_000,
  maPeriod: 20,
};

export const STRATEGY_DEFS = {
  strategy1: { name: "상한가 + 재료 + 거래량", defaults: DEFAULT_STRATEGY1_PARAMS },
  strategy2: { name: "강세장 + 테마 + 장대양봉 + 이격도", defaults: DEFAULT_STRATEGY2_PARAMS },
  strategy3: { name: "거래량 급증 + 신고가 + 기관수급 + 상승추세", defaults: DEFAULT_STRATEGY3_PARAMS },
  strategy4: { name: "주봉 5이평선 돌파 + 거래량 + 20일선 상회", defaults: DEFAULT_STRATEGY4_PARAMS },
} as const;

export type StrategyKey = keyof typeof STRATEGY_DEFS;
