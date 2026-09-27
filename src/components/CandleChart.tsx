"use client";

import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries, HistogramSeries, createSeriesMarkers, type Time } from "lightweight-charts";

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
};

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

  return <div ref={containerRef} className="h-96 w-full" />;
}
