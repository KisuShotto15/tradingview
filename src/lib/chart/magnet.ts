import type { ISeriesApi } from "lightweight-charts";
import type { Candle } from "@/lib/binance/types";
import { snapToLevels } from "@/lib/chart/snap";
import { useChartStore } from "@/lib/store/chart-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";

/**
 * How close, in CSS pixels, the cursor has to be to **another drawing's**
 * level for the magnet to grab it.
 *
 * It does not apply to the candle. A bar owns a column and only one bar is
 * ever under the cursor, so `snapToOHLC` answers from the column alone and
 * needs no reach — this value started life gating that too, at 14px and then
 * 30px, and both made the magnet go quiet wherever the aim was not already
 * close to a level.
 *
 * The drawings' levels are the opposite case: there can be any number of them
 * at any price, with no thickness to be "on", so without a bound the magnet
 * would fling a dragged point across the pane to whichever fib rung happened
 * to be nearest. A coarse pointer gets more room, because a fingertip both
 * aims worse and hides the level it is aiming at.
 */
export const MAGNET_RADIUS_PX = { fine: 30, coarse: 44 };

/** The reach for the pointer currently in use. */
function reachPx(): number {
  if (typeof window === "undefined" || !window.matchMedia) return MAGNET_RADIUS_PX.fine;
  return window.matchMedia("(pointer: coarse)").matches
    ? MAGNET_RADIUS_PX.coarse
    : MAGNET_RADIUS_PX.fine;
}

/**
 * The magnet's reach expressed in price, at the series' current scale.
 *
 * Measured locally around `y` rather than from the whole visible range, so it
 * stays correct on a logarithmic scale, where price per pixel is not constant.
 * Returns undefined when the series cannot answer (no data yet, or `y` outside
 * the pane), which leaves the drawings' levels unbounded — better than
 * snapping to nothing at all.
 */
export function magnetRadius(
  series: ISeriesApi<"Candlestick"> | null,
  y: number,
): number | undefined {
  if (!series) return undefined;
  const a = series.coordinateToPrice(y);
  const b = series.coordinateToPrice(y + reachPx());
  if (a === null || b === null) return undefined;
  const d = Math.abs((a as number) - (b as number));
  return Number.isFinite(d) && d > 0 ? d : undefined;
}

/**
 * The magnet, as every chart interaction should call it: snaps to the OHLC of
 * the bar under the cursor *or* to any level another drawing exposes at that
 * time (fib levels, channel rails, a position's entry/stop/target, …).
 *
 * Kept out of `snap.ts` so that module stays pure and testable — this one
 * exists only to pull the current symbol's drawings off the store, which is
 * what every call site would otherwise have to plumb through by hand.
 *
 * `excludeId` must be the drawing being dragged: a shape that can snap to its
 * own levels sticks to its starting position and never moves.
 */
export function magnetSnap(
  price: number,
  time: number,
  candles: Candle[],
  excludeId?: string,
  maxDistance?: number,
): number | null {
  const symbol = useChartStore.getState().symbol;
  const drawings = useDrawingsStore
    .getState()
    .drawings.filter((d) => d.symbol === symbol);
  return snapToLevels(price, time, candles, drawings, excludeId, maxDistance);
}

/** Convenience for drag handlers: the drawing under the drag is the selected one. */
export function magnetSnapDragging(
  price: number,
  time: number,
  candles: Candle[],
  maxDistance?: number,
): number | null {
  return magnetSnap(
    price,
    time,
    candles,
    useDrawingsStore.getState().selectedId ?? undefined,
    maxDistance,
  );
}
