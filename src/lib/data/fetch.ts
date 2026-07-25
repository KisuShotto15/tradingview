import type { Candle, Timeframe } from "@/lib/binance/types";
import { fetchKlines } from "@/lib/binance/rest";
import { fetchSyntheticKlines } from "@/lib/binance/synthetic";
import { fetchYahooCandles } from "@/lib/providers/yahoo";
import { fetchFredCandles } from "@/lib/providers/fred";
import { fetchCoinGeckoCandles } from "@/lib/providers/coingecko";
import { resolveSource } from "@/lib/symbols/source";

/**
 * One-shot candle fetcher that auto-dispatches to the correct provider.
 *
 * The PriceChart should call this instead of the Binance-specific helpers so
 * stocks, futures, indices, dominances, and FRED macro series all share the
 * same loading path.
 */
export async function fetchCandles(
  symbol: string,
  interval: Timeframe,
  limit = 1000,
): Promise<Candle[]> {
  const src = resolveSource(symbol);
  switch (src.kind) {
    case "synthetic":
      return fetchSyntheticKlines(src.expression, interval, limit);
    case "yahoo":
      return fetchYahooCandles(src.providerSymbol, interval);
    case "fred":
      return fetchFredCandles(src.providerSymbol);
    case "coingecko":
      return fetchCoinGeckoCandles(src.providerSymbol, interval);
    case "binance":
      return fetchKlines(src.symbol, interval, limit);
  }
}

/**
 * Page older candles ending strictly before `beforeTimeSec`. Used by bar replay
 * to give the playhead room behind the initially-loaded window.
 *
 * Only Binance sources support paging (the app's focus); other providers return
 * `[]`, so replay simply runs on whatever candles are already loaded.
 */
export async function fetchOlderCandles(
  symbol: string,
  interval: Timeframe,
  beforeTimeSec: number,
  limit = 1000,
): Promise<Candle[]> {
  const src = resolveSource(symbol);
  if (src.kind !== "binance") return [];
  // endTime is exclusive-ish; step back 1ms so we don't refetch the boundary bar.
  const candles = await fetchKlines(src.symbol, interval, limit, beforeTimeSec * 1000 - 1);
  return candles.filter((c) => c.time < beforeTimeSec);
}
