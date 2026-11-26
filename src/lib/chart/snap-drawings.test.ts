import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { drawingPriceLevels, snapToLevels } from "./snap";
import type { Candle } from "@/lib/binance/types";
import type { Drawing } from "@/lib/drawings/types";

function candle(time: number, o: number, h: number, l: number, c: number): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: 1, isFinal: true };
}

const base = { symbol: "BTCUSDT" };

describe("drawingPriceLevels", () => {
  it("returns horizontal lines regardless of time", () => {
    const d: Drawing = { ...base, id: "a", kind: "hline", price: 42 };
    expect(drawingPriceLevels([d], 0)).toEqual([42]);
    expect(drawingPriceLevels([d], 999999)).toEqual([42]);
  });

  it("only exposes a horizontal ray to the right of its anchor", () => {
    const d: Drawing = { ...base, id: "a", kind: "hray", anchor: { time: 100, price: 7 } };
    expect(drawingPriceLevels([d], 50)).toEqual([]);
    expect(drawingPriceLevels([d], 150)).toEqual([7]);
  });

  it("interpolates a trend line inside its segment only", () => {
    const d: Drawing = {
      ...base,
      id: "a",
      kind: "trendline",
      a: { time: 100, price: 10 },
      b: { time: 200, price: 20 },
    };
    expect(drawingPriceLevels([d], 150)).toEqual([15]);
    expect(drawingPriceLevels([d], 250)).toEqual([]);
  });

  it("extends a ray past B but not behind A", () => {
    const d: Drawing = {
      ...base,
      id: "a",
      kind: "ray",
      a: { time: 100, price: 10 },
      b: { time: 200, price: 20 },
    };
    expect(drawingPriceLevels([d], 400)).toEqual([40]);
    expect(drawingPriceLevels([d], 50)).toEqual([]);
  });

  it("gives both rails of a parallel channel", () => {
    const d: Drawing = {
      ...base,
      id: "a",
      kind: "parallel-channel",
      a: { time: 100, price: 10 },
      b: { time: 200, price: 20 },
      c: { time: 100, price: 14 },
    };
    // Base rail at t=150 is 15; C sits 4 above the line, so the second rail is 19.
    expect(drawingPriceLevels([d], 150)).toEqual([15, 19]);
  });

  it("expands every fib retracement level", () => {
    const d: Drawing = {
      ...base,
      id: "a",
      kind: "fib-retracement",
      a: { time: 100, price: 100 },
      b: { time: 200, price: 200 },
      levels: [0, 0.5, 1],
    };
    expect(drawingPriceLevels([d], 150)).toEqual([100, 150, 200]);
  });

  it("projects fib extension levels from C", () => {
    const d: Drawing = {
      ...base,
      id: "a",
      kind: "fib-extension",
      a: { time: 100, price: 100 },
      b: { time: 200, price: 200 },
      c: { time: 300, price: 150 },
      levels: [0, 1, 1.618],
    };
    expect(drawingPriceLevels([d], 350)).toEqual([150, 250, 311.8]);
  });

  it("exposes a position's entry / stop / target", () => {
    const d: Drawing = {
      ...base,
      id: "a",
      kind: "long",
      entry: 100,
      stop: 90,
      target: 130,
      timeA: 1,
      timeB: 2,
    };
    expect(drawingPriceLevels([d], 1.5)).toEqual([100, 90, 130]);
  });

  it("skips the excluded and hidden drawings", () => {
    const a: Drawing = { ...base, id: "a", kind: "hline", price: 1 };
    const b: Drawing = { ...base, id: "b", kind: "hline", price: 2, hidden: true };
    const c: Drawing = { ...base, id: "c", kind: "hline", price: 3 };
    expect(drawingPriceLevels([a, b, c], 0, "a")).toEqual([3]);
  });

  it("ignores kinds with no horizontal level", () => {
    const v: Drawing = { ...base, id: "a", kind: "vline", time: 100 };
    const t: Drawing = {
      ...base,
      id: "b",
      kind: "text",
      anchor: { time: 100, price: 5 },
      text: "hi",
    };
    expect(drawingPriceLevels([v, t], 100)).toEqual([]);
  });
});

