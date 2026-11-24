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
