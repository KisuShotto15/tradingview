"use client";

import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { BrushDrawing, HighlighterDrawing } from "@/lib/drawings/types";
import { timeToX, timeframeToSeconds } from "@/lib/chart/coords";
import { candlesRef as globalCandlesRef } from "@/lib/chart/candles-ref";
import { useChartStore } from "@/lib/store/chart-store";

interface Props {
  drawing: BrushDrawing | HighlighterDrawing;
  chart: IChartApi;
  candleSeries: ISeriesApi<"Candlestick">;
  selected: boolean;
  onSelect: () => void;
}

type Pt = { x: number; y: number };

/**
 * logicalToCoordinate in lightweight-charts snaps to integer bar centers —
 * it does NOT linearly interpolate for fractional logical indices.
 * This helper manually interpolates between the two neighboring integer bars,
 * giving a true sub-pixel float x position for any float logical value.
 */
function logicalToXFloat(chart: IChartApi, logical: number): number | null {
  const base = Math.floor(logical);
  const frac = logical - base;
  const x0 = chart.timeScale().logicalToCoordinate(base as never);
  if (x0 === null) return null;
  if (frac === 0) return x0 as number;
  const x1 = chart.timeScale().logicalToCoordinate((base + 1) as never);
  if (x1 === null) return x0 as number;
  return (x0 as number) + frac * ((x1 as number) - (x0 as number));
}

function pointsToPath(pts: Pt[]): string {
  if (pts.length < 2) return "";
  return "M " + pts[0].x.toFixed(2) + " " + pts[0].y.toFixed(2) +
    pts.slice(1).map(p => ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join("");
}

export function BrushDraw({ drawing, chart, candleSeries, selected, onSelect }: Props) {
  const intervalSec = timeframeToSeconds(useChartStore.getState().timeframe);

  const pixels: Pt[] = [];
  for (let i = 0; i < drawing.points.length; i++) {
    const pt = drawing.points[i];
    const logical = drawing.logicals?.[i];
    // Use sub-bar float interpolation when logicals are stored; fall back to timeToX
    // for legacy drawings that predate the logicals field.
    const x = logical !== undefined
      ? logicalToXFloat(chart, logical)
      : timeToX(chart, pt.time, globalCandlesRef.current, intervalSec);
    const y = candleSeries.priceToCoordinate(pt.price);
    if (x !== null && y !== null) pixels.push({ x: x as number, y: y as number });
  }

  if (pixels.length < 2) return null;

  const pathD = pointsToPath(pixels);
  const isHighlighter = drawing.kind === "highlighter";
  const color = drawing.color ?? (isHighlighter ? "#ffeb3b" : "#ffffff");
  const lw = drawing.lineWidth ?? (isHighlighter ? 14 : 2);
  const opacity = isHighlighter ? 0.35 : 1;

  return (
    <g
      className="drawing-hit"
      style={{ pointerEvents: "visibleStroke" }}
      onMouseDown={(e) => {
        if (drawing.locked) return;
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Wide transparent hit area for selection */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(lw + 8, 12)}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ cursor: "move", pointerEvents: "stroke" }}
      />
      {selected && (
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={lw + 6}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.18}
          style={{ pointerEvents: "none" }}
        />
      )}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={selected ? lw + 1 : lw}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
        style={{ pointerEvents: "none" }}
      />
    </g>
  );
}
