"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createSeriesMarkers,
  type Time,
} from "lightweight-charts";

export interface CandleChartData {
  date: string; // YYYYMMDD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarkerData {
  date: string; // YYYY-MM-DD
  strategyKey: string;
}

function toTime(dateStr: string): Time {
  const d = dateStr.includes("-") ? dateStr : `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  return d as Time;
}

const STRATEGY_LABEL: Record<string, string> = {
  strategy1: "전략1",
  strategy2: "전략2",
  strategy3: "전략3",
  strategy4: "전략4",
};

const MA_PERIODS = [
  { period: 5, color: "#f97316" },
  { period: 10, color: "#3b82f6" },
  { period: 20, color: "#a855f7" },
  { period: 60, color: "#22c55e" },
] as const;

function computeSMA(candles: CandleChartData[], period: number): { time: Time; value: number }[] {
  const result: { time: Time; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) result.push({ time: toTime(candles[i].date), value: sum / period });
  }
  return result;
}

export function CandleChart({
  candles,
  markers,
  highlightDate,
}: {
  candles: CandleChartData[];
  markers: MarkerData[];
  highlightDate?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: isDark ? "#d4d4d4" : "#404040",
      },
      grid: {
        vertLines: { color: isDark ? "#262626" : "#f0f0f0" },
        horzLines: { color: isDark ? "#262626" : "#f0f0f0" },
      },
      timeScale: { borderColor: isDark ? "#404040" : "#d4d4d4" },
      localization: { dateFormat: "yyyy-MM-dd" },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#dc2626",
      downColor: "#2563eb",
      borderVisible: false,
      wickUpColor: "#dc2626",
      wickDownColor: "#2563eb",
    });
    // 캔들 영역은 위쪽 78%, 아래 22%는 거래량 히스토그램에 내준다.
    series.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.22 } });

    series.setData(
      candles.map((c) => ({
        time: toTime(c.date),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    for (const { period, color } of MA_PERIODS) {
      const maSeries = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      maSeries.setData(computeSMA(candles, period));
    }

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      color: isDark ? "#525252" : "#a3a3a3",
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeries.setData(
      candles.map((c) => ({
        time: toTime(c.date),
        value: c.volume,
        color: c.close >= c.open ? "#fca5a5" : "#93c5fd",
      }))
    );

    const allMarkers: {
      time: Time;
      position: "belowBar" | "aboveBar";
      color: string;
      shape: "arrowUp" | "arrowDown";
      text: string;
    }[] = markers.map((m) => ({
      time: toTime(m.date),
      position: "belowBar",
      color: "#f59e0b",
      shape: "arrowUp",
      text: STRATEGY_LABEL[m.strategyKey] ?? m.strategyKey,
    }));
    if (highlightDate) {
      allMarkers.push({
        time: toTime(highlightDate),
        position: "aboveBar",
        color: "#16a34a",
        shape: "arrowDown",
        text: "추천시점",
      });
    }
    if (allMarkers.length > 0) {
      allMarkers.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
      createSeriesMarkers(series, allMarkers);
    }

    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [candles, markers, highlightDate]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-neutral-500">
        {MA_PERIODS.map(({ period, color }) => (
          <span key={period} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {period}선
          </span>
        ))}
      </div>
      <div ref={containerRef} className="h-96 w-full" />
    </div>
  );
}
