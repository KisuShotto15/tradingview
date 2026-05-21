import type { Candle, Timeframe } from "@/lib/binance/types";

/** Fetch candles from our Yahoo Finance proxy route. */
export async function fetchYahooCandles(
  providerSymbol: string,
  interval: Timeframe,
): Promise<Candle[]> {
  const url = `/api/yahoo?symbol=${encodeURIComponent(providerSymbol)}&interval=${interval}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const data = (await res.json()) as { candles?: Candle[]; error?: string };
  if (data.error) throw new Error(data.error);
  return data.candles ?? [];
}
