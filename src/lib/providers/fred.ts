import type { Candle } from "@/lib/binance/types";

/** Fetch a FRED series via our proxy route. */
export async function fetchFredCandles(seriesId: string): Promise<Candle[]> {
  const url = `/api/fred?series=${encodeURIComponent(seriesId)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fred ${res.status}`);
  const data = (await res.json()) as { candles?: Candle[]; error?: string };
  if (data.error) throw new Error(data.error);
  return data.candles ?? [];
}
