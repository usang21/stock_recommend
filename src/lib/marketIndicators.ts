import { getVix } from "./dataSources/fred";

export type SentimentLabel = "극단적 공포" | "공포" | "중립" | "탐욕" | "극단적 탐욕";

/** 화면에 경계값을 함께 보여줄 수 있도록 구간을 배열로 정의한다(낮은 값=탐욕 순). */
export interface VixBand {
  label: SentimentLabel;
  /** 이 구간의 상한(미만). 마지막 구간은 상한이 없다(null). */
  upperBound: number | null;
}

/**
 * CNN 공포탐욕지수는 공식 API가 없어 비공식 엔드포인트(production.dataviz.cnn.io 등)에
 * 의존해야 하고, 그 엔드포인트는 CNN이 예고 없이 막거나 바꿀 수 있다. 대신 VIX
 * 구간을 공포/탐욕으로 직접 매핑해 쓴다 — CBOE가 산출하고 FRED가 공식 공개하는
 * 수치(VIXCLS)만 쓰는 대체 지표다. 아래 경계값(12/20/25/30)은 업계에서 통상
 * 쓰이는 눈금을 따른 자체 판단이며, CNN 지수와 같은 산출식이 아니다.
 */
export const VIX_BANDS: VixBand[] = [
  { label: "극단적 탐욕", upperBound: 12 },
  { label: "탐욕", upperBound: 20 },
  { label: "중립", upperBound: 25 },
  { label: "공포", upperBound: 30 },
  { label: "극단적 공포", upperBound: null },
];

function vixToSentiment(vix: number): SentimentLabel {
  const band = VIX_BANDS.find((b) => b.upperBound === null || vix < b.upperBound);
  // VIX_BANDS의 마지막 원소가 upperBound: null이라 항상 하나는 매칭된다.
  return band!.label;
}

export interface VixIndicator {
  date: string;
  value: number;
  prevValue: number | null;
  label: SentimentLabel;
}

export async function getVixIndicator(): Promise<VixIndicator> {
  const series = await getVix(5);
  if (series.length === 0) throw new Error("VIX 데이터가 비어 있습니다.");
  const latest = series[series.length - 1];
  const prev = series.length >= 2 ? series[series.length - 2] : null;
  return {
    date: latest.date,
    value: latest.value,
    prevValue: prev?.value ?? null,
    label: vixToSentiment(latest.value),
  };
}
