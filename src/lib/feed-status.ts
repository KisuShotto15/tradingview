/**
 * Shared vocabulary for "is the market feed actually alive?".
 *
 * Dependency-free leaf module: both exchange WebSocket clients publish it and
 * the UI reads it, so it must not import either side.
 */
export type FeedStatus = "connecting" | "live" | "down";

/**
 * How long a socket may go completely silent before it is treated as dead.
 *
 * This exists because `onclose` is not reliable. A socket can be left
 * half-open — laptop sleep, a network switch, a VPN dropping — with the TCP
 * connection still nominally established and nothing ever arriving. The
 * browser fires no event, `readyState` stays OPEN, and the chart simply stops
 * updating with no error anywhere. Closing it ourselves is what turns that
 * silent failure back into the normal reconnect path.
 *
 * The thresholds are generous on purpose: a false positive costs a reconnect
 * storm, which is worse than a few extra seconds of staleness.
 *
 *  - Binance pushes kline updates roughly once a second per stream, so 45s of
 *    total silence across every subscription cannot be a quiet market.
 *  - Bybit answers our 20s heartbeat with a pong, so there is traffic every
 *    20s even on a dead-quiet symbol; 60s is three missed beats.
 */
export const STALE_MS = { binance: 45_000, bybit: 60_000 } as const;

/** How often the watchdog checks. Cheap: one timestamp comparison. */
export const WATCHDOG_MS = 10_000;

/**
 * Tracks subscribers to a feed's status and remembers the last value, so a
 * component mounting late is told the current state immediately rather than
 * waiting for the next transition.
 */
export class FeedStatusEmitter {
  private status: FeedStatus = "down";
  private subs = new Set<(s: FeedStatus) => void>();

  get(): FeedStatus {
    return this.status;
  }

  set(next: FeedStatus): void {
    if (next === this.status) return;
    this.status = next;
    for (const cb of this.subs) cb(next);
  }

  subscribe(cb: (s: FeedStatus) => void): () => void {
    this.subs.add(cb);
    cb(this.status);
    return () => {
      this.subs.delete(cb);
    };
  }
}

/**
 * When the charted symbol last had a live bar update applied.
 *
 * Separate from the sockets' own `lastMsgAt`, and that separation is the
 * point. A Binance connection is shared: the chart's `@kline_<tf>` and the
 * watchlist's `@miniTicker` streams ride the same socket, so any watchlist
 * row ticking keeps `lastMsgAt` fresh. The socket watchdog therefore cannot
 * see the case where the socket is healthy but *this symbol's subscription*
 * is delivering nothing — and the status badge goes on claiming "Live" while
 * the chart sits still, which is the worst of both worlds.
 *
 * A plain mutable box rather than store state: it is written on every tick,
 * which at several a second would be a render per tick for a value only two
 * places poll.
 */
export const chartTick = { at: 0 };

export function markChartTick(): void {
  chartTick.at = Date.now();
}

/** Infinity until the first tick, so "never arrived" reads as stale. */
export function chartTickAgeMs(): number {
  return chartTick.at === 0 ? Infinity : Date.now() - chartTick.at;
}

/** Reset on symbol/timeframe change, so the previous symbol's last tick is
 *  not mistaken for this one's. */
export function resetChartTick(): void {
  chartTick.at = 0;
}

/**
 * How long the charted symbol may go without a tick before the feed is
 * reported as stale and the subscription is rebuilt. Binance pushes kline
 * updates roughly once a second per stream, so 20s of nothing is not a quiet
 * market.
 */
export const CHART_TICK_STALE_MS = 20_000;
