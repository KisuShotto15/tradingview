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

// Simple polyline path — Chaikin smoothing was already applied at capture time
function pointsToPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  return "M " + pts[0].x.toFixed(1) + " " + pts[0].y.toFixed(1) +
    pts.slice(1).map(p => ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");
}

export function BrushDraw({ drawing, chart, candleSeries, selected, onSelect }: Props) {
  const intervalSec = timeframeToSeconds(useChartStore.getState().timeframe);

  const pixels: { x: number; y: number }[] = [];
  for (let i = 0; i < drawing.points.length; i++) {
    const pt = drawing.points[i];
    // Use stored logical index when available — avoids time round-trip quantization
    const logical = drawing.logicals?.[i];
    const x = logical !== undefined
      ? chart.timeScale().logicalToCoordinate(logical as never)
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
