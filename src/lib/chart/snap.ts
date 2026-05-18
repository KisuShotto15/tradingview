import type { Candle } from "@/lib/binance/types";

/**
 * Snap a price to the nearest OHLC level of the candle closest to the given
 * timestamp. Returns null if there are no candles.
 */
export function snapToOHLC(
  price: number,
  time: number,
  candles: Candle[],
): number | null {
  if (candles.length === 0) return null;
  const candle = candles.reduce((best, c) =>
    Math.abs(c.time - time) < Math.abs(best.time - time) ? c : best,
  );
  const levels = [candle.open, candle.high, candle.low, candle.close];
  return levels.reduce((closest, level) =>
    Math.abs(level - price) < Math.abs(closest - price) ? level : closest,
  );
}
