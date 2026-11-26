import type { ISeriesApi } from "lightweight-charts";
import type { Candle } from "@/lib/binance/types";
import { snapToLevels, type MagnetStrength } from "@/lib/chart/snap";
import { indicatorLevelsAt } from "@/lib/chart/indicator-levels";
import { useChartStore } from "@/lib/store/chart-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";

/**
 * How far, in CSS pixels, the weak magnet reaches beyond the thing it snaps
 * to — TradingView's "when you are drawing near them", given a number.
 *
 * It is measured from a drawing's level, which has no thickness, but from a
 * candle's whole high–low span, so a pointer anywhere on the candle grabs it
 * and this only decides how far *outside* one the pull still works. That
 * distinction is the difference between a magnet that feels dead and one that
 * feels right: measured from the levels, aiming at the middle of a long wick
 * was too far from both ends to snap to either.
 *
 * The strong magnet ignores it for the candle, by design — see
 * `MagnetStrength`. It still bounds the drawings' levels there, since those
 * have no column to own the aim and there is always *some* nearest one.
 *
 * A coarse pointer gets more room, because a fingertip both aims worse and
 * hides the level it is aiming at.
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
  strength: MagnetStrength = "weak",
): number | null {
  const { symbol, magnetIndicators } = useChartStore.getState();
  const drawings = useDrawingsStore
    .getState()
    .drawings.filter((d) => d.symbol === symbol);
  // The price pane's own studies, when the user has asked for them.
  const extra = magnetIndicators ? indicatorLevelsAt(time) : [];
  return snapToLevels(
    price,
    time,
    candles,
    drawings,
    excludeId,
    maxDistance,
    strength,
    extra,
  );
}

/** Convenience for drag handlers: the drawing under the drag is the selected one. */
export function magnetSnapDragging(
  price: number,
  time: number,
  candles: Candle[],
  maxDistance?: number,
  strength: MagnetStrength = "weak",
): number | null {
  return magnetSnap(
    price,
    time,
    candles,
    useDrawingsStore.getState().selectedId ?? undefined,
    maxDistance,
    strength,
  );
}

/** What a modifier key says about the magnet; any event with the two flags. */
export interface MagnetModifiers {
  ctrlKey?: boolean;
  metaKey?: boolean;
}

/**
 * What the magnet should do for this gesture: whether it is on at all, and how
 * hard it pulls.
 *
 * Ctrl/Cmd **inverts** the setting, which is TradingView's rule and not the
 * `||` every call site used to spell out: "You can temporarily turn the strong
 * magnet feature on by [...] holding CTRL/Command", and "if the magnet mode is
 * on you can temporarily turn it off by holding CTRL/Command". So the modifier
 * is how you get the other behaviour for one gesture without going to the
 * toolbar, in both directions — and the one it summons is always the strong
 * one, whatever the toolbar is set to.
 *
 * Every snap call site asks this, so the rule lives in one place; a handler
 * that reimplements `ctrlKey || magnetMode` loses the "off" half of it.
 */
export function magnetFor(ev?: MagnetModifiers | null): {
  on: boolean;
  strength: MagnetStrength;
} {
  const held = Boolean(ev?.ctrlKey || ev?.metaKey);
  const { magnetMode, magnetStrength } = useChartStore.getState();
  if (magnetMode) return { on: !held, strength: magnetStrength };
  return { on: held, strength: "strong" };
}
