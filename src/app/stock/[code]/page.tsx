"use client";

import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { CandleChart, type CandleChartData, type MarkerData } from "@/components/CandleChart";

interface CandlesResponse {
  code: string;
  candles: CandleChartData[];
  markers: MarkerData[];
}

export default function StockPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [data, setData] = useState<CandlesResponse | null>(null);
  const searchParams = useSearchParams();
  const highlightDate = searchParams.get("date") ?? undefined;

  useEffect(() => {
    fetch(`/api/stock/${code}/candles`)
      .then((res) => res.json())
      .then(setData);
  }, [code]);

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <AppNav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-1 text-xl font-semibold">{code}</h1>
        <p className="mb-6 text-sm text-neutral-500">
          초록 화살표는 이 페이지로 들어올 때의 추천 시점, 주황 화살표는 이 종목이 각 전략의 최종
          추천 목록에 포함된 날짜입니다.
        </p>
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
