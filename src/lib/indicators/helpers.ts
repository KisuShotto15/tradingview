/**
 * Math helpers shared across indicators (Pine Script-equivalent primitives).
 * All functions return arrays aligned to the input length, with NaN at positions
 * where the indicator is not yet defined (e.g. warm-up bars).
 */

import type { Candle } from "@/lib/binance/types";

/** Simple moving average. Returns NaN until enough data. */
export function smaSeries(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** EMA seeded with SMA of first `period` values. */
export function emaSeries(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * Wilder's RMA / Pine's rma() — same as EMA but alpha = 1/period.
 * Seeded with SMA of first `period` values.
 */
export function rmaSeries(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** Population standard deviation over a rolling window (matches Pine's stdev). */
export function stdevSeries(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 1) return out;
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    const mean = sum / period;
    let varSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j] - mean;
      varSum += d * d;
    }
    out[i] = Math.sqrt(varSum / period);
  }
  return out;
}

/**
 * Linear regression value at offset bars from the end of the window.
 * Equivalent to Pine's linreg(source, length, offset).
 */
export function linregSeries(values: number[], period: number, offset: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 1) return out;
  for (let i = period - 1; i < values.length; i++) {
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumXX = 0;
    for (let j = 0; j < period; j++) {
      const x = j;
      const y = values[i - period + 1 + j];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }
    const n = period;
    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) continue;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    out[i] = intercept + slope * (period - 1 - offset);
  }
  return out;
}

/** True Range per Pine's tr — first bar uses (high - low). */
export function trueRangeSeries(candles: Candle[]): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      out[i] = candles[i].high - candles[i].low;
      continue;
    }
    const prev = candles[i - 1];
    const c = candles[i];
    out[i] = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
  }
  return out;
}

/** Highest value over a rolling window. */
export function highestSeries(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    let m = -Infinity;
    for (let j = i - period + 1; j <= i; j++) if (values[j] > m) m = values[j];
    out[i] = m;
  }
  return out;
}

/** Lowest value over a rolling window. */
export function lowestSeries(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    let m = Infinity;
    for (let j = i - period + 1; j <= i; j++) if (values[j] < m) m = values[j];
    out[i] = m;
  }
  return out;
}

/** Per-bar HLC3 source (high + low + close) / 3 — VuManchu's WT source. */
export function hlc3Series(candles: Candle[]): number[] {
  return candles.map((c) => (c.high + c.low + c.close) / 3);
}

/** Per-bar close. */
export function closeSeries(candles: Candle[]): number[] {
  return candles.map((c) => c.close);
}

/** Per-bar high / low. */
export function highSeries(candles: Candle[]): number[] {
  return candles.map((c) => c.high);
}
export function lowSeries(candles: Candle[]): number[] {
  return candles.map((c) => c.low);
}
