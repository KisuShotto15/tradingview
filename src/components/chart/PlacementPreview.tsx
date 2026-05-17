"use client";

import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { DrawingTool } from "@/lib/store/chart-store";

interface Point {
  time: number;
  price: number;
}

interface Props {
  tool: DrawingTool;
  first: Point | null;
  extra: Point[];
  cursor: Point | null;
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
  width: number;
  height: number;
}

const PREVIEW_STROKE = "#2962ff";
const PREVIEW_DASH = "5 4";

/** Renders a thin dashed preview of the drawing being placed. */
export function PlacementPreview({
  tool,
  first,
  extra,
  cursor,
  chart,
  candleSeries,
  width,
  height,
}: Props) {
  if (!chart || !candleSeries || !cursor) return null;

  const toX = (t: number): number | null => {
    const x = chart.timeScale().timeToCoordinate(t as UTCTimestamp);
    return x === null ? null : x;
  };
  const toY = (p: number): number | null => {
    const y = candleSeries.priceToCoordinate(p);
    return y === null ? null : y;
  };

  // Single-click tool needs first point only (cursor used for the leading edge)
  if (!first) return null;

  const aX = toX(first.time);
  const aY = toY(first.price);
  const bX = toX(cursor.time);
  const bY = toY(cursor.price);

  if (tool === "trendline" || tool === "ray") {
    if (aX === null || aY === null || bX === null || bY === null) return null;
    // For a ray, we'd extend infinitely; preview just shows the segment
    return (
      <svg
        className="pointer-events-none absolute inset-0"
        width={width}
        height={height}
      >
        <line
          x1={aX}
          y1={aY}
          x2={bX}
          y2={bY}
          stroke={PREVIEW_STROKE}
          strokeWidth={1.5}
          strokeDasharray={PREVIEW_DASH}
        />
        <circle cx={aX} cy={aY} r={3} fill={PREVIEW_STROKE} />
      </svg>
    );
  }

  if (tool === "long" || tool === "short") {
    if (aX === null || aY === null || bX === null || bY === null) return null;
    const entry = first.price;
    const target = cursor.price;
    const stop = entry - (target - entry);
    const eY = toY(entry);
    const tY = toY(target);
    const sY = toY(stop);
    const left = Math.min(aX, bX);
    const right = Math.max(aX, bX);
    const w = Math.max(right - left, 4);
    const isLong = tool === "long";
    const targetColor = isLong ? "rgba(38, 166, 154, 0.18)" : "rgba(38, 166, 154, 0.18)";
    const stopColor = "rgba(239, 83, 80, 0.18)";
    if (eY === null || tY === null || sY === null) return null;
    return (
      <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
        {/* Profit zone */}
        <rect
          x={left}
          y={Math.min(eY, tY)}
          width={w}
          height={Math.abs(tY - eY)}
          fill={targetColor}
          stroke={PREVIEW_STROKE}
          strokeDasharray={PREVIEW_DASH}
          strokeWidth={1}
        />
        {/* Loss zone */}
        <rect
          x={left}
          y={Math.min(eY, sY)}
          width={w}
          height={Math.abs(sY - eY)}
          fill={stopColor}
          stroke={PREVIEW_STROKE}
          strokeDasharray={PREVIEW_DASH}
          strokeWidth={1}
        />
        <circle cx={aX} cy={eY} r={3} fill={PREVIEW_STROKE} />
      </svg>
    );
  }

  if (tool === "price-range") {
    if (aX === null || aY === null || bX === null || bY === null) return null;
    const left = Math.min(aX, bX);
    const right = Math.max(aX, bX);
    const top = Math.min(aY, bY);
    const bottom = Math.max(aY, bY);
    return (
      <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
        <rect
          x={left}
          y={top}
          width={right - left}
          height={bottom - top}
          fill="rgba(41, 98, 255, 0.10)"
          stroke={PREVIEW_STROKE}
          strokeDasharray={PREVIEW_DASH}
          strokeWidth={1}
        />
      </svg>
    );
  }

  if (tool === "date-range") {
    if (aX === null || bX === null) return null;
    const left = Math.min(aX, bX);
    const right = Math.max(aX, bX);
    return (
      <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
        <rect
          x={left}
          y={0}
          width={right - left}
          height={height}
          fill="rgba(41, 98, 255, 0.08)"
          stroke={PREVIEW_STROKE}
          strokeDasharray={PREVIEW_DASH}
          strokeWidth={1}
        />
      </svg>
    );
  }

  if (tool === "fib-retracement") {
    if (aX === null || aY === null || bX === null || bY === null) return null;
    const left = Math.min(aX, bX);
    const right = Math.max(aX, bX);
    const span = bY - aY;
    const lines = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((lv) => ({
      y: aY + span * lv,
      label: lv.toFixed(3),
    }));
    return (
      <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
        {lines.map((l, i) => (
          <line
            key={i}
            x1={left}
            x2={right}
            y1={l.y}
            y2={l.y}
            stroke={PREVIEW_STROKE}
            strokeWidth={1}
            strokeDasharray={PREVIEW_DASH}
            opacity={0.7}
          />
        ))}
      </svg>
    );
  }

  if (tool === "parallel-channel") {
    // First click sets a, second sets b (baseline), cursor is preview b or c
    if (extra.length === 0) {
      // Show baseline preview from a to cursor
      if (aX === null || aY === null || bX === null || bY === null) return null;
      return (
        <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
          <line
            x1={aX}
            y1={aY}
            x2={bX}
            y2={bY}
            stroke={PREVIEW_STROKE}
            strokeWidth={1.5}
            strokeDasharray={PREVIEW_DASH}
          />
          <circle cx={aX} cy={aY} r={3} fill={PREVIEW_STROKE} />
        </svg>
      );
    } else {
      // Show baseline + parallel-offset preview
      const b = extra[0];
      const baseX1 = toX(first.time);
      const baseY1 = toY(first.price);
      const baseX2 = toX(b.time);
      const baseY2 = toY(b.price);
      const cX = toX(cursor.time);
      const cY = toY(cursor.price);
      if (
        baseX1 === null || baseY1 === null ||
        baseX2 === null || baseY2 === null ||
        cX === null || cY === null
      ) return null;
      // Parallel: shift baseline so it passes through cursor at same x
      // Slope: (baseY2 - baseY1) / (baseX2 - baseX1)
      const dx = baseX2 - baseX1;
      const dy = baseY2 - baseY1;
      const slope = dx === 0 ? 0 : dy / dx;
      // The parallel line passes through (cX, cY)
      // y = slope * (x - cX) + cY
      const offset = cY - (slope * (cX - baseX1) + baseY1);
      const pX1 = baseX1;
      const pY1 = baseY1 + offset;
      const pX2 = baseX2;
      const pY2 = baseY2 + offset;
      return (
        <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
          <line
            x1={baseX1}
            y1={baseY1}
            x2={baseX2}
            y2={baseY2}
            stroke={PREVIEW_STROKE}
            strokeWidth={1.5}
            strokeDasharray={PREVIEW_DASH}
          />
          <line
            x1={pX1}
            y1={pY1}
            x2={pX2}
            y2={pY2}
            stroke={PREVIEW_STROKE}
            strokeWidth={1.5}
            strokeDasharray={PREVIEW_DASH}
          />
          <circle cx={baseX1} cy={baseY1} r={3} fill={PREVIEW_STROKE} />
          <circle cx={baseX2} cy={baseY2} r={3} fill={PREVIEW_STROKE} />
        </svg>
      );
    }
  }

  return null;
}

interface MagnetProps {
  target: Point | null;
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
  width: number;
  height: number;
}

/** Small marker showing where Ctrl-snap will land. */
export function MagnetIndicator({
  target,
  chart,
  candleSeries,
  width,
  height,
}: MagnetProps) {
  if (!target || !chart || !candleSeries) return null;
  const x = chart.timeScale().timeToCoordinate(target.time as UTCTimestamp);
  const y = candleSeries.priceToCoordinate(target.price);
  if (x === null || y === null) return null;
  return (
    <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
      <circle cx={x} cy={y} r={5} fill="none" stroke="#ffb74d" strokeWidth={2} />
      <circle cx={x} cy={y} r={2} fill="#ffb74d" />
    </svg>
  );
}
