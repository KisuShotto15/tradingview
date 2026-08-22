import type { Candle } from "@/lib/binance/types";
import type { Drawing, Point } from "@/lib/drawings/types";

/**
 * Snap a price to the nearest OHLC level of the candle closest to the given
 * timestamp. Returns null if there are no candles.
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
 * nearest candle's OHLC and every level the other drawings expose at `time`.
 * Returns null when there is nothing to snap to.
 */
export function snapToLevels(
  price: number,
  time: number,
  candles: Candle[],
  drawings: Drawing[],
  excludeId?: string,
): number | null {
  const candidates = drawingPriceLevels(drawings, time, excludeId);
  const ohlc = snapToOHLC(price, time, candles);
  if (ohlc !== null) candidates.push(ohlc);
  if (candidates.length === 0) return null;
  return candidates.reduce((closest, level) =>
    Math.abs(level - price) < Math.abs(closest - price) ? level : closest,
  );
}
