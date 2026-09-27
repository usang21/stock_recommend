"use client";

import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries, createSeriesMarkers, type Time } from "lightweight-charts";

export interface CandleChartData {
  date: string; // YYYYMMDD
  open: number;
  high: number;
  low: number;
  close: number;
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
};

export function CandleChart({ candles, markers }: { candles: CandleChartData[]; markers: MarkerData[] }) {
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

    series.setData(
      candles.map((c) => ({
        time: toTime(c.date),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    if (markers.length > 0) {
      createSeriesMarkers(
        series,
        markers.map((m) => ({
          time: toTime(m.date),
          position: "belowBar" as const,
          color: "#f59e0b",
          shape: "arrowUp" as const,
          text: STRATEGY_LABEL[m.strategyKey] ?? m.strategyKey,
        }))
      );
    }

    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [candles, markers]);

  return <div ref={containerRef} className="h-96 w-full" />;
}
