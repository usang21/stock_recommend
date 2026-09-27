export interface StockQuote {
  code: string;
  name: string;
  price: number;
  changeRate: number;
  volume: number;
  tradingValue: number;
}

export interface MaterialSource {
  title: string;
  url: string;
  type: "news" | "disclosure";
  publishedAt?: string;
  source?: string; // 언론사명 (뉴스인 경우)
}

export interface MaterialInfo {
  verdict: "positive" | "negative" | "none";
  summary: string;
  sources: MaterialSource[];
}

export interface InstitutionalDayFlow {
  date: string; // YYYYMMDD
  organNetBuy: number; // 기관 순매수 수량 (음수면 순매도)
  foreignerNetBuy: number; // 외국인 순매수 수량
}

export interface InstitutionalInfo {
  meetsThreshold: boolean;
  buyDaysCount: number;
  windowDays: number;
  minBuyDays: number;
  days: InstitutionalDayFlow[]; // 최근 N거래일, 최신순
}

export type PickWithMaterial = StockQuote & {
  material?: MaterialInfo;
  institutional?: InstitutionalInfo;
  newHighLabel?: string; // "20일 신고가" | "60일 신고가" | "52주 신고가" | "역사적 신고가"
};

export interface FunnelStepResult {
  stepIndex: number;
  stepName: string;
  isFinal: boolean;
  picks: PickWithMaterial[];
}

export interface StrategyRunResult {
  strategyKey: "strategy1" | "strategy2" | "strategy3";
  strategyName: string;
  paramsSnapshot: Record<string, unknown>;
  steps: FunnelStepResult[];
}
