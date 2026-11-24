import type { Candle } from "@/lib/binance/types";
import { rsi, type IndicatorPoint } from "./index";

export interface StochRsiPoint {
  time: number;
  k: number;
  d: number;
}

/**
 * Stochastic RSI — a stochastic oscillator run over the **RSI series**, not
 * over price. That distinction is the whole indicator: a plain stochastic asks
 * where price sits in its recent range, this asks where the RSI sits in *its*
 * recent range, which is what makes it react long before RSI itself leaves the
 * 30/70 band.
 *
 * Matches TradingView's built-in (`ta.stoch(rsi1, rsi1, rsi1, lengthStoch)`):
 *
 *   rsi1  = rsi(close, lengthRSI)
 *   stoch = 100 * (rsi1 - lowest(rsi1, lengthStoch)) / (highest - lowest)
 *   K     = sma(stoch, smoothK)
 *   D     = sma(K, smoothD)
 *
 * Defaults 14 / 14 / 3 / 3.
 */
export function stochRsi(
  candles: Candle[],
  rsiLength = 14,
  stochLength = 14,
  smoothK = 3,
  smoothD = 3,
): StochRsiPoint[] {
  const r = rsi(candles, rsiLength);
  if (r.length < stochLength) return [];

  // Raw stochastic of the RSI series.
  const raw: IndicatorPoint[] = [];
  for (let i = stochLength - 1; i < r.length; i++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = i - stochLength + 1; j <= i; j++) {
      const v = r[j].value;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const span = hi - lo;
    // A flat RSI window has no range to place the current value in. Pine's
    // division yields NaN here; 0 would read as "maximum oversold", which is
    // a signal, so carry the previous value instead and only fall back to the
    // midpoint when there is no previous one.
    const value =
      span === 0
        ? (raw[raw.length - 1]?.value ?? 50)
        : (100 * (r[i].value - lo)) / span;
    raw.push({ time: r[i].time, value });
  }

  const k = smoothSeries(raw, smoothK);
  const d = smoothSeries(k, smoothD);

  // D is the shorter series; join on it so every emitted point has both.
  const kByTime = new Map(k.map((p) => [p.time, p.value]));
  const out: StochRsiPoint[] = [];
  for (const p of d) {
    const kv = kByTime.get(p.time);
    if (kv === undefined) continue;
    out.push({ time: p.time, k: clamp01to100(kv), d: clamp01to100(p.value) });
  }
  return out;
}

/**
 * The rolling SMA accumulates error, so a value that is mathematically 0 or
 * 100 comes out as -4.7e-15 or 100.00000000000004. Invisible on a chart, but
 * a `< 0` guard or an alert threshold elsewhere would see a real excursion.
 */
function clamp01to100(n: number): number {
  return n < 0 ? 0 : n > 100 ? 100 : n;
}

/** Rolling SMA over an already-computed series (the primitives in `index.ts`
 *  all take candles and read `.close`, so they can't be reused here). */
function smoothSeries(src: IndicatorPoint[], period: number): IndicatorPoint[] {
  if (period <= 1) return src.slice();
  const out: IndicatorPoint[] = [];
  if (src.length < period) return out;
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i].value;
    if (i >= period) sum -= src[i - period].value;
    if (i >= period - 1) out.push({ time: src[i].time, value: sum / period });
  }
  return out;
}
