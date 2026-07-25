import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { sma, ema, rsi, macd } from "./index";
import type { Candle } from "@/lib/binance/types";

function candles(closes: number[]): Candle[] {
  return closes.map((c, i) => ({
    time: i,
    open: c,
    high: c,
    low: c,
    close: c,
    volume: 1,
    isFinal: true,
  }));
}

describe("sma", () => {
  it("computes the rolling mean", () => {
    const out = sma(candles([1, 2, 3, 4, 5]), 3);
    expect(out.map((p) => p.value)).toEqual([2, 3, 4]);
  });

  it("returns empty when candles < period", () => {
    expect(sma(candles([1, 2]), 3)).toEqual([]);
  });
});

describe("ema", () => {
  it("seeds with the SMA then applies smoothing", () => {
    const out = ema(candles([1, 2, 3, 4, 5]), 3);
    expect(out).toHaveLength(3);
    expect(out[0].value).toBeCloseTo(2, 9); // SMA(1,2,3)
    expect(out[1].value).toBeCloseTo(3, 9); // 4*0.5 + 2*0.5
    expect(out[2].value).toBeCloseTo(4, 9); // 5*0.5 + 3*0.5
  });
});

describe("rsi", () => {
  it("approaches 100 when every bar gains", () => {
    const out = rsi(candles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]), 14);
    expect(out.at(-1)!.value).toBeGreaterThan(99);
  });

  it("approaches 0 when every bar loses", () => {
    const out = rsi(candles([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]), 14);
    expect(out.at(-1)!.value).toBeLessThan(1);
  });
});

describe("macd", () => {
  it("keeps histogram == macd - signal", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const out = macd(candles(closes), 12, 26, 9);
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) expect(p.histogram).toBeCloseTo(p.macd - p.signal, 9);
  });
});
