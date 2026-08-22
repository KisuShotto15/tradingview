import type { Candle } from "@/lib/binance/types";
import { snapToLevels } from "@/lib/chart/snap";
import { useChartStore } from "@/lib/store/chart-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";

/**
 * The magnet, as every chart interaction should call it: snaps to the nearest
 * candle OHLC *or* to any level another drawing exposes at that time (fib
 * levels, channel rails, a position's entry/stop/target, …).
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
): number | null {
  const symbol = useChartStore.getState().symbol;
  const drawings = useDrawingsStore
    .getState()
    .drawings.filter((d) => d.symbol === symbol);
  return snapToLevels(price, time, candles, drawings, excludeId);
}

/** Convenience for drag handlers: the drawing under the drag is the selected one. */
export function magnetSnapDragging(
  price: number,
  time: number,
  candles: Candle[],
): number | null {
  return magnetSnap(price, time, candles, useDrawingsStore.getState().selectedId ?? undefined);
}
