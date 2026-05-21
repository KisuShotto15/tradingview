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
  const barW = Math.max(opts.barSpacing ?? 6, 1);
  const hw = barW / 2;

  void width;
  void height;
  const clipW = chartAreaWidth ?? 99999;

  const bars: { x: number; y: number; color: SqueezeColor }[] = [];
  for (const p of pts) {
    const x = ts.timeToCoordinate(p.time as UTCTimestamp);
    const yRaw = squeezeSeries.priceToCoordinate(p.momentum);
    if (x === null || yRaw === null) continue;
    bars.push({ x, y: yRaw as number, color: p.color });
  }
  if (bars.length === 0) return null;

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
        {bars.map((b, i) => {
          const barH = Math.abs(b.y - yBase);
          const barY = b.y < yBase ? b.y : yBase;
          return (
            <rect
              key={i}
              x={(b.x - hw + 0.5).toFixed(1)}
              y={barY.toFixed(1)}
              width={Math.max(1, barW - 1).toFixed(1)}
              height={Math.max(1, barH).toFixed(1)}
              fill={colorMap[b.color]}
            />
          );
        })}
      </g>
    </svg>
  );
}
