/**
 * FRED(세인트루이스 연은) 공개 CSV 피드.
 *
 * API 키 없이 쓸 수 있는 공식 소스다. VIX(시카고옵션거래소 산출, 시리즈 ID
 * `VIXCLS`)를 이 경로로 가져온다. 비거래일은 값이 "."로 비어 와서 거른다.
 */

export interface FredObservation {
  date: string; // YYYY-MM-DD
  value: number;
}

export async function getFredSeries(seriesId: string, count: number): Promise<FredObservation[]> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`FRED 조회 실패 (${res.status}): ${seriesId}`);
  const text = await res.text();
  const lines = text.trim().split("\n");
  const rows = lines
    .slice(1)
    .map((line) => {
      const [date, raw] = line.split(",");
      return { date, value: Number(raw) };
    })
    .filter((row) => row.date && Number.isFinite(row.value));
  return rows.slice(-count);
}

/** VIX(VIXCLS) 최근 `count`개 영업일 종가. */
export async function getVix(count = 30): Promise<FredObservation[]> {
  return getFredSeries("VIXCLS", count);
}
