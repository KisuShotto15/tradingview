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

// Chaikin corner-cutting — same algorithm as capture phase.
// Applied at render time as a second smoothing pass over converted pixel coords.
function chaikin(pts: Pt[], iters = 2): Pt[] {
  let r = pts;
  for (let n = 0; n < iters; n++) {
    if (r.length < 3) break;
    const next: Pt[] = [r[0]];
    for (let i = 0; i < r.length - 1; i++) {
      const a = r[i], b = r[i + 1];
      next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    next.push(r[r.length - 1]);
    r = next;
  }
  return r;
}

function pointsToPath(pts: Pt[]): string {
  if (pts.length < 2) return "";
  return "M " + pts[0].x.toFixed(1) + " " + pts[0].y.toFixed(1) +
    pts.slice(1).map(p => ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");
}

export function BrushDraw({ drawing, chart, candleSeries, selected, onSelect }: Props) {
  const intervalSec = timeframeToSeconds(useChartStore.getState().timeframe);

  const raw: Pt[] = [];
  for (let i = 0; i < drawing.points.length; i++) {
    const pt = drawing.points[i];
    const logical = drawing.logicals?.[i];
    // logicals[] stores float logical positions from visible-range interpolation at capture
    // time — logicalToCoordinate gives sub-bar pixel accuracy without bar snapping.
    const x = logical !== undefined
      ? chart.timeScale().logicalToCoordinate(logical as never)
      : timeToX(chart, pt.time, globalCandlesRef.current, intervalSec);
    const y = candleSeries.priceToCoordinate(pt.price);
    if (x !== null && y !== null) raw.push({ x: x as number, y: y as number });
  }

  if (raw.length < 2) return null;

  // Apply Chaikin as a second smoothing pass at render time.
  // This eliminates any residual bar-edge quantization that survives
  // the logical→coordinate conversion.
  const pixels = raw.length >= 3 ? chaikin(raw, 2) : raw;
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
