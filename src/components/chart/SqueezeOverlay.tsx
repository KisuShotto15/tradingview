"use client";

import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { SqueezePoint, SqueezeColor } from "@/lib/indicators/squeeze";

interface Props {
  chart: IChartApi | null;
  squeezeSeries: ISeriesApi<"Histogram"> | null;
  width: number;
  height: number;
  pts: SqueezePoint[];
  colorMap: Record<SqueezeColor, string>;
  visible: boolean;
  /** Vertical offset (px) of the squeeze pane within the chart container */
  paneTop: number;
  /** Height of the squeeze pane */
  paneHeight: number;
}

/**
 * Renders the Squeeze momentum as filled polygons grouped by Pine 4-color
 * tag (lime / green / red / maroon). Bars touch perfectly — no gaps — so
 * stretches of same-color momentum look like a single solid region with a
 * sharp vertical edge at every color transition, matching TradingView's
 * `plot.style_columns` look exactly.
 */
export function SqueezeOverlay({
  chart,
  squeezeSeries,
  width,
  height,
  pts,
  colorMap,
  visible,
  paneTop,
  paneHeight,
}: Props) {
  if (!chart || !squeezeSeries || !visible || pts.length === 0) return null;
  const ts = chart.timeScale();
  const yBase = squeezeSeries.priceToCoordinate(0);
  if (yBase === null) return null;

  // Bar width — full slot so adjacent bars touch
  const opts = ts.options() as { barSpacing?: number };
  const barWidth = Math.max(opts.barSpacing ?? 6, 1);
  const half = barWidth / 2;

  // Resolve pixel coords once
  type Bar = { x: number; y: number; color: SqueezeColor };
  const bars: Bar[] = [];
  for (const p of pts) {
    const x = ts.timeToCoordinate(p.time as UTCTimestamp);
    const y = squeezeSeries.priceToCoordinate(p.momentum);
    if (x === null || y === null) continue;
    bars.push({ x, y, color: p.color });
  }
  if (bars.length === 0) return null;

  // Group consecutive same-color bars into segments
  type Segment = { color: SqueezeColor; bars: Bar[] };
  const segments: Segment[] = [];
  for (const b of bars) {
    const last = segments[segments.length - 1];
    if (last && last.color === b.color) {
      last.bars.push(b);
    } else {
      segments.push({ color: b.color, bars: [b] });
    }
  }

  // Position the SVG over the squeeze pane only — priceToCoordinate returns
  // y RELATIVE to the pane, so the SVG container must be offset to match.
  void width;
  void height;
  return (
    <svg
      className="pointer-events-none absolute z-[5]"
      style={{
        overflow: "visible",
        top: paneTop,
        height: paneHeight,
        left: 0,
        right: 0,
      }}
    >
      {segments.map((seg, si) => {
        if (seg.bars.length === 0) return null;
        const fill = colorMap[seg.color];
        const first = seg.bars[0];
        const last = seg.bars[seg.bars.length - 1];
        // Build a polygon: start at baseline, walk along bar tops (stepped),
        // close back at baseline. Bars are full slot width so they touch.
        const parts: string[] = [];
        parts.push(`${(first.x - half).toFixed(2)},${yBase.toFixed(2)}`);
        for (const b of seg.bars) {
          parts.push(`${(b.x - half).toFixed(2)},${b.y.toFixed(2)}`);
          parts.push(`${(b.x + half).toFixed(2)},${b.y.toFixed(2)}`);
        }
        parts.push(`${(last.x + half).toFixed(2)},${yBase.toFixed(2)}`);
        return (
          <polygon
            key={si}
            points={parts.join(" ")}
            fill={fill}
            stroke="none"
          />
        );
      })}
    </svg>
  );
}
