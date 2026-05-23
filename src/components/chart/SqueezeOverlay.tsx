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
  /** Width of the chart drawing area (excludes right price scale). Used to clip bars. */
  chartAreaWidth?: number;
  /** When true the bars use screen blend-mode so the ADX line shows through. */
  screenBlend?: boolean;
}

type Bar = { x: number; y: number; color: SqueezeColor };

/**
 * Area-style polygon for a same-sign group: linear segments from one anchor
 * baseline point through each bar (at its real y) to the closing baseline
 * point. Replicates TradingView's `plot.style_area` behaviour exactly:
 *   - between adjacent same-sign bars, the top is a straight line
 *   - at sign transitions, the polygon closes at the zero-crossing x, so
 *     adjacent positive and negative areas meet at the baseline forming
 *     the characteristic V / inverted-V silhouette
 */
function buildAreaPath(
  startX: number,
  bars: Bar[],
  endX: number,
  yBase: number,
): string {
  if (bars.length === 0) return "";
  let d = `M ${startX.toFixed(2)},${yBase.toFixed(2)} `;
  for (const b of bars) d += `L ${b.x.toFixed(2)},${b.y.toFixed(2)} `;
  d += `L ${endX.toFixed(2)},${yBase.toFixed(2)} Z`;
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
  chartAreaWidth,
  screenBlend = false,
}: Props) {
  if (!chart || !squeezeSeries || !visible || pts.length === 0) return null;

  const ts = chart.timeScale();
  const yBaseRaw = squeezeSeries.priceToCoordinate(0);
  if (yBaseRaw === null) return null;
  const yBase: number = yBaseRaw;

  const opts = ts.options() as { barSpacing?: number };
  const hw = Math.max((opts.barSpacing ?? 6) / 2, 0.5);

  const bars: Bar[] = [];
  for (const p of pts) {
    const x = ts.timeToCoordinate(p.time as UTCTimestamp);
    const yRaw = squeezeSeries.priceToCoordinate(p.momentum);
    if (x === null || yRaw === null) continue;
    bars.push({ x, y: yRaw as number, color: p.color });
  }
  if (bars.length === 0) return null;

  // Group bars into continuous same-sign stretches (positive vs negative).
  // Within each stretch, sub-group by color for per-segment fill.
  type ColorSeg = { color: SqueezeColor; bars: Bar[] };
  type SignGroup = { colorSegs: ColorSeg[] };

  const signGroups: SignGroup[] = [];
  for (const b of bars) {
    const lastGroup = signGroups[signGroups.length - 1];
    const lastBar = lastGroup?.colorSegs[lastGroup.colorSegs.length - 1]?.bars.slice(-1)[0];
    const sameSign = lastBar && (b.y - yBase) * (lastBar.y - yBase) >= 0;
    if (sameSign) {
      const lastSeg = lastGroup.colorSegs[lastGroup.colorSegs.length - 1];
      if (lastSeg.color === b.color) lastSeg.bars.push(b);
      else lastGroup.colorSegs.push({ color: b.color, bars: [b] });
    } else {
      signGroups.push({ colorSegs: [{ color: b.color, bars: [b] }] });
    }
  }

  function groupBars(g: SignGroup): Bar[] {
    return g.colorSegs.flatMap((s) => s.bars);
  }
  // Linear interpolation: x where the segment a→b crosses y = yBase.
  function zeroCross(a: Bar, b: Bar): number {
    const denom = b.y - a.y;
    if (Math.abs(denom) < 1e-9) return (a.x + b.x) / 2;
    const t = (yBase - a.y) / denom;
    return a.x + t * (b.x - a.x);
  }

  // For each sign-group: compute the baseline-anchor x on its left and right.
  //  • Interior groups (both neighbours opposite-sign): close at the exact
  //    zero crossing with each neighbour, so positive and negative areas
  //    meet at the baseline forming the natural V / Λ silhouette.
  //  • Edge groups (no neighbour on one side, i.e. first or last in the
  //    series): close VERTICALLY at the first / last bar's own x. TradingView
  //    does the same — there's no synthetic tail past the last bar.
  const groupEdges = signGroups.map((g, gi) => {
    const gb = groupBars(g);
    const prevGroup = gi > 0 ? signGroups[gi - 1] : null;
    const nextGroup = gi < signGroups.length - 1 ? signGroups[gi + 1] : null;
    const prevLast = prevGroup ? groupBars(prevGroup).slice(-1)[0] : null;
    const nextFirst = nextGroup ? groupBars(nextGroup)[0] : null;
    const startX = prevLast ? zeroCross(prevLast, gb[0]) : gb[0].x;
    const endX = nextFirst ? zeroCross(gb[gb.length - 1], nextFirst) : gb[gb.length - 1].x;
    return { startX, endX };
  });
  void hw;

  void width;
  void height;
  const clipW = chartAreaWidth ?? 99999;

  return (
    <svg
      className="pointer-events-none absolute z-[5]"
      style={{
        top: paneTop,
        height: paneHeight,
        left: 0,
        right: 0,
        width: "100%",
        mixBlendMode: screenBlend ? "screen" : undefined,
      }}
    >
      <defs>
        <clipPath id="sqz-pane">
          <rect x="0" y="0" width={clipW} height={paneHeight} />
        </clipPath>
      </defs>
      <g clipPath="url(#sqz-pane)">
        {signGroups.map((group, gi) => {
          const gb = groupBars(group);
          const { startX, endX } = groupEdges[gi];
          // One shared linear-area path through every bar in the sign-group.
          const d = buildAreaPath(startX, gb, endX, yBase);

          // Render each color sub-segment by clipping the shared path. The
          // boundary between two adjacent colours is placed at the LAST bar
          // of the previous colour (i.e. the peak / apex). This matches
          // TradingView's plot.style_area behaviour where the new colour
          // starts visually AT the local extreme (the deepest red bar, the
          // brightest lime peak), not half a bar afterwards.
          return group.colorSegs.map((seg, si) => {
            const allSegs = group.colorSegs;
            const prevSeg = si > 0 ? allSegs[si - 1] : null;
            const nextSeg = si < allSegs.length - 1 ? allSegs[si + 1] : null;
            const clipX1 = prevSeg
              ? prevSeg.bars[prevSeg.bars.length - 1].x
              : startX;
            const clipX2 = nextSeg
              ? seg.bars[seg.bars.length - 1].x
              : endX;
            const clipId = `sqz-c-${gi}-${si}`;
            return (
              <g key={clipId}>
                <defs>
                  <clipPath id={clipId}>
                    <rect x={clipX1.toFixed(2)} y="-10000" width={(clipX2 - clipX1).toFixed(2)} height="20000" />
                  </clipPath>
                </defs>
                <path
                  d={d}
                  fill={colorMap[seg.color]}
                  stroke={colorMap[seg.color]}
                  strokeWidth={0.5}
                  shapeRendering="geometricPrecision"
                  clipPath={`url(#${clipId})`}
                />
              </g>
            );
          });
        })}
      </g>
    </svg>
  );
}
