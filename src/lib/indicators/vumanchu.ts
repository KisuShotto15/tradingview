/**
 * VuManChu Cipher B + Divergences (Pine v4 transcription).
 * Original by: dynausmaux / vumanchu, building on LazyBear's WaveTrend Oscillator
 * and RicardoSantos / LucemAnb fractal-based divergence detection.
 *
 * Scope of this port (v1):
 *   ✓ WaveTrend (wt1, wt2, vwap = wt1 - wt2)
 *   ✓ RSI + MFI area  (sma(((close - open) / (high - low)) * mult, period) - posY)
 *   ✓ RSI line
 *   ✓ WT cross / Buy / Sell / Gold signals
 *   ✓ Regular Bullish / Bearish divergences on WT (fractal-based)
 *   ✓ Regular Bullish / Bearish divergences on RSI (fractal-based)
 *   ✗ Sommi flag / diamond (multi-timeframe overlays — skipped)
 *   ✗ Stochastic RSI + divergences (skipped)
 *   ✗ Schaff Trend Cycle (skipped)
 *   ✗ MACD WT colors (skipped)
 */

import type { Candle } from "@/lib/binance/types";
import {
  closeSeries,
  emaSeries,
  hlc3Series,
  smaSeries,
} from "./helpers";

// ─── Config ────────────────────────────────────────────────────────────────

export interface VumanchuConfig {
  // WaveTrend
  wtChannelLen?: number; // 9
  wtAverageLen?: number; // 12
  wtMALen?: number;      // 3
  obLevel?: number;      // 53
  osLevel?: number;      // -53
  osLevel3?: number;     // -75 (gold buy threshold)
  // RSI
  rsiLen?: number;       // 14
  rsiOversold?: number;  // 30
  rsiOverbought?: number;// 60
  // MFI Area
  mfiPeriod?: number;    // 60
  mfiMult?: number;      // 150
  mfiPosY?: number;      // 2.5
  // Divergence levels
  wtDivOBLevel?: number; // 45  — bear div min
  wtDivOSLevel?: number; // -65 — bull div min
  rsiDivOBLevel?: number;// 60
  rsiDivOSLevel?: number;// 30
}

const DEFAULTS: Required<VumanchuConfig> = {
  wtChannelLen: 9,
  wtAverageLen: 12,
  wtMALen: 3,
  obLevel: 53,
  osLevel: -53,
  osLevel3: -75,
  rsiLen: 14,
  rsiOversold: 30,
  rsiOverbought: 60,
  mfiPeriod: 60,
  mfiMult: 150,
  mfiPosY: 2.5,
  wtDivOBLevel: 45,
  wtDivOSLevel: -65,
  rsiDivOBLevel: 60,
  rsiDivOSLevel: 30,
};

// ─── Output types ──────────────────────────────────────────────────────────

export interface VumanchuPoint {
  time: number;
  wt1: number;
  wt2: number;
  vwap: number;
  mfi: number;
  rsi: number;
  cross: boolean;
  crossUp: boolean;
  crossDown: boolean;
  buySignal: boolean;
  sellSignal: boolean;
  goldBuy: boolean;
  wtBullDiv: boolean;
  wtBearDiv: boolean;
  rsiBullDiv: boolean;
  rsiBearDiv: boolean;
}

// ─── Indicator ─────────────────────────────────────────────────────────────

