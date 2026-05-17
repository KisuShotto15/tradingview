/**
 * ADX (Average Directional Index) — Wilder's classic.
 *
 *   TR  = max(high-low, |high-prevClose|, |low-prevClose|)
 *   +DM = (high-prevHigh) when greater than (prevLow-low) and > 0, else 0
 *   -DM = (prevLow-low)  when greater than (high-prevHigh) and > 0, else 0
 *
 *   Wilder-smoothed (RMA) over `period` bars:
 *     +DI = 100 * RMA(+DM) / RMA(TR)
 *     -DI = 100 * RMA(-DM) / RMA(TR)
 *     DX  = 100 * |+DI - -DI| / (+DI + -DI)
 *     ADX = RMA(DX, period)
 */

import type { Candle } from "@/lib/binance/types";
import { rmaSeries, trueRangeSeries } from "./helpers";

export interface ADXPoint {
  time: number;
  adx: number;
  plusDI: number;
  minusDI: number;
}

export function adx(candles: Candle[], period = 14): ADXPoint[] {
  if (candles.length < period * 2 + 1) return [];

  const tr = trueRangeSeries(candles);
  const plusDM = new Array<number>(candles.length).fill(0);
  const minusDM = new Array<number>(candles.length).fill(0);

  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
  }

  const smTR = rmaSeries(tr, period);
  const smPlus = rmaSeries(plusDM, period);
  const smMinus = rmaSeries(minusDM, period);

  // Compute +DI, -DI, DX per bar
  const plusDI = new Array<number>(candles.length).fill(NaN);
  const minusDI = new Array<number>(candles.length).fill(NaN);
  const dx = new Array<number>(candles.length).fill(NaN);
  for (let i = 0; i < candles.length; i++) {
    if (isNaN(smTR[i]) || smTR[i] === 0) continue;
    plusDI[i] = (100 * smPlus[i]) / smTR[i];
    minusDI[i] = (100 * smMinus[i]) / smTR[i];
    const sum = plusDI[i] + minusDI[i];
    if (sum > 0) dx[i] = (100 * Math.abs(plusDI[i] - minusDI[i])) / sum;
  }

  const adxArr = rmaSeries(dx.map((v) => (isNaN(v) ? 0 : v)), period);
  // Mask out warm-up: ADX is only valid once both the inner RMA and outer RMA have data.
  // First ADX value lands at bar (2 * period - 1) approximately.
  const firstValid = 2 * period - 1;

  const out: ADXPoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < firstValid) continue;
    if (isNaN(adxArr[i]) || isNaN(plusDI[i]) || isNaN(minusDI[i])) continue;
    out.push({
      time: candles[i].time,
      adx: adxArr[i],
      plusDI: plusDI[i],
      minusDI: minusDI[i],
    });
  }
  return out;
}
