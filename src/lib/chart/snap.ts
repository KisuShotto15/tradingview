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
 * How hard the magnet pulls, with TradingView's own two settings and its own
 * definitions of them:
 *
 * - `strong` — "pulls the drawing points to chart values (bars), regardless of
 *   the distance between the points and chart values". Anywhere in a bar's
 *   column lands on one of its four prices, however far away the aim was.
 * - `weak` — "pulls the drawing points to chart values (bars) when you are
 *   drawing near them". Near is `MAGNET_RADIUS_PX` around the bar.
 *
 * They are a choice the user makes, not a bug to be split the difference on,
 * which is what this code did for a while: strong alone reads as a teleport to
 * someone who wanted weak, and weak alone reads as dead to someone who wanted
 * strong. Ctrl/Cmd inverts whichever is set, rather than adding to it: with
 * the magnet off it gives the strong one for a single gesture, and with the
 * magnet on it gives a free point — see `magnetFor`.
 */
export type MagnetStrength = "weak" | "strong";

/**
 * Snap a price to the nearest OHLC level of the bar the cursor is over.
 * Returns null when there are no candles, or when the cursor is not over one.
 *
 * Two gates, one of which the user controls.
 *
 * **Horizontal: the bar's own column.** Only one bar can be under the cursor,
 * so within its column there is exactly one candle to snap to and nothing to
 * disambiguate — above it, the nearest of its four levels is its high; below
 * it, its low. Half a bar either side of the centre is precisely that column,
 * and it is what keeps the magnet from reaching into the empty space past the
 * last bar, where there is no candle to grab.
 *
 * **Vertical: `maxDistance` around the candle's own span.** Passing it is the
 * weak magnet, leaving it out is the strong one, and the reach is measured
 * from the high–low span rather than from the four levels: a pointer anywhere
 * on the candle, body or wick, grabs the nearest level with no reach needed.
 * Measuring from the levels instead is what made the magnet feel dead — the
 * middle of a long wick, the obvious place to aim, was too far from both ends
 * to snap to either.
 *
 * Which of the two is right is not for this function to decide. Unbounded, a
 * bar's wick is a few pixels of a phone's ~500px plot, so a finger aiming at
 * empty space is pulled 147px to that bar's extreme at the top of the screen:
 * exactly what the strong magnet is specified to do, and exactly what someone
 * who wanted the weak one reports as broken.
 */
export function snapToOHLC(
  price: number,
  time: number,
  candles: Candle[],
  maxDistance?: number,
): number | null {
  if (candles.length === 0) return null;
  const candle = candles.reduce((best, c) =>
    Math.abs(c.time - time) < Math.abs(best.time - time) ? c : best,
  );
  const span = barSpan(candles);
  if (span !== null && Math.abs(candle.time - time) > span / 2) return null;
  const levels = [candle.open, candle.high, candle.low, candle.close];
  if (maxDistance !== undefined) {
    const low = Math.min(...levels);
    const high = Math.max(...levels);
    if (price < low - maxDistance || price > high + maxDistance) return null;
  }
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
 * `maxDistance` is a reach in price units, beyond which nothing is snapped.
 * The caller converts a pixel reach through the series' own scale, so the pull
 * feels the same at any zoom level. The weak magnet bounds everything by it;
 * the strong one drops it entirely inside a bar's column and keeps it outside
 * one — see `MagnetStrength` and the note in the body.
 *
 * `extraLevels` are prices some other source offers at `time` — in practice
 * the indicator lines on the price pane, which the chart publishes through
 * `indicator-levels.ts`. They are treated exactly like a drawing's level: no
 * thickness, so plain distance.
 */
export function snapToLevels(
  price: number,
  time: number,
  candles: Candle[],
  drawings: Drawing[],
  excludeId?: string,
  maxDistance?: number,
  strength: MagnetStrength = "weak",
  extraLevels: readonly number[] = [],
): number | null {
  const ohlc = snapToOHLC(
    price,
    time,
    candles,
    strength === "strong" ? undefined : maxDistance,
  );
  /*
   * Inside a bar's column the strong magnet ignores the reach for *every*
   * candidate, not only the candle's own OHLC.
   *
   * Bounding the levels while the candle went unbounded was incoherent, and
   * on a dragged line it was the whole complaint: at the edge of the reach a
   * level 48px away dropped out and the bar's high, 111px away, won instead,
   * so one pixel of finger movement threw the line across the pane — and the
   * next pixel threw it back. A magnet has to be a monotone function of the
   * aim. With everything unbounded in the column, the answer is simply the
   * nearest level there is, which moves the same way the finger does.
   *
   * Outside any column there is no candle (`ohlc` is null), and the reach
   * comes back — otherwise a horizontal ray's level would grab the cursor
   * from anywhere in the empty space past the last bar, where the strong
   * magnet is supposed to leave it alone.
   */
  const bound = strength === "strong" && ohlc !== null ? undefined : maxDistance;
  const candidates = [...drawingPriceLevels(drawings, time, excludeId), ...extraLevels].filter(
    (level) => bound === undefined || Math.abs(level - price) <= bound,
  );
  if (ohlc !== null) candidates.push(ohlc);
  if (candidates.length === 0) return null;
  return candidates.reduce((closest, level) =>
    Math.abs(level - price) < Math.abs(closest - price) ? level : closest,
  );
}