export function vumanchu(candles: Candle[], cfg: VumanchuConfig = {}): VumanchuPoint[] {
  const c = { ...DEFAULTS, ...cfg };
  const n = candles.length;
  if (n < Math.max(c.wtChannelLen + c.wtAverageLen, c.mfiPeriod, c.rsiLen) + 5) return [];

  // ── WaveTrend ────────────────────────────────────────────────────────────
  const src = hlc3Series(candles);
  const esa = emaSeries(src, c.wtChannelLen);
  const absDiff = src.map((v, i) => Math.abs(v - esa[i]));
  const de = emaSeries(absDiff, c.wtChannelLen);
  const ci = src.map((v, i) => {
    if (isNaN(de[i]) || de[i] === 0) return NaN;
    return (v - esa[i]) / (0.015 * de[i]);
  });
  const wt1 = emaSeries(safe(ci), c.wtAverageLen);
  const wt2 = smaSeries(wt1, c.wtMALen);
  const vwap = wt1.map((v, i) => v - wt2[i]);

  // ── MFI Area ─────────────────────────────────────────────────────────────
  const mfiRaw = candles.map((bar) => {
    const range = bar.high - bar.low;
    if (range === 0) return 0;
    return ((bar.close - bar.open) / range) * c.mfiMult;
  });
  const mfiSmoothed = smaSeries(mfiRaw, c.mfiPeriod).map((v) => v - c.mfiPosY);

  // ── RSI (Wilder) ─────────────────────────────────────────────────────────
  const close = closeSeries(candles);
  const rsi = computeRSI(close, c.rsiLen);

  // ── Cross detection ──────────────────────────────────────────────────────
  // Pine: wtCross = cross(wt1, wt2); wtCrossUp = wt2 - wt1 <= 0
  const cross = new Array<boolean>(n).fill(false);
  const crossUp = new Array<boolean>(n).fill(false);
  const crossDown = new Array<boolean>(n).fill(false);
  for (let i = 1; i < n; i++) {
    const prevDiff = wt1[i - 1] - wt2[i - 1];
    const currDiff = wt1[i] - wt2[i];
    if (isNaN(prevDiff) || isNaN(currDiff)) continue;
    const crossed = Math.sign(prevDiff) !== Math.sign(currDiff) && prevDiff !== 0;
    cross[i] = crossed;
    if (crossed) {
      crossUp[i] = currDiff >= 0;
      crossDown[i] = currDiff <= 0;
    }
  }

  // ── Divergences via fractals ─────────────────────────────────────────────
  const wtDivs = findDivergences(wt2, candles, true, c.wtDivOBLevel, c.wtDivOSLevel);
  const rsiDivs = findDivergences(rsi, candles, true, c.rsiDivOBLevel, c.rsiDivOSLevel);

  // ── Gold buy signal ──────────────────────────────────────────────────────
  // (wtBullDiv OR rsiBullDiv) AND wtLowPrev <= osLevel3 AND wt2 > osLevel3
  // AND (wtLowPrev - wt2 <= -5) AND lastRsi < 30
  const goldBuy = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    const hasDiv = wtDivs.bull[i] || rsiDivs.bull[i];
    if (!hasDiv) continue;
    const wtLowPrev = wtDivs.lowPrev[i];
    const lastRsi = wtDivs.lastRsi[i] ?? rsi[i - 2] ?? NaN;
    if (wtLowPrev === undefined) continue;
    if (wtLowPrev <= c.osLevel3 && wt2[i] > c.osLevel3 && wtLowPrev - wt2[i] <= -5 && lastRsi < 30) {
      goldBuy[i] = true;
    }
  }

  // ── Buy / Sell signals ───────────────────────────────────────────────────
  const buySignal = new Array<boolean>(n).fill(false);
  const sellSignal = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (isNaN(wt2[i])) continue;
    const oversold = wt2[i] <= c.osLevel;
    const overbought = wt2[i] >= c.obLevel;
    buySignal[i] = cross[i] && crossUp[i] && oversold;
    sellSignal[i] = cross[i] && crossDown[i] && overbought;
  }

  // ── Assemble ─────────────────────────────────────────────────────────────
  const out: VumanchuPoint[] = [];
  for (let i = 0; i < n; i++) {
    if (isNaN(wt1[i]) || isNaN(wt2[i])) continue;
    out.push({
      time: candles[i].time,
      wt1: wt1[i],
      wt2: wt2[i],
      vwap: vwap[i],
      mfi: isNaN(mfiSmoothed[i]) ? 0 : mfiSmoothed[i],
      rsi: isNaN(rsi[i]) ? 50 : rsi[i],
      cross: cross[i],
      crossUp: crossUp[i],
      crossDown: crossDown[i],
      buySignal: buySignal[i],
      sellSignal: sellSignal[i],
      goldBuy: goldBuy[i],
      wtBullDiv: wtDivs.bull[i],
      wtBearDiv: wtDivs.bear[i],
      rsiBullDiv: rsiDivs.bull[i],
      rsiBearDiv: rsiDivs.bear[i],
    });
  }
  return out;
}

