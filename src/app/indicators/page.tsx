import { AppNav } from "@/components/AppNav";
import { getVixIndicator, VIX_BANDS, type SentimentLabel } from "@/lib/marketIndicators";

// 매일 바뀌는 수치라 정적 생성하지 않는다.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "주요 지표 | 데일리 트레이딩 스크리너",
};

function labelColor(label: SentimentLabel): string {
  switch (label) {
    case "극단적 탐욕":
      return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
    case "탐욕":
      return "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300";
    case "중립":
      return "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";
    case "공포":
      return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
    case "극단적 공포":
      return "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300";
  }
}

function fmtDiff(value: number, prev: number | null): string | null {
  if (prev === null) return null;
  const diff = value - prev;
  if (diff === 0) return "전일과 동일";
  return `전일 대비 ${diff > 0 ? "+" : ""}${diff.toFixed(2)}`;
}

function formatRange(lower: number | null, upper: number | null): string {
  if (lower === null) return `${upper} 미만`;
  if (upper === null) return `${lower} 이상`;
  return `${lower} ~ ${upper}`;
}

/** 현재 값이 어느 구간에 속하는지 눈으로 바로 비교할 수 있게 경계값 전체를 나열한다. */
function VixScale({ current }: { current: SentimentLabel }) {
  return (
    <div className="mt-4 overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
      {VIX_BANDS.map((band, i) => {
        const lower = i === 0 ? null : VIX_BANDS[i - 1].upperBound;
        const range = formatRange(lower, band.upperBound);
        const isCurrent = band.label === current;
        return (
          <div
            key={band.label}
            className={`flex items-center justify-between px-3 py-1.5 text-xs ${
              isCurrent ? `${labelColor(band.label)} font-semibold` : "text-neutral-500"
            }`}
          >
            <span>{isCurrent ? `▶ ${band.label}` : band.label}</span>
            <span className="tabular-nums">{range}</span>
          </div>
        );
      })}
    </div>
  );
}

export default async function IndicatorsPage() {
  let vix: Awaited<ReturnType<typeof getVixIndicator>> | null = null;
  let error: string | null = null;
  try {
    vix = await getVixIndicator();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <AppNav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-1 text-xl font-semibold">주요 지표</h1>
        <p className="mb-6 text-sm text-neutral-500">
          미국 시장의 공포·탐욕 심리를 참고하는 지표입니다. CNN 공포탐욕지수는 공식
          API가 없어, 대신 CBOE가 산출하고 FRED가 공개하는 VIX 수치로 같은 성격의
          구간(극단적 공포~극단적 탐욕)을 자체 기준으로 매핑해 보여줍니다.
        </p>
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <p className="mb-1 font-semibold">VIX 데이터를 불러오지 못했습니다.</p>
            <p className="text-xs opacity-80">{error}</p>
          </div>
        ) : (
          vix && (
            <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-neutral-500">VIX (CBOE Volatility Index)</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">{vix.value.toFixed(2)}</p>
                  {fmtDiff(vix.value, vix.prevValue) && (
                    <p className="mt-1 text-xs text-neutral-500">{fmtDiff(vix.value, vix.prevValue)}</p>
                  )}
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${labelColor(vix.label)}`}>
                  {vix.label}
                </span>
              </div>
              <p className="mt-4 text-xs text-neutral-400">{vix.date} 종가 기준 (FRED VIXCLS)</p>
              <VixScale current={vix.label} />
            </div>
          )
        )}
        <p className="mt-8 text-xs text-neutral-400">
          한국 시장의 VKOSPI는 공신력 있는 무료 API를 아직 확인하지 못해 보류 중입니다
          (BACKLOG.md 참고).
        </p>
      </main>
    </div>
  );
}
