import type { Candle } from "@/lib/binance/types";

/**
 * Anchored VWAP with volume-weighted standard-deviation bands.
 *
 * Ported from the trade journal (`workers/trade-journal-worker/src/indicators.js`
 * in kisushotto-site) so both apps draw the same lines from the same numbers.
 * Semantics are kept identical on purpose, including the NY anchor's quirk of
 * treating pre-market as its own segment — see `anchorKeyFor`.
 */

export type VwapAnchor = "utc" | "ny";

export interface VwapPoint {
  time: number;
  vwap: number;
  /** Volume-weighted standard deviation at this bar; bands are vwap ± n·sd. */
  sd: number;
  /** Session id this bar belongs to. Changes mark a reset. */
  anchor: number;
}

/** 09:30 New York, in minutes past local midnight. */
const NY_OPEN_MIN = 9 * 60 + 30;

const NY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Seconds to add to a UTC timestamp to get New York wall-clock time, cached
 * per UTC hour.
 *
 * The journal calls `Intl.formatToParts` once per candle, which is fine over
 * the handful of bars a ticket chart holds. Here the same code would run over
 * up to 2000 candles on *every* WebSocket tick — several times a second on a
 * busy Bybit symbol — and `formatToParts` is far too slow for that. The offset
 * is constant within any given hour (DST shifts land on the hour), so one
 * lookup per distinct hour gives the same answer for a fraction of the work.
 */
const offsetCache = new Map<number, number>();

function nyOffsetSec(timeSec: number): number {
  const bucket = Math.floor(timeSec / 3600);
  const cached = offsetCache.get(bucket);
  if (cached !== undefined) return cached;

  const parts = Object.fromEntries(
    NY_FMT.formatToParts(new Date(timeSec * 1000)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  // Some ICU builds render midnight as hour "24" under hour12:false.
  const hour = Number(parts.hour) % 24;
  const localAsUtcSec =
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      hour,
      Number(parts.minute),
    ) / 1000;
  // `formatToParts` only resolves to the minute, so compare at minute precision.
  const offset = localAsUtcSec - Math.floor(timeSec / 60) * 60;
  offsetCache.set(bucket, offset);
  return offset;
}

/**
 * Session id for a bar. A change in the returned value restarts the VWAP.
 *
 * - `utc`: one session per UTC day (00:00), the default session for crypto.
 * - `ny`: splits each New York day at 09:30. Note this yields **two** resets a
 *   day — one at local midnight when the date rolls over, another at the open —
 *   because pre-market bars form a segment of their own. That is what the
 *   journal does, and matching it is the point of this port.
 */
export function anchorKeyFor(anchor: VwapAnchor): (timeSec: number) => number {
  if (anchor === "utc") return (timeSec) => Math.floor(timeSec / 86400);
  return (timeSec) => {
    const local = timeSec + nyOffsetSec(timeSec);
    const day = Math.floor(local / 86400);
    const minutes = Math.floor((local - day * 86400) / 60);
    // Two slots per day keep the pre-market segment distinct from the session.
    return minutes >= NY_OPEN_MIN ? day * 2 : day * 2 + 1;
  };
}

/**
 * VWAP and its standard deviation for every candle, restarting at each anchor.
 *
 * Uses the typical price (H+L+C)/3 weighted by volume, and derives σ from the
 * running sums of `tp·v` and `tp²·v` — one pass, no second loop over the
 * session. `Math.max(0, …)` guards the variance against the tiny negative that
 * floating-point cancellation can produce when price barely moves.
 */
export function vwapBands(
  candles: Candle[],
  anchor: VwapAnchor = "utc",
): VwapPoint[] {
  const keyOf = anchorKeyFor(anchor);
  const out: VwapPoint[] = [];
  let current: number | null = null;
  let pv = 0;
  let pv2 = 0;
  let vol = 0;

  for (const k of candles) {
    const key = keyOf(k.time);
    if (key !== current) {
      current = key;
      pv = 0;
      pv2 = 0;
      vol = 0;
    }
    const tp = (k.high + k.low + k.close) / 3;
    pv += tp * k.volume;
    pv2 += tp * tp * k.volume;
    vol += k.volume;
    const vwap = vol > 0 ? pv / vol : tp;
    const sd = vol > 0 ? Math.sqrt(Math.max(0, pv2 / vol - vwap * vwap)) : 0;
    out.push({ time: k.time, vwap, sd, anchor: key });
  }
  return out;
}
