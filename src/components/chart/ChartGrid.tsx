"use client";

import { PriceChart } from "@/components/chart/PriceChart";
import { layoutSpec } from "@/lib/chart/layouts";
import { useChartStore } from "@/lib/store/chart-store";

/**
 * The chart area: one `PriceChart` per pane of the current layout.
 *
 * A single-chart layout renders exactly what the page used to — one chart,
 * no border, no click-to-focus — so the common case is unchanged.
 *
 * With more than one pane, the focused one owns the app's single-slot state
 * (see `PriceChart`'s `active` prop) and is what the header, watchlist and
 * trading panels act on. Focus follows a press, in the capture phase: the
 * chart swallows the pointer for its own crosshair and drawing handling, so a
 * bubbling listener here would never see a press that landed on the canvas —
 * which is every press that matters.
 */
export function ChartGrid() {
  const layout = useChartStore((s) => s.layout);
  const panes = useChartStore((s) => s.panes);
  const activePaneId = useChartStore((s) => s.activePaneId);
  const setActivePane = useChartStore((s) => s.setActivePane);

  const spec = layoutSpec(layout);
  const single = panes.length <= 1;

  if (single) {
    const pane = panes[0];
    return <PriceChart symbol={pane.symbol} timeframe={pane.timeframe} />;
  }

  return (
    <div
      className="grid h-full w-full gap-px bg-tv-border"
      style={{
        gridTemplateColumns: `repeat(${spec.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${spec.rows}, minmax(0, 1fr))`,
      }}
    >
      {panes.map((pane) => {
        const isActive = pane.id === activePaneId;
        return (
          <div
            key={pane.id}
            onPointerDownCapture={() => setActivePane(pane.id)}
            className="relative min-h-0 min-w-0 bg-tv-bg"
          >
            <PriceChart
              symbol={pane.symbol}
              timeframe={pane.timeframe}
              active={isActive}
            />
            {isActive && (
              /*
               * The focus ring is its own layer over the chart, not a shadow
               * or a border on the cell: an inset shadow is painted under the
               * cell's children, so the chart's own background hid it
               * completely, and a border would change the cell's content box
               * — focusing a pane would resize its chart and make the whole
               * grid twitch as you click between them. White, not the blue
               * accent: the app marks every selected thing in white.
               */
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-50 ring-1 ring-inset ring-white/45"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
