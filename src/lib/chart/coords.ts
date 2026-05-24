/**
 * Time / pixel coordinate helpers that support extrapolation past the last
 * candle. Lightweight-charts' built-in `timeToCoordinate` and `coordinateToTime`
 * return null for positions outside the data range, but for drawings we want
 * to place anchors in the "future" zone of the right-offset area.
 */

import type { IChartApi, UTCTimestamp } from "lightweight-charts";
import type { Candle, Timeframe } from "@/lib/binance/types";

export function timeframeToSeconds(tf: Timeframe): number {
  const map: Record<Timeframe, number> = {
    "1m": 60,
    "3m": 180,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "2h": 7200,
    "4h": 14400,
    "6h": 21600,
    "8h": 28800,
    "12h": 43200,
    "1d": 86400,
    "3d": 259200,
    "1w": 604800,
    "1M": 2592000,
  };
  return map[tf] ?? 60;
}

/**
 * Convert a pixel x-coordinate to a unix-second timestamp. Handles positions
 * past the last candle by extrapolating using the timeframe's interval.
 */
export function xToTime(
  chart: IChartApi,
  x: number,
  candles: Candle[],
  intervalSec: number,
): number | null {
  if (candles.length === 0) return null;
  const logical = chart.timeScale().coordinateToLogical(x);
  if (logical === null) return null;
  const lastIdx = candles.length - 1;
  if (logical >= 0 && logical <= lastIdx) {
    // Sub-bar precision: interpolate between neighboring candle timestamps
    // so brush strokes don't snap to candle boundaries (staircase effect).
    const i = Math.min(Math.floor(logical), lastIdx - 1);
    const frac = logical - i;
    return candles[i].time + frac * (candles[i + 1].time - candles[i].time);
  }
  if (logical > lastIdx) {
    const barsAhead = logical - lastIdx;
    return candles[lastIdx].time + barsAhead * intervalSec;
  }
  // logical < 0
  const barsBefore = -logical;
  return candles[0].time - barsBefore * intervalSec;
}

/**
 * Convert a unix-second timestamp to a pixel x-coordinate. Handles timestamps
 * past the last candle by using the logical-to-coordinate mapping.
 */
export function timeToX(
  chart: IChartApi,
  t: number,
  candles: Candle[],
  intervalSec: number,
): number | null {
  const direct = chart.timeScale().timeToCoordinate(t as UTCTimestamp);
  if (direct !== null) return direct;
  if (candles.length === 0) return null;
  const first = candles[0];
  const last = candles[candles.length - 1];
  if (t > last.time) {
    const barsAhead = (t - last.time) / intervalSec;
    return chart.timeScale().logicalToCoordinate((candles.length - 1 + barsAhead) as never);
  }
  if (t < first.time) {
    const barsBefore = (first.time - t) / intervalSec;
    return chart.timeScale().logicalToCoordinate(-barsBefore as never);
  }
  // Fractional timestamp between existing candles (e.g. brush strokes).
  // Approximate logical position via interval spacing.
  const logical = (t - first.time) / intervalSec;
  return chart.timeScale().logicalToCoordinate(logical as never);
}
