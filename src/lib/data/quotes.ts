/**
 * Last price and daily change for symbols no exchange socket streams —
 * stocks, indices, macro series, market caps and synthetic expressions.
 *
 * The watchlists used to send every non-Bybit symbol to Binance's 24h ticker,
 * which knows nothing of AAPL: the row sat on "--" for as long as it was in
 * the list. These are polled over REST instead, from the same providers the
 * chart uses for them, at a rate their own data deserves.
 */
import { fetchCandles } from "@/lib/data/fetch";
import { fetchYahooCandles } from "@/lib/providers/yahoo";
import { resolveSource } from "@/lib/symbols/source";

export interface Quote {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
}

/** How often a watchlist re-polls these. The Yahoo route is CDN-cached for 15s. */
export const REST_QUOTE_MS = 30_000;

/** Whether a symbol's live price comes off an exchange socket. */
export function isStreamed(symbol: string): boolean {
  const kind = resolveSource(symbol).kind;
  return kind === "binance" || kind === "bybit";
}

/**
 * A quote from daily bars: the last close, and its change against the close
 * before — the previous session, which is what a stock's "change" means.
 */
export function quoteFromCandles(
  symbol: string,
  candles: { close: number }[],
): Quote | null {
  const last = candles[candles.length - 1];
  if (!last || !Number.isFinite(last.close)) return null;
  const prev = candles[candles.length - 2];
  const pct =
    prev && prev.close !== 0 && Number.isFinite(prev.close)
      ? ((last.close - prev.close) / prev.close) * 100
      : 0;
  return { symbol, lastPrice: last.close, priceChangePercent: pct };
}

/** Quotes for every symbol that answers; one failing symbol drops only its own row. */
export async function fetchRestQuotes(symbols: string[]): Promise<Quote[]> {
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const src = resolveSource(symbol);
      const candles =
        src.kind === "yahoo"
          ? await fetchYahooCandles(src.providerSymbol, "1d", "5d")
          : await fetchCandles(symbol, "1d", 2);
      return quoteFromCandles(symbol, candles);
    }),
  );
  return results.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
}
