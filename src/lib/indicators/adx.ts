/**
 * ADX (Average Directional Index) — Pine-faithful transcription of
 * DMI/ADX/KEYLEVEL by LazyBear style.
 *
 *   up   = change(high)
 *   down = -change(low)
 *   truerange = rma(tr, diLen)
 *   +DI  = fixnan(100 * rma(up > down && up > 0 ? up : 0, diLen) / truerange)
 *   -DI  = fixnan(100 * rma(down > up && down > 0 ? down : 0, diLen) / truerange)
 *   ADX  = 100 * rma(|+DI - -DI| / (+DI + -DI || 1), adxLen)
 */

import type { Candle } from "@/lib/binance/types";
import { rmaSeries, trueRangeSeries } from "./helpers";

export interface ADXConfig {
  diLen?: number;
  adxLen?: number;
}

export interface ADXPoint {
  time: number;
  adx: number;
  plusDI: number;
  minusDI: number;
}

export function adx(candles: Candle[], cfg: ADXConfig | number = {}): ADXPoint[] {
  // Backwards-compat: accept plain number as adxLen
  const diLen = typeof cfg === "number" ? cfg : (cfg.diLen ?? 14);
  const adxLen = typeof cfg === "number" ? cfg : (cfg.adxLen ?? 14);

  const warmup = diLen + adxLen;
  if (candles.length < warmup + 1) return [];

  const tr = trueRangeSeries(candles);
  const plusDM = new Array<number>(candles.length).fill(0);
  const minusDM = new Array<number>(candles.length).fill(0);

  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
  }

  const smTR = rmaSeries(tr, diLen);
  const smPlus = rmaSeries(plusDM, diLen);
  const smMinus = rmaSeries(minusDM, diLen);

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

  const adxArr = rmaSeries(dx.map((v) => (isNaN(v) ? 0 : v)), adxLen);
  const firstValid = diLen + adxLen - 1;

  const out: ADXPoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < firstValid) continue;
    if (isNaN(adxArr[i]) || isNaN(plusDI[i]) || isNaN(minusDI[i])) continue;
    out.push({ time: candles[i].time, adx: adxArr[i], plusDI: plusDI[i], minusDI: minusDI[i] });
  }
  return out;
}
