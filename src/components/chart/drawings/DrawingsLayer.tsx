"use client";

import { useEffect, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useChartStore } from "@/lib/store/chart-store";
import { timeToX, timeframeToSeconds } from "@/lib/chart/coords";
import { candlesRef as globalCandlesRef } from "@/lib/chart/candles-ref";
import type { Drawing } from "@/lib/drawings/types";
import { HLineDraw } from "./HLineDraw";
import { VLineDraw } from "./VLineDraw";
import { HRayDraw } from "./HRayDraw";
import { TrendLineDraw } from "./TrendLineDraw";
import { RayDraw } from "./RayDraw";
import { ParallelChannelDraw } from "./ParallelChannelDraw";
import { FibRetracementDraw } from "./FibRetracementDraw";
import { PriceRangeDraw } from "./PriceRangeDraw";
import { DateRangeDraw } from "./DateRangeDraw";
import { PositionDraw } from "./PositionDraw";

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
  const setEditing = useDrawingsStore((s) => s.setEditing);

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
          intervalSec: timeframeToSeconds(useChartStore.getState().timeframe),
          selected: selectedId === d.id,
          onSelect: () => setSelected(d.id),
          onEdit: () => setEditing(d.id),
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
  intervalSec: number;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}

function renderDrawing(args: RenderArgs) {
  const { d, chart, candleSeries, container, width, height, selected, onSelect, onEdit } = args;
  const _intervalSec = args.intervalSec;
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
          onEdit={onEdit}
          chart={chart}
          candleSeries={candleSeries}
          container={container}
        />
      );
    }
    case "vline": {
      const x = timeToX(chart, Number(d.time), globalCandlesRef.current, _intervalSec);
      if (x === null) return null;
      return (
        <VLineDraw
          key={d.id}
          drawing={d}
          x={x}
          height={height}
          selected={selected}
          onSelect={onSelect}
          onEdit={onEdit}
          chart={chart}
          candleSeries={candleSeries}
          container={container}
        />
      );
    }
    case "hray": {
      const x = timeToX(chart, Number(d.anchor.time), globalCandlesRef.current, _intervalSec);
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
          onEdit={onEdit}
          chart={chart}
          candleSeries={candleSeries}
          container={container}
        />
      );
    }
    case "trendline": {
      const ax = timeToX(chart, Number(d.a.time), globalCandlesRef.current, _intervalSec);
      const ay = candleSeries.priceToCoordinate(d.a.price);
      const bx = timeToX(chart, Number(d.b.time), globalCandlesRef.current, _intervalSec);
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
          onEdit={onEdit}
          chart={chart}
          candleSeries={candleSeries}
          container={container}
        />
      );
    }
    case "parallel-channel": {
      const ax = timeToX(chart, Number(d.a.time), globalCandlesRef.current, _intervalSec);
      const ay = candleSeries.priceToCoordinate(d.a.price);
      const bx = timeToX(chart, Number(d.b.time), globalCandlesRef.current, _intervalSec);
      const by = candleSeries.priceToCoordinate(d.b.price);
      const cx = timeToX(chart, Number(d.c.time), globalCandlesRef.current, _intervalSec);
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
          onEdit={onEdit}
          chart={chart}
          candleSeries={candleSeries}
          container={container}
        />
      );
    }
    case "long":
    case "short": {
      const xA = timeToX(chart, Number(d.timeA), globalCandlesRef.current, _intervalSec);
      const xB = timeToX(chart, Number(d.timeB), globalCandlesRef.current, _intervalSec);
      const yEntry = candleSeries.priceToCoordinate(d.entry);
      const yStop = candleSeries.priceToCoordinate(d.stop);
      const yTarget = candleSeries.priceToCoordinate(d.target);
      if (xA === null || xB === null || yEntry === null || yStop === null || yTarget === null) {
        return null;
      }
      return (
        <PositionDraw
          key={d.id}
          drawing={d}
          xA={xA}
          xB={xB}
          yEntry={yEntry}
          yStop={yStop}
          yTarget={yTarget}
          selected={selected}
          onSelect={onSelect}
          onEdit={onEdit}
          candleSeries={candleSeries}
          container={container}
        />
      );
    }
    case "price-range": {
      const xA = timeToX(chart, Number(d.timeA), globalCandlesRef.current, _intervalSec);
      const xB = timeToX(chart, Number(d.timeB), globalCandlesRef.current, _intervalSec);
      const yA = candleSeries.priceToCoordinate(d.priceA);
      const yB = candleSeries.priceToCoordinate(d.priceB);
      if (xA === null || xB === null || yA === null || yB === null) return null;
      return (
        <PriceRangeDraw
          key={d.id}
          drawing={d}
          xA={xA}
          xB={xB}
          yA={yA}
          yB={yB}
          selected={selected}
          onSelect={onSelect}
          onEdit={onEdit}
          chart={chart}
          candleSeries={candleSeries}
          container={container}
        />
      );
    }
    case "date-range": {
      const xA = timeToX(chart, Number(d.timeA), globalCandlesRef.current, _intervalSec);
      const xB = timeToX(chart, Number(d.timeB), globalCandlesRef.current, _intervalSec);
      if (xA === null || xB === null) return null;
      return (
        <DateRangeDraw
          key={d.id}
          drawing={d}
          xA={xA}
          xB={xB}
          height={height}
          selected={selected}
          onSelect={onSelect}
          onEdit={onEdit}
          chart={chart}
          candleSeries={candleSeries}
          container={container}
        />
      );
    }
    case "fib-retracement": {
      const ax = timeToX(chart, Number(d.a.time), globalCandlesRef.current, _intervalSec);
      const ay = candleSeries.priceToCoordinate(d.a.price);
      const bx = timeToX(chart, Number(d.b.time), globalCandlesRef.current, _intervalSec);
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
          onEdit={onEdit}
          chart={chart}
          candleSeries={candleSeries}
          container={container}
        />
      );
    }
    case "ray": {
      const ax = timeToX(chart, Number(d.a.time), globalCandlesRef.current, _intervalSec);
      const ay = candleSeries.priceToCoordinate(d.a.price);
      const bx = timeToX(chart, Number(d.b.time), globalCandlesRef.current, _intervalSec);
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
          onEdit={onEdit}
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