// ─── Internal helpers ──────────────────────────────────────────────────────

/** Replace NaN with 0 so EMA seeding doesn't trip on warm-up holes. */
function safe(arr: number[]): number[] {
  return arr.map((v) => (isNaN(v) ? 0 : v));
}

/** Wilder RSI matching Pine's rsi(). */
function computeRSI(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/**
 * VuManchu's divergence detection. We mimic the Pine logic but expose it
 * directly as boolean arrays aligned to candle index.
 *
 * Fractal: a top fractal forms 2 bars ago when src[bar-4] < src[bar-2] AND
 * src[bar-3] < src[bar-2] AND src[bar-2] > src[bar-1] AND src[bar-2] > src[bar]
 * (5-bar pattern, confirmed 2 bars later).
 *
 * For each new fractal we compare against the previous one of the same type:
 *   - Bear regular div: price made higher high but oscillator made lower high
 *   - Bull regular div: price made lower low  but oscillator made higher low
 */
interface DivResult {
  bull: boolean[];
  bear: boolean[];
  /** Value of the previous oscillator pivot low at each bar — used for gold buy. */
  lowPrev: (number | undefined)[];
  /** RSI value at the previous bottom fractal — used for gold buy. */
  lastRsi: (number | undefined)[];
}

function findDivergences(
  src: number[],
  candles: Candle[],
  useLimits: boolean,
  topLimit: number,
  botLimit: number,
): DivResult {
  const n = src.length;
  const bull = new Array<boolean>(n).fill(false);
  const bear = new Array<boolean>(n).fill(false);
  const lowPrev = new Array<number | undefined>(n).fill(undefined);
  const lastRsi = new Array<number | undefined>(n).fill(undefined);

  let prevTopOsc: number | undefined;
  let prevTopPrice: number | undefined;
  let prevBotOsc: number | undefined;
  let prevBotPrice: number | undefined;
  let prevBotBar: number | undefined;
  void prevBotBar;

  for (let i = 4; i < n; i++) {
    // Fractal at bar (i - 2): src[i-4] < src[i-2], src[i-3] < src[i-2], src[i-2] > src[i-1], src[i-2] > src[i]
    const f = i - 2;
    if (isNaN(src[f]) || isNaN(src[f - 2]) || isNaN(src[f - 1]) || isNaN(src[f + 1]) || isNaN(src[f + 2])) continue;
    const isTop = src[f - 2] < src[f] && src[f - 1] < src[f] && src[f] > src[f + 1] && src[f] > src[f + 2];
    const isBot = src[f - 2] > src[f] && src[f - 1] > src[f] && src[f] < src[f + 1] && src[f] < src[f + 2];

    if (isTop && (!useLimits || src[f] >= topLimit)) {
      const oscVal = src[f];
      const priceVal = candles[f].high;
      if (prevTopOsc !== undefined && prevTopPrice !== undefined) {
        if (priceVal > prevTopPrice && oscVal < prevTopOsc) bear[i] = true;
      }
      prevTopOsc = oscVal;
      prevTopPrice = priceVal;
    }

    if (isBot && (!useLimits || src[f] <= botLimit)) {
      const oscVal = src[f];
      const priceVal = candles[f].low;
      if (prevBotOsc !== undefined && prevBotPrice !== undefined) {
        if (priceVal < prevBotPrice && oscVal > prevBotOsc) bull[i] = true;
      }
      lowPrev[i] = prevBotOsc;
      lastRsi[i] = undefined; // populated separately if needed via candle index
      prevBotOsc = oscVal;
      prevBotPrice = priceVal;
      prevBotBar = f;
    }
  }
  return { bull, bear, lowPrev, lastRsi };
}
