"use client";

import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { CandleChart, type CandleChartData, type MarkerData } from "@/components/CandleChart";

interface CandlesResponse {
  code: string;
  name: string | null;
  candles: CandleChartData[];
  markers: MarkerData[];
}

type Timeframe = "day" | "week" | "month";

const TIMEFRAME_TABS: { key: Timeframe; label: string }[] = [
  { key: "day", label: "일봉" },
  { key: "week", label: "주봉" },
  { key: "month", label: "월봉" },
];

export default function StockPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [data, setData] = useState<CandlesResponse | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("day");
  const searchParams = useSearchParams();
  const highlightDate = searchParams.get("date") ?? undefined;

  useEffect(() => {
    setData(null);
    fetch(`/api/stock/${code}/candles?timeframe=${timeframe}`)
      .then((res) => res.json())
      .then(setData);
  }, [code, timeframe]);

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <AppNav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-1 text-xl font-semibold">
          {data?.name ? `${data.name} ` : ""}
          <span className={data?.name ? "text-neutral-400 font-normal" : ""}>{code}</span>
        </h1>
        <p className="mb-4 text-sm text-neutral-500">
          초록 화살표는 이 페이지로 들어올 때의 추천 시점, 주황 화살표는 이 종목이 각 전략의 최종
          추천 목록에 포함된 날짜입니다(일봉에서만 정확히 맞물려 표시됩니다).
        </p>
        <div className="mb-4 flex gap-1 rounded-lg border border-neutral-200 p-1 w-fit dark:border-neutral-800">
          {TIMEFRAME_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTimeframe(tab.key)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                timeframe === tab.key
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {data ? (
          data.candles.length > 0 ? (
            <CandleChart candles={data.candles} markers={data.markers} highlightDate={highlightDate} />
          ) : (
            <p className="py-12 text-center text-sm text-neutral-500">차트 데이터를 불러올 수 없습니다.</p>
          )
        ) : (
          <p className="py-12 text-center text-sm text-neutral-500">불러오는 중...</p>
        )}
      </main>
    </div>
  );
}
