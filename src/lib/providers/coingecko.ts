import type { Candle, Timeframe } from "@/lib/binance/types";

/** Number of days of history to request based on the chart's timeframe. */
function daysFor(interval: Timeframe): number {
  switch (interval) {
    case "1m":
    case "3m":
    case "5m":
    case "15m":
    case "30m":
    case "1h":
    case "2h":
      return 90;
    case "4h":
    case "6h":
    case "8h":
    case "12h":
      return 180;
    case "1d":
    case "3d":
      return 365;
    case "1w":
      return 1825; // 5y
    case "1M":
      return 3650; // 10y
  }
}

/** Fetch dominance / aggregate market cap series via our CoinGecko proxy. */
export async function fetchCoinGeckoCandles(
  providerSymbol: string,
  interval: Timeframe,
): Promise<Candle[]> {
  const days = daysFor(interval);
  const url = `/api/coingecko?coin=${encodeURIComponent(providerSymbol)}&days=${days}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const data = (await res.json()) as { candles?: Candle[]; error?: string };
  if (data.error) throw new Error(data.error);
  return data.candles ?? [];
}
