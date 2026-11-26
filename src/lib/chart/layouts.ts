/**
 * Multi-chart layouts, as a dependency-free leaf module.
 *
 * `chart-store` needs the pane count to grow and shrink its pane list, and the
 * header's picker needs the labels and the grid, so this must not import
 * either — the same reason `watchlist/flags.ts` is split out.
 *
 * Every layout here is a uniform grid: the panes are equal and fill it in
 * reading order. The venues also offer asymmetric arrangements (one tall chart
 * beside two short ones), which need a per-cell template rather than a
 * row/column count; the shape below is deliberately the simple half, and an
 * asymmetric one would add `areas` here rather than special-casing the grid in
 * the component.
 */
import type { Timeframe } from "@/lib/binance/types";

export type LayoutKind = "1" | "2h" | "2v" | "3h" | "3v" | "4";

export interface LayoutSpec {
  kind: LayoutKind;
  /** Columns × rows of the CSS grid. */
  cols: number;
  rows: number;
  /** For the picker's tooltip and its accessible name. */
  label: string;
}

export const LAYOUTS: readonly LayoutSpec[] = [
  { kind: "1", cols: 1, rows: 1, label: "Single chart" },
  { kind: "2h", cols: 2, rows: 1, label: "Two charts, side by side" },
  { kind: "2v", cols: 1, rows: 2, label: "Two charts, stacked" },
  { kind: "3h", cols: 3, rows: 1, label: "Three charts, side by side" },
  { kind: "3v", cols: 1, rows: 3, label: "Three charts, stacked" },
  { kind: "4", cols: 2, rows: 2, label: "Four charts" },
];

export const DEFAULT_LAYOUT: LayoutKind = "1";

/** The spec for a layout, falling back to the single chart for an unknown one. */
export function layoutSpec(kind: LayoutKind): LayoutSpec {
  return LAYOUTS.find((l) => l.kind === kind) ?? LAYOUTS[0];
}

/** How many charts a layout shows. */
export function paneCount(kind: LayoutKind): number {
  const s = layoutSpec(kind);
  return s.cols * s.rows;
}

/** One chart in a multi-chart layout. */
export interface ChartPane {
  id: string;
  symbol: string;
  timeframe: Timeframe;
}

/**
 * Build the pane list for a layout from whatever was persisted.
 *
 * Pulled out of `chart-store`'s `merge` so the cases below can be tested
 * without rehydrating a store, and because the rule is easy to get subtly
 * wrong in a way nothing notices: `saved` must be the *persisted* panes, not
 * the store's current ones. Zustand's merge lays the persisted state over the
 * defaults, so a user who has never seen a layout has a default pane sitting
 * in the merged object — seeding from that silently replaces the symbol they
 * really had saved with `BTCUSDT`, on their first load after the update.
 *
 * The list is always exactly as long as the layout needs: it is the one piece
 * of persisted state whose length must agree with another field, and a layout
 * saved on one device can arrive at a build that no longer has it.
 */
export function reconcilePanes(
  layout: LayoutKind,
  saved: readonly Partial<ChartPane>[] | undefined,
  fallbackSymbol: string,
  fallbackTimeframe: Timeframe,
): ChartPane[] {
  const want = paneCount(layout);
  const panes: ChartPane[] = [];
  for (let i = 0; i < want; i++) {
    const s = saved?.[i];
    panes.push({
      id: s?.id ?? "p" + (i + 1),
      symbol: s?.symbol ?? fallbackSymbol,
      timeframe: s?.timeframe ?? fallbackTimeframe,
    });
  }
  return panes;
}

/** The saved focused pane if it still exists, else the first one. */
export function resolveActivePane(
  panes: readonly ChartPane[],
  savedId: string | undefined,
): string {
  return panes.some((p) => p.id === savedId) ? savedId! : panes[0].id;
}
