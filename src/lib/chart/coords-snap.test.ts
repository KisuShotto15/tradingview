import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { timeframeToSeconds } from "./coords";
import { snapToOHLC } from "./snap";
import type { Candle } from "@/lib/binance/types";

describe("timeframeToSeconds", () => {
  it("maps common timeframes", () => {
    expect(timeframeToSeconds("1m")).toBe(60);
    expect(timeframeToSeconds("5m")).toBe(300);
    expect(timeframeToSeconds("1h")).toBe(3600);
    expect(timeframeToSeconds("4h")).toBe(14400);
    expect(timeframeToSeconds("1d")).toBe(86400);
    expect(timeframeToSeconds("1w")).toBe(604800);
    expect(timeframeToSeconds("1M")).toBe(2592000);
  });
});

function candle(time: number, o: number, h: number, l: number, c: number): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: 1, isFinal: true };
}

describe("snapToOHLC", () => {
  const c1 = candle(100, 10, 15, 8, 12);

  it("returns null when there are no candles", () => {
    expect(snapToOHLC(11, 100, [])).toBeNull();
  });

  it("snaps to the nearest OHLC level of the nearest candle", () => {
    expect(snapToOHLC(14.6, 100, [c1])).toBe(15); // near the high
    expect(snapToOHLC(8.2, 100, [c1])).toBe(8); // near the low
  });

  it("picks the candle nearest in time", () => {
    const c2 = candle(200, 20, 25, 18, 22);
    // time 190 → nearest candle is c2 (200); nearest level to 24.5 is 25.
    expect(snapToOHLC(24.5, 190, [c1, c2])).toBe(25);
    // time 105 → nearest candle is c1 (100); nearest level to 12.1 is 12 (close).
    expect(snapToOHLC(12.1, 105, [c1, c2])).toBe(12);
  });
});
