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
 * Smooth filled area through topPts using horizontal-tangent cubic bezier.
 * Closes back to baseline (y = yBase) on both sides.
 */
function buildPath(topPts: Pt[], yBase: number): string {
  const n = topPts.length;
  if (n === 0) return "";

  const start = topPts[0];
  const end = topPts[n - 1];

  // Start and end are already at yBase; just go straight up/down
  let d = `M ${start.x.toFixed(1)},${yBase.toFixed(1)} `;
  d += `L ${start.x.toFixed(1)},${start.y.toFixed(1)} `;

  for (let i = 0; i < n - 1; i++) {
    const p1 = topPts[i];
    const p2 = topPts[i + 1];
    const mx = ((p1.x + p2.x) / 2).toFixed(1);
    d += `C ${mx},${p1.y.toFixed(1)} ${mx},${p2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} `;
  }

  d += `L ${end.x.toFixed(1)},${yBase.toFixed(1)} Z`;
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

  type Bar = { x: number; y: number; color: SqueezeColor };
  const bars: Bar[] = [];
  for (const p of pts) {
    const x = ts.timeToCoordinate(p.time as UTCTimestamp);
    const yRaw = squeezeSeries.priceToCoordinate(p.momentum);
    if (x === null || yRaw === null) continue;
    bars.push({ x, y: yRaw as number, color: p.color });
  }
  if (bars.length === 0) return null;

  // Group bars into continuous same-sign stretches (positive vs negative momentum).
  // Within each stretch, sub-group by color for clip-rect coloring.
  type ColorSeg = { color: SqueezeColor; bars: Bar[] };
  type SignGroup = { colorSegs: ColorSeg[] };

  const signGroups: SignGroup[] = [];
  for (const b of bars) {
    const lastGroup = signGroups[signGroups.length - 1];
    const lastBar = lastGroup?.colorSegs[lastGroup.colorSegs.length - 1]?.bars.slice(-1)[0];
    const sameSign = lastBar && (b.y - yBase) * (lastBar.y - yBase) >= 0;

    if (sameSign) {
      const lastSeg = lastGroup.colorSegs[lastGroup.colorSegs.length - 1];
      if (lastSeg.color === b.color) {
        lastSeg.bars.push(b);
      } else {
        lastGroup.colorSegs.push({ color: b.color, bars: [b] });
      }
    } else {
      signGroups.push({ colorSegs: [{ color: b.color, bars: [b] }] });
    }
  }

  // Flatten all bars in a group
  function groupBars(g: SignGroup): Bar[] {
    return g.colorSegs.flatMap((s) => s.bars);
  }

  // Zero-crossing x between two adjacent bars of opposite sign
  function zeroCross(a: Bar, b: Bar): number {
    const t = (yBase - a.y) / (b.y - a.y);
    return a.x + t * (b.x - a.x);
  }

  // Compute start/end x for each sign group (baseline connection points)
  const groupEdges = signGroups.map((g, gi) => {
    const gb = groupBars(g);
    const prevGroup = gi > 0 ? signGroups[gi - 1] : null;
    const nextGroup = gi < signGroups.length - 1 ? signGroups[gi + 1] : null;

    const prevLastBar = prevGroup ? groupBars(prevGroup).slice(-1)[0] : null;
    const nextFirstBar = nextGroup ? groupBars(nextGroup)[0] : null;

    const startX = prevLastBar ? zeroCross(prevLastBar, gb[0]) : gb[0].x - hw;
    const endX = nextFirstBar ? zeroCross(gb[gb.length - 1], nextFirstBar) : gb[gb.length - 1].x + hw;

    return { startX, endX };
  });

  void width;
  void height;

  return (
    <svg
      className="pointer-events-none absolute z-[5]"
      style={{ top: paneTop, height: paneHeight, left: 0, right: 0, width: "100%" }}
    >
      <defs>
        <clipPath id="sqz-pane">
          <rect x="0" y="0" width="100%" height={paneHeight} />
        </clipPath>
      </defs>
      <g clipPath="url(#sqz-pane)">
        {signGroups.map((group, gi) => {
          const gb = groupBars(group);
          const { startX, endX } = groupEdges[gi];

          // One smooth path through all bars in this sign group
          const topPts: Pt[] = [
            { x: startX, y: yBase },
            ...gb,
            { x: endX, y: yBase },
          ];
          const d = buildPath(topPts, yBase);

          // Render each color sub-segment by clipping the shared path
          return group.colorSegs.map((seg, si) => {
            const allSegs = group.colorSegs;
            const prevSeg = si > 0 ? allSegs[si - 1] : null;
            const nextSeg = si < allSegs.length - 1 ? allSegs[si + 1] : null;

            const clipX1 = prevSeg
              ? (prevSeg.bars[prevSeg.bars.length - 1].x + seg.bars[0].x) / 2
              : startX;
            const clipX2 = nextSeg
              ? (seg.bars[seg.bars.length - 1].x + nextSeg.bars[0].x) / 2
              : endX;

            const clipId = `sqz-c-${gi}-${si}`;

            return (
              <g key={clipId}>
                <defs>
                  <clipPath id={clipId}>
                    <rect x={clipX1.toFixed(1)} y="-10000" width={(clipX2 - clipX1).toFixed(1)} height="20000" />
                  </clipPath>
                </defs>
                <path d={d} fill={colorMap[seg.color]} stroke="none" clipPath={`url(#${clipId})`} />
              </g>
            );
          });
        })}
      </g>
    </svg>
  );
}
