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

type Pt = { x: number; y: number };

/**
 * Smooth filled area for a sign-group (all bars on the same side of zero).
 * `bars` are the actual data points (no synthetic baseline endpoints).
 *
 * Visual: left vertical edge at firstBar.x going up from baseline → Catmull-
 * Rom spline through the bars → right vertical edge at lastBar.x going down
 * to baseline. The vertical edges match TradingView's original look at sign
 * transitions (the curve never crosses the baseline diagonally).
 */
function buildPath(bars: Pt[], yBase: number): string {
  const n = bars.length;
  if (n === 0) return "";

  const first = bars[0];
  const last = bars[n - 1];

  let d = `M ${first.x.toFixed(1)},${yBase.toFixed(1)} L ${first.x.toFixed(1)},${first.y.toFixed(1)} `;

  if (n === 1) {
    // Single bar: nothing to curve through; close vertically.
    d += `L ${last.x.toFixed(1)},${yBase.toFixed(1)} Z`;
    return d;
  }

  for (let i = 0; i < n - 1; i++) {
    const p0 = bars[Math.max(i - 1, 0)];
    const p1 = bars[i];
    const p2 = bars[i + 1];
    const p3 = bars[Math.min(i + 2, n - 1)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += `C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} `;
  }

  // Vertical drop from last bar to baseline, then close to first bar's column.
  d += `L ${last.x.toFixed(1)},${yBase.toFixed(1)} Z`;
  return d;
}

/**
 * Outline-only variant of the curve: same Catmull-Rom spline as buildPath()
 * but without the vertical edges and baseline — only the top of each
 * mountain / bottom of each valley. Used as a stroke highlight on top of
 * the filled body so the edge "pops" the same way the TradingView original
 * shows a subtle rim around each histogram bump.
 */
function buildOutlinePath(bars: Pt[]): string {
  const n = bars.length;
  if (n < 2) return "";

  let d = `M ${bars[0].x.toFixed(1)},${bars[0].y.toFixed(1)} `;
  for (let i = 0; i < n - 1; i++) {
    const p0 = bars[Math.max(i - 1, 0)];
    const p1 = bars[i];
    const p2 = bars[i + 1];
    const p3 = bars[Math.min(i + 2, n - 1)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += `C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} `;
  }
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
          const d = buildPath(gb, yBase);
          // Same curve without the vertical edges or baseline — stroked on
          // top of the fill to give a subtle rim highlight.
          const outlineD = buildOutlinePath(gb);
          const startX = gb[0].x;
          const endX = gb[gb.length - 1].x;

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
                {/* Fill at reduced opacity so the same-color stroke pops. */}
                <path
                  d={d}
                  fill={colorMap[seg.color]}
                  fillOpacity={0.78}
                  stroke="none"
                  clipPath={`url(#${clipId})`}
                />
                {/* Edge rim — same color as the fill, full intensity. */}
                {outlineD && (
                  <path
                    d={outlineD}
                    fill="none"
                    stroke={colorMap[seg.color]}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    clipPath={`url(#${clipId})`}
                  />
                )}
              </g>
            );
          });
        })}
      </g>
    </svg>
  );
}