describe("snapToLevels", () => {
  const candles = [candle(100, 10, 15, 8, 12)];

  it("falls back to OHLC when there are no drawings", () => {
    expect(snapToLevels(14.6, 100, candles, [])).toBe(15);
  });

  it("prefers a drawing level when it is closer than any OHLC", () => {
    const d: Drawing = { ...base, id: "a", kind: "hline", price: 14.5 };
    expect(snapToLevels(14.6, 100, candles, [d])).toBe(14.5);
  });

  it("keeps the OHLC level when the drawing is further away", () => {
    const d: Drawing = { ...base, id: "a", kind: "hline", price: 20 };
    expect(snapToLevels(14.6, 100, candles, [d])).toBe(15);
  });

  it("still snaps to drawings when there are no candles", () => {
    const d: Drawing = { ...base, id: "a", kind: "hline", price: 33 };
    expect(snapToLevels(30, 100, [], [d])).toBe(33);
  });

  it("returns null with nothing to snap to", () => {
    expect(snapToLevels(30, 100, [], [])).toBeNull();
  });
});

describe("the magnet's reach", () => {
  const candles = [candle(100, 10, 12, 8, 11)];

  /*
   * These are the **weak** magnet, which is what `snapToLevels` does unless a
   * strength is passed. The reach used to be measured from the candle's four
   * *levels*, so it went quiet whenever you aimed anywhere but close to one —
   * which read as broken. It is now measured from the whole high–low span: the
   * column picks the candle, and the span widened by `maxDistance` decides
   * whether it is within reach. Dropping that second gate entirely is the
   * strong magnet, a setting rather than a fix — see `magnet-strength.test.ts`.
   */

  it("lets go when the cursor is nowhere near the bar", () => {
    // The nearest level is the high at 12, a full 8 away — about 16 times
    // this reach. Snapping there would fling the point across the pane.
    expect(snapToLevels(20, 100, candles, [], undefined, 0.5)).toBeNull();
    expect(snapToLevels(-5, 100, candles, [], undefined, 0.5)).toBeNull();
  });

  it("keeps pulling for the reach beyond the span, at either end", () => {
    expect(snapToLevels(12.4, 100, candles, [], undefined, 0.5)).toBe(12);
    expect(snapToLevels(7.6, 100, candles, [], undefined, 0.5)).toBe(8);
  });

  it("grabs anywhere on the candle, including the middle of a long wick", () => {
    // Aiming at the middle of a wick is the obvious place to aim, and it is
    // the furthest point from both of its ends.
    expect(snapToLevels(8.9, 100, candles, [], undefined, 0.5)).toBe(8);
    expect(snapToLevels(11.6, 100, candles, [], undefined, 0.5)).toBe(12);
  });

  it("declines outside the bar's own column", () => {
    // Two bars 100 apart, so each column is 50 wide either side of its
    // centre. This is what keeps the magnet out of the empty space past the
    // last bar, where there is no candle under the cursor at all.
    const two = [candle(100, 10, 12, 8, 11), candle(200, 20, 25, 18, 22)];
    // 21.6 is nearer the close (22) than the open (20) — no tie to settle.
    expect(snapToLevels(21.6, 250, two, [], undefined, 0.5)).toBe(22);
    expect(snapToLevels(21.6, 251, two, [], undefined, 0.5)).toBeNull();
    expect(snapToLevels(21.6, 400, two, [], undefined, 0.5)).toBeNull();
  });

  it("still bounds a drawing's level by the reach", () => {
    const d: Drawing = { ...base, id: "a", kind: "hline", price: 19.8 };
    // Inside the reach and nearer than the candle's high → it wins.
    expect(snapToLevels(20, 100, candles, [d], undefined, 0.5)).toBe(19.8);
    // Outside it → the line is discarded, and the bar is out of reach too, so
    // the magnet declines rather than flinging the point to a distant level.
    expect(snapToLevels(20, 100, candles, [d], undefined, 0.1)).toBeNull();
  });

  it("falls back to the drawings alone when no candle is under the cursor", () => {
    const d: Drawing = { ...base, id: "a", kind: "hline", price: 33 };
    expect(snapToLevels(30, 100, [], [d], undefined, 5)).toBe(33);
    expect(snapToLevels(30, 100, [], [d], undefined, 1)).toBeNull();
  });
});
