"use client";

import { useEffect, useState } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import type { Drawing } from "@/lib/drawings/types";
import { HLineDraw } from "./HLineDraw";
import { VLineDraw } from "./VLineDraw";
import { HRayDraw } from "./HRayDraw";
import { TrendLineDraw } from "./TrendLineDraw";
import { RayDraw } from "./RayDraw";
import { ParallelChannelDraw } from "./ParallelChannelDraw";
import { FibRetracementDraw } from "./FibRetracementDraw";

interface Props {
  symbol: string;
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
  container: HTMLElement | null;
  width: number;
  height: number;
  /** Bumped whenever the chart pans/zooms so we re-render pixel coords */
  renderTick: number;
}

export function DrawingsLayer({
  symbol,
  chart,
  candleSeries,
  container,
  width,
  height,
  renderTick,
}: Props) {
  const drawings = useDrawingsStore((s) => s.drawings);
  const selectedId = useDrawingsStore((s) => s.selectedId);
  const setSelected = useDrawingsStore((s) => s.setSelected);

  // Force re-render when symbol or renderTick changes
  const [, setTick] = useState(0);
  useEffect(() => {
    setTick((t) => t + 1);
  }, [renderTick, symbol]);

  if (!chart || !candleSeries) return null;

  const visible = drawings.filter((d) => d.symbol === symbol);

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      style={{ overflow: "visible" }}
    >
      {visible.map((d) =>
        renderDrawing({
          d,
          chart,
          candleSeries,
          container,
          width,
          height,
          selected: selectedId === d.id,
          onSelect: () => setSelected(d.id),
        }),
      )}
    </svg>
  );
}

interface RenderArgs {
  d: Drawing;
  chart: IChartApi;
  candleSeries: ISeriesApi<"Candlestick">;
  container: HTMLElement | null;
  width: number;
  height: number;
  selected: boolean;
  onSelect: () => void;
}

function renderDrawing(args: RenderArgs) {
  const { d, chart, candleSeries, container, width, height, selected, onSelect } = args;
  switch (d.kind) {
    case "hline": {
      const y = candleSeries.priceToCoordinate(d.price);
      if (y === null) return null;
      return (
        <HLineDraw
          key={d.id}
          drawing={d}
          y={y}
          width={width}
          selected={selected}
          onSelect={onSelect}
        />
      );
    }
    case "vline": {
      const x = chart.timeScale().timeToCoordinate(d.time as UTCTimestamp);
      if (x === null) return null;
      return (
        <VLineDraw
          key={d.id}
          drawing={d}
          x={x}
          height={height}
          selected={selected}
          onSelect={onSelect}
        />
      );
    }
    case "hray": {
      const x = chart.timeScale().timeToCoordinate(d.anchor.time as UTCTimestamp);
      const y = candleSeries.priceToCoordinate(d.anchor.price);
      if (x === null || y === null) return null;
      return (
        <HRayDraw
          key={d.id}
          drawing={d}
          anchorX={x}
          y={y}
          width={width}
          selected={selected}
          onSelect={onSelect}
        />
      );
    }
    case "trendline": {
      const ax = chart.timeScale().timeToCoordinate(d.a.time as UTCTimestamp);
      const ay = candleSeries.priceToCoordinate(d.a.price);
      const bx = chart.timeScale().timeToCoordinate(d.b.time as UTCTimestamp);
      const by = candleSeries.priceToCoordinate(d.b.price);
      if (ax === null || ay === null || bx === null || by === null) return null;
      return (
        <TrendLineDraw
          key={d.id}
          drawing={d}
          ax={ax}
          ay={ay}
          bx={bx}
          by={by}
          selected={selected}
          onSelect={onSelect}
          chart={chart}
          candleSeries={candleSeries}
          container={container}
        />
      );
    }
    case "parallel-channel": {
      const ax = chart.timeScale().timeToCoordinate(d.a.time as UTCTimestamp);
      const ay = candleSeries.priceToCoordinate(d.a.price);
      const bx = chart.timeScale().timeToCoordinate(d.b.time as UTCTimestamp);
      const by = candleSeries.priceToCoordinate(d.b.price);
      const cx = chart.timeScale().timeToCoordinate(d.c.time as UTCTimestamp);
      const cy = candleSeries.priceToCoordinate(d.c.price);
      if (ax === null || ay === null || bx === null || by === null || cx === null || cy === null) return null;
      return (
        <ParallelChannelDraw
          key={d.id}
          drawing={d}
          ax={ax}
          ay={ay}
          bx={bx}
          by={by}
          cx={cx}
          cy={cy}
          selected={selected}
          onSelect={onSelect}
          chart={chart}
          candleSeries={candleSeries}
          container={container}
        />
      );
    }
    case "fib-retracement": {
      const ax = chart.timeScale().timeToCoordinate(d.a.time as UTCTimestamp);
      const ay = candleSeries.priceToCoordinate(d.a.price);
      const bx = chart.timeScale().timeToCoordinate(d.b.time as UTCTimestamp);
      const by = candleSeries.priceToCoordinate(d.b.price);
      if (ax === null || ay === null || bx === null || by === null) return null;
      return (
        <FibRetracementDraw
          key={d.id}
          drawing={d}
          ax={ax}
          ay={ay}
          bx={bx}
          by={by}
          selected={selected}
          onSelect={onSelect}
          chart={chart}
          candleSeries={candleSeries}
          container={container}
        />
      );
    }
    case "ray": {
      const ax = chart.timeScale().timeToCoordinate(d.a.time as UTCTimestamp);
      const ay = candleSeries.priceToCoordinate(d.a.price);
      const bx = chart.timeScale().timeToCoordinate(d.b.time as UTCTimestamp);
      const by = candleSeries.priceToCoordinate(d.b.price);
      if (ax === null || ay === null || bx === null || by === null) return null;
      return (
        <RayDraw
          key={d.id}
          drawing={d}
          ax={ax}
          ay={ay}
          bx={bx}
          by={by}
          width={width}
          height={height}
          selected={selected}
          onSelect={onSelect}
          chart={chart}
          candleSeries={candleSeries}
          container={container}
        />
      );
    }
    default:
      return null;
  }
}
