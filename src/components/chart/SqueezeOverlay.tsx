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
  paneTop: number;
  paneHeight: number;
}

type Pt = { x: number; y: number };

/**
 * Draws a filled area through [startPt, ...barCenters, endPt] using
 * horizontal-tangent cubic bezier (no Catmull-Rom overshoot).
 * The shape closes back along the baseline (y = yBase).
 */
function buildPath(topPts: Pt[], yBase: number): string {
  const n = topPts.length;
  if (n === 0) return "";

  const start = topPts[0];
  const end = topPts[n - 1];

  let d = `M ${start.x.toFixed(2)},${yBase.toFixed(2)} `;
  d += `L ${start.x.toFixed(2)},${start.y.toFixed(2)} `;

  for (let i = 0; i < n - 1; i++) {
    const p1 = topPts[i];
    const p2 = topPts[i + 1];
    const mx = ((p1.x + p2.x) / 2).toFixed(2);
    // Horizontal tangents at both endpoints → no overshoot
    d += `C ${mx},${p1.y.toFixed(2)} ${mx},${p2.y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)} `;
  }

  d += `L ${end.x.toFixed(2)},${yBase.toFixed(2)} Z`;
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
  const yBaseRaw = squeezeSeries.priceToCoordinate(0);
  if (yBaseRaw === null) return null;
  const yBase: number = yBaseRaw;

  const opts = ts.options() as { barSpacing?: number };
  const hw = Math.max((opts.barSpacing ?? 6) / 2, 0.5);

  // Resolve pixel coords
  type Bar = { x: number; y: number; color: SqueezeColor };
  const bars: Bar[] = [];
  for (const p of pts) {
    const x = ts.timeToCoordinate(p.time as UTCTimestamp);
    const yRaw = squeezeSeries.priceToCoordinate(p.momentum);
    if (x === null || yRaw === null) continue;
    bars.push({ x, y: yRaw as number, color: p.color });
  }
  if (bars.length === 0) return null;

  // Group consecutive same-color bars
  type Segment = { color: SqueezeColor; bars: Bar[] };
  const segments: Segment[] = [];
  for (const b of bars) {
    const last = segments[segments.length - 1];
    if (last && last.color === b.color) last.bars.push(b);
    else segments.push({ color: b.color, bars: [b] });
  }

  // Compute shared boundary point between segment[si] and segment[si+1].
  // Same-sign → midpoint; opposite sign → zero crossing.
  function boundary(a: Bar, b: Bar): Pt {
    const sameSign = (a.y - yBase) * (b.y - yBase) >= 0;
    if (sameSign) {
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    // Linear interpolation to find zero crossing
    const t = (yBase - a.y) / (b.y - a.y);
    return { x: a.x + t * (b.x - a.x), y: yBase };
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

          const firstBar = seg.bars[0];
          const lastBar = seg.bars[seg.bars.length - 1];

          // startPt: shared with previous segment, or left edge at baseline
          const prevLastBar = si > 0 ? segments[si - 1].bars[segments[si - 1].bars.length - 1] : null;
          const startPt: Pt = prevLastBar
            ? boundary(prevLastBar, firstBar)
            : { x: firstBar.x - hw, y: yBase };

          // endPt: shared with next segment, or right edge at baseline
          const nextFirstBar = si < segments.length - 1 ? segments[si + 1].bars[0] : null;
          const endPt: Pt = nextFirstBar
            ? boundary(lastBar, nextFirstBar)
            : { x: lastBar.x + hw, y: yBase };

          const topPts: Pt[] = [startPt, ...seg.bars, endPt];
          const d = buildPath(topPts, yBase);

          return (
            <path key={si} d={d} fill={colorMap[seg.color]} stroke="none" />
          );
        })}
      </g>
    </svg>
  );
}
