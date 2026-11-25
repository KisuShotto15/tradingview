import type { Candle } from "@/lib/binance/types";
import type { Drawing, Point } from "@/lib/drawings/types";

/**
 * The spacing between bars, in seconds, taken from the series itself.
 *
 * Derived rather than passed in so the module stays dependency-free: the
 * caller's `intervalSec` would say the same thing, but every call site would
 * have to thread it through.
 */
function barSpan(candles: Candle[]): number | null {
  if (candles.length < 2) return null;
  const span = candles[1].time - candles[0].time;
  return span > 0 ? span : null;
}

/**
 * Snap a price to the nearest OHLC level of the bar the cursor is over.
 * Returns null when there are no candles, or when the cursor is not over one.
 *
 * There is deliberately **no vertical tolerance**. A bar occupies a column,
 * and only one bar can be under the cursor at a time, so within that column
 * there is exactly one candle to snap to and no ambiguity to resolve: above
 * it, the nearest of its four levels is its high; below it, its low. A
 * vertical reach only ever decided whether to answer at all, and whatever it
 * was set to, aiming anywhere other than close to a level made the magnet go
 * quiet — which is indistinguishable from it being broken. It was 14px, then
 * 30px, and the right answer turned out to be that the question was wrong.
 *
 * The gate is horizontal instead: half a bar either side of the bar's centre,
 * which is precisely its own column. That is what keeps the magnet from
 * reaching into the empty space past the last bar, where there is no candle
 * to grab and the cursor should move freely.
 */
export function snapToOHLC(
  price: number,
  time: number,
  candles: Candle[],
): number | null {
  if (candles.length === 0) return null;
  const candle = candles.reduce((best, c) =>
    Math.abs(c.time - time) < Math.abs(best.time - time) ? c : best,
  );
  const span = barSpan(candles);
  if (span !== null && Math.abs(candle.time - time) > span / 2) return null;
  const levels = [candle.open, candle.high, candle.low, candle.close];
  return levels.reduce((closest, level) =>
    Math.abs(level - price) < Math.abs(closest - price) ? level : closest,
  );
}

/** Price of the infinite line through `a` and `b`, evaluated at `time`. */
function lineAt(a: Point, b: Point, time: number): number | null {
  const dt = b.time - a.time;
  if (dt === 0) return null; // vertical: no single price at this time
  return a.price + ((time - a.time) / dt) * (b.price - a.price);
}

/** Price of the segment a→b at `time`, or null when `time` falls outside it. */
function segmentAt(a: Point, b: Point, time: number): number | null {
  const lo = Math.min(a.time, b.time);
  const hi = Math.max(a.time, b.time);
  if (time < lo || time > hi) return null;
  return lineAt(a, b, time);
}

/** Price of the ray starting at `a` and passing through `b`, at `time`. */
function rayAt(a: Point, b: Point, time: number): number | null {
  // The ray only exists on b's side of a.
  if (b.time >= a.time ? time < a.time : time > a.time) return null;
  return lineAt(a, b, time);
}

function push(out: number[], v: number | null | undefined) {
  if (v !== null && v !== undefined && Number.isFinite(v)) out.push(v);
}

/**
 * Every price level the given drawings expose at `time` — the levels the
 * magnet should be able to grab onto besides the candle's own OHLC.
 *
 * Sloped shapes (trend line, ray, channel) are interpolated to `time`, so the
 * magnet follows them across the chart instead of only snapping at their
 * anchor points; horizontal families (fib levels, ranges, position E/S/T) are
 * unbounded in time because that is how they read on screen.
 *
 * `excludeId` skips the drawing currently being dragged — without it a shape
 * snaps to its own levels and refuses to move.
 */
export function drawingPriceLevels(
  drawings: Drawing[],
  time: number,
  excludeId?: string,
): number[] {
  const out: number[] = [];
  for (const d of drawings) {
    if (d.id === excludeId) continue;
    if (d.hidden) continue;
    switch (d.kind) {
      case "hline":
        push(out, d.price);
        break;
      case "hray":
        if (time >= d.anchor.time) push(out, d.anchor.price);
        break;
      case "trendline":
      case "arrow":
        push(out, segmentAt(d.a, d.b, time));
        break;
      case "ray":
        push(out, rayAt(d.a, d.b, time));
        break;
      case "parallel-channel": {
        const base = segmentAt(d.a, d.b, time);
        if (base === null) break;
        push(out, base);
        // The second rail is the same line translated so it passes through C.
        const atC = lineAt(d.a, d.b, d.c.time);
        if (atC !== null) push(out, base + (d.c.price - atC));
        break;
      }
      case "fib-retracement": {
        const range = d.b.price - d.a.price;
        for (const level of d.levels) push(out, d.a.price + range * level);
        break;
      }
      case "fib-extension": {
        const move = d.b.price - d.a.price;
        for (const level of d.levels) push(out, d.c.price + move * level);
        break;
      }
      case "price-range":
        push(out, d.priceA);
        push(out, d.priceB);
        break;
      case "rectangle":
        push(out, d.a.price);
        push(out, d.b.price);
        break;
      case "long":
      case "short":
        push(out, d.entry);
        push(out, d.stop);
        push(out, d.target);
        break;
      case "xabcd": {
        // Interpolate whichever leg spans `time`.
        for (let i = 0; i < d.points.length - 1; i++) {
          push(out, segmentAt(d.points[i], d.points[i + 1], time));
        }
        break;
      }
      default:
        // vline / date-range / brush / highlighter / text / callout /
        // pitchfork carry no meaningful horizontal level.
        break;
    }
  }
  return out;
}

/**
 * Magnet target: the candidate price closest to `price`, considering both the
 * OHLC of the bar under the cursor and every level the other drawings expose
 * at `time`. Returns null when there is nothing to snap to.
 *
 * `maxDistance` is a reach in price units, and it now bounds **only the
 * drawings' levels**. A drawing's level has no thickness and there can be any
 * number of them anywhere on the pane, so without a bound the magnet would
 * fling a dragged point across the chart to whichever fib rung happened to be
 * nearest — a teleport rather than a snap. The candle needs no such bound
 * because its column already answers "which candle", and that is the whole
 * ambiguity there was to settle; see `snapToOHLC`.
 */
export function snapToLevels(
  price: number,
  time: number,
  candles: Candle[],
  drawings: Drawing[],
  excludeId?: string,
  maxDistance?: number,
): number | null {
  // A drawing's level has no thickness, so it is taken on plain distance.
  const candidates = drawingPriceLevels(drawings, time, excludeId).filter(
    (level) => maxDistance === undefined || Math.abs(level - price) <= maxDistance,
  );
  // The candle is judged by its column, not by distance — see snapToOHLC.
  const ohlc = snapToOHLC(price, time, candles);
  if (ohlc !== null) candidates.push(ohlc);
  if (candidates.length === 0) return null;
  return candidates.reduce((closest, level) =>
    Math.abs(level - price) < Math.abs(closest - price) ? level : closest,
  );
}
