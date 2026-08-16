/**
 * Exchange-qualified symbol prefixes (TradingView-style `EXCHANGE:TICKER`).
 *
 * A shared ticker like `SOLUSDT.P` exists on both Binance and Bybit. To let the
 * user pick which venue's chart to load, the Bybit variant is written
 * `BYBIT:SOLUSDT.P`. This leaf module has no imports so it can be used by both
 * the low-level Binance helpers and the higher-level source resolver without
 * creating an import cycle.
 */

export const BYBIT_PREFIX = "BYBIT:";

/** Remove any `BYBIT:` prefix, returning the bare ticker (keeps the `.P`). */
export function stripExchangePrefix(s: string): string {
  const up = s.toUpperCase();
  return up.startsWith(BYBIT_PREFIX) ? up.slice(BYBIT_PREFIX.length) : up;
}

/** True when the symbol explicitly targets Bybit via the `BYBIT:` prefix. */
export function hasBybitPrefix(s: string): boolean {
  return s.toUpperCase().startsWith(BYBIT_PREFIX);
}
