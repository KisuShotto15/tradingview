/**
 * Squeeze Momentum Indicator [LazyBear]
 * https://www.tradingview.com/script/nqQ1DT5a-Squeeze-Momentum-Indicator-LazyBear/
 *
 * Faithful Pine v2 transcription. NOTE: the original deliberately uses `multKC`
 * for the BB `dev` calculation (not `mult`). We preserve that.
 *
 *   BB:      basis = sma(close, len);  dev = multKC * stdev(close, len)
 *   KC:      ma    = sma(close, lenKC); range = useTR ? tr : (h - l)
 *            rangema = sma(range, lenKC)
 *            upperKC = ma + rangema * multKC; lowerKC = ma - rangema * multKC
 *   sqzOn  = lowerBB > lowerKC  AND  upperBB < upperKC
 *   sqzOff = lowerBB < lowerKC  AND  upperBB > upperKC
 *   val    = linreg(close - avg(avg(highest(h, lenKC), lowest(l, lenKC)), sma(close, lenKC)), lenKC, 0)
 *
 * Colors:
 *   val > 0 & rising  → lime    (strong bull momentum)
 *   val > 0 & falling → green
 *   val < 0 & falling → red     (strong bear momentum)
 *   val < 0 & rising  → maroon
 */

import type { Candle } from "@/lib/binance/types";
import {
  closeSeries,
  highSeries,
  highestSeries,
  linregSeries,
  lowSeries,
  lowestSeries,
  smaSeries,
  stdevSeries,
  trueRangeSeries,
} from "./helpers";

export type SqueezeState = "on" | "off" | "no";
export type SqueezeColor = "lime" | "green" | "red" | "maroon";

export interface SqueezePoint {
  time: number;
  momentum: number;
  state: SqueezeState;
  color: SqueezeColor;
}

export interface SqueezeConfig {
  bbLength?: number;
  bbMult?: number;
  kcLength?: number;
  kcMult?: number;
  useTrueRange?: boolean;
}

export function squeezeMomentum(candles: Candle[], cfg: SqueezeConfig = {}): SqueezePoint[] {
  const length = cfg.bbLength ?? 20;
  const mult = cfg.bbMult ?? 2.0;
  const lengthKC = cfg.kcLength ?? 20;
  const multKC = cfg.kcMult ?? 1.5;
  const useTR = cfg.useTrueRange ?? true;
  void mult; // LazyBear used multKC in BB dev — preserve original

  if (candles.length < Math.max(length, lengthKC) + 1) return [];

  const close = closeSeries(candles);
  const high = highSeries(candles);
  const low = lowSeries(candles);

  // BB
  const basis = smaSeries(close, length);
  const std = stdevSeries(close, length);
  const dev = std.map((v) => v * multKC);
  const upperBB = basis.map((b, i) => b + dev[i]);
  const lowerBB = basis.map((b, i) => b - dev[i]);

  // KC
  const ma = smaSeries(close, lengthKC);
  const range = useTR
    ? trueRangeSeries(candles)
    : candles.map((c) => c.high - c.low);
  const rangema = smaSeries(range, lengthKC);
  const upperKC = ma.map((m, i) => m + rangema[i] * multKC);
  const lowerKC = ma.map((m, i) => m - rangema[i] * multKC);

  // Momentum source: close - avg(avg(highest(high,KC), lowest(low,KC)), sma(close,KC))
  const hh = highestSeries(high, lengthKC);
  const ll = lowestSeries(low, lengthKC);
  const smaClose = smaSeries(close, lengthKC);
  const src = close.map((c, i) => {
    const midHL = (hh[i] + ll[i]) / 2;
    const centerline = (midHL + smaClose[i]) / 2;
    return c - centerline;
  });
  const val = linregSeries(src, lengthKC, 0);

  const out: SqueezePoint[] = [];
  let prevVal: number | null = null;
  for (let i = 0; i < candles.length; i++) {
    const v = val[i];
    if (isNaN(v) || isNaN(upperBB[i]) || isNaN(upperKC[i])) {
      prevVal = null;
      continue;
    }
    const sqzOn = lowerBB[i] > lowerKC[i] && upperBB[i] < upperKC[i];
    const sqzOff = lowerBB[i] < lowerKC[i] && upperBB[i] > upperKC[i];
    const state: SqueezeState = sqzOn ? "on" : sqzOff ? "off" : "no";

    const prev = prevVal ?? 0;
    let color: SqueezeColor;
    if (v > 0) color = v > prev ? "lime" : "green";
    else color = v < prev ? "red" : "maroon";

    out.push({ time: candles[i].time, momentum: v, state, color });
    prevVal = v;
  }
  return out;
}
