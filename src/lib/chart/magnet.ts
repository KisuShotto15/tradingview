import type { ISeriesApi } from "lightweight-charts";
import type { Candle } from "@/lib/binance/types";
import { snapToLevels } from "@/lib/chart/snap";
import { useChartStore } from "@/lib/store/chart-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";

/**
 * How close, in CSS pixels, the cursor has to be to a candle before the magnet
 * will grab one of its levels.
 *
 * This is a *reach beyond the candle*, not a distance to the level itself:
 * `snapToOHLC` already treats anywhere inside the high–low span as a hit, and
 * this widens that band at both ends. Without any bound the magnet always
 * finds *a* nearest level and always fires, which is a teleport rather than a
 * snap.
 *
 * It was 14px, and that is what made the magnet feel dead: on a dense chart a
 * candle is only a few pixels tall, so the whole catchment was under 35px and
 * you had to aim at the wick to get anything — the user's words were that you
 * have to be practically on the point. 30px is a little over a finger-width of
 * tolerance on either side of the candle, which is what the venues' own charts
 * give you; a coarse pointer gets more, because a fingertip both aims worse
 * and hides the very level it is aiming at.
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
 * the pane), which leaves the magnet unbounded — the previous behaviour, and
 * better than snapping to nothing at all.
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
