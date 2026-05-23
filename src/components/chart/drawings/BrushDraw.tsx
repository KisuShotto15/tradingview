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

function pointsToPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${pts[i].x} ${pts[i].y} ${mx} ${my}`;
  }
  d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
  return d;
}

export function BrushDraw({ drawing, chart, candleSeries, selected, onSelect }: Props) {
  const intervalSec = timeframeToSeconds(useChartStore.getState().timeframe);

  const pixels: { x: number; y: number }[] = [];
  for (const pt of drawing.points) {
    const x = timeToX(chart, pt.time, globalCandlesRef.current, intervalSec);
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
