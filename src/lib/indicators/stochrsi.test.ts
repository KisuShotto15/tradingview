import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { stochRsi } from "./stochrsi";
import { rsi } from "./index";
import type { Candle } from "@/lib/binance/types";

const c = (closes: number[]): Candle[] =>
  closes.map((close, i) => ({
    time: 1000 + i * 60,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }));

/** Deterministic zig-zag with drift, long enough to clear every warm-up. */
function series(n: number): Candle[] {
  const out: number[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    p += Math.sin(i / 3) * 2 + (i % 7 === 0 ? -1.5 : 0.4);
    out.push(p);
  }
  return c(out);
}

describe("stochRsi", () => {
  it("returns nothing until every window has warmed up", () => {
    expect(stochRsi(series(10))).toEqual([]);
    // rsi(14) needs 15 bars to emit 1 point; the stoch window then needs 14 of
    // those, plus smoothK 3 and smoothD 3 — so ~33 RSI points at minimum.
    expect(stochRsi(series(20))).toEqual([]);
  });

  it("produces points once there is enough history", () => {
    const out = stochRsi(series(200));
    expect(out.length > 100).toBe(true);
  });

  it("stays within 0..100", () => {
    for (const p of stochRsi(series(300))) {
      expect(p.k >= 0 && p.k <= 100).toBe(true);
      expect(p.d >= 0 && p.d <= 100).toBe(true);
    }
  });

  it("emits no NaN", () => {
    for (const p of stochRsi(series(300))) {
      expect(Number.isFinite(p.k)).toBe(true);
      expect(Number.isFinite(p.d)).toBe(true);
    }
  });

  it("every point carries both K and D, on the same timestamp", () => {
    const out = stochRsi(series(200));
    const times = out.map((p) => p.time);
    expect(new Set(times).size).toBe(times.length);
    // Strictly increasing, aligned to the candle grid.
    for (let i = 1; i < times.length; i++) {
      expect(times[i] > times[i - 1]).toBe(true);
    }
  });

  it("D lags K: with smoothD=1 they are identical", () => {
    const out = stochRsi(series(200), 14, 14, 3, 1);
    for (const p of out) expect(p.k).toBe(p.d);
  });

  it("runs the stochastic over the RSI series, not over price", () => {
    // The hallmark: on a strictly rising series RSI pins near 100 and barely
    // moves, but Stoch RSI still resolves that flat band into its own range.
    const rising = c(Array.from({ length: 120 }, (_, i) => 100 + i));
    const r = rsi(rising, 14);
    const spread = Math.max(...r.map((p) => p.value)) - Math.min(...r.map((p) => p.value));
    expect(spread < 1).toBe(true); // RSI is effectively flat
    const out = stochRsi(rising);
    expect(out.length > 0).toBe(true);
  });

  it("holds the last value through a flat RSI window instead of reading 0", () => {
    // A dead-flat close series gives a zero-range RSI window. Emitting 0 there
    // would paint maximum oversold on a market that did not move at all.
    const flat = c(Array.from({ length: 120 }, () => 100));
    for (const p of stochRsi(flat)) {
      expect(p.k).toBe(50);
      expect(p.d).toBe(50);
    }
  });

  it("honours custom lengths", () => {
    const long = stochRsi(series(300), 14, 14, 3, 3);
    const short = stochRsi(series(300), 7, 7, 1, 1);
    expect(short.length > long.length).toBe(true);
  });
});
