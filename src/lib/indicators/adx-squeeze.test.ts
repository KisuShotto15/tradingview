import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { adx } from "./adx";
import { squeezeMomentum } from "./squeeze";
import type { Candle } from "@/lib/binance/types";

/** Build OHLC candles from a close series, with a small symmetric range. */
function ohlc(closes: number[]): Candle[] {
  return closes.map((c, i) => {
    const prev = i === 0 ? c : closes[i - 1];
    return {
      time: i * 60,
      open: prev,
      high: Math.max(prev, c) + 0.5,
      low: Math.min(prev, c) - 0.5,
      close: c,
      volume: 1,
      isFinal: true,
    };
  });
}

const uptrend = ohlc(Array.from({ length: 60 }, (_, i) => 100 + i));

describe("adx", () => {
  it("produces bounded ADX and DI values", () => {
    const out = adx(uptrend, 14);
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) {
      expect(p.adx).toBeGreaterThan(-0.0001);
      expect(p.adx).toBeLessThan(100.0001);
      expect(Number.isFinite(p.plusDI)).toBe(true);
      expect(Number.isFinite(p.minusDI)).toBe(true);
    }
  });

  it("shows +DI dominating in a clean uptrend", () => {
    const out = adx(uptrend, 14);
    const last = out[out.length - 1];
    expect(last.plusDI).toBeGreaterThan(last.minusDI);
  });
});

describe("squeezeMomentum", () => {
  it("returns points with finite momentum and a state", () => {
    const wavy = ohlc(Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 4) * 6));
    const out = squeezeMomentum(wavy, {});
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) {
      expect(Number.isFinite(p.momentum)).toBe(true);
      expect(["on", "off", "none"].includes(p.state)).toBe(true);
    }
  });
});
