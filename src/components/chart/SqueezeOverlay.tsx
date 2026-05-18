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

/** Catmull-Rom spline through bar-center tops, closed back to baseline. */
function smoothArea(pts: { x: number; y: number }[], yBase: number): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) {
    const { x, y } = pts[0];
    return `M ${x},${yBase} L ${x},${y} L ${x},${yBase} Z`;
  }

  let d = `M ${pts[0].x},${yBase} L ${pts[0].x},${pts[0].y} `;

  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, n - 1)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += `C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)} `;
  }

  d += `L ${pts[n - 1].x},${yBase} Z`;
  return d;
}

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

  void width;
  void height;

  const clipId = "sqz-clip";

  return (
    <svg
      className="pointer-events-none absolute z-[5]"
      style={{ top: paneTop, height: paneHeight, left: 0, right: 0, width: "100%" }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width="100%" height={paneHeight} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {segments.map((seg, si) => {
          if (seg.bars.length === 0) return null;
          const d = smoothArea(seg.bars, yBase);
          return (
            <path
              key={si}
              d={d}
              fill={colorMap[seg.color]}
              stroke="none"
            />
          );
        })}
      </g>
    </svg>
  );
}
