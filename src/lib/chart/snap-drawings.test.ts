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

describe("snap radius", () => {
  const candles = [candle(100, 10, 12, 8, 11)];

  it("snaps when the level is inside the radius", () => {
    // 11.9 is 0.1 from the high (12); radius 0.5 covers it.
    expect(snapToLevels(11.9, 100, candles, [], undefined, 0.5)).toBe(12);
  });

  it("leaves the price alone when every level is outside the radius", () => {
    // The nearest level is the high at 12, a full 8 away — a magnet that
    // fires here is a teleport, which is what dragging an endpoint used to do.
    expect(snapToLevels(20, 100, candles, [], undefined, 0.5)).toBe(null);
  });

  it("measures the radius against the chosen candidate, drawings included", () => {
    const d: Drawing = { ...base, id: "a", kind: "hline", price: 19.8 };
    // The hline at 19.8 is nearer than the candle's high, and inside radius.
    expect(snapToLevels(20, 100, candles, [d], undefined, 0.5)).toBe(19.8);
    // Same level, tighter radius → nothing snaps, rather than falling back to
    // the far-away OHLC.
    expect(snapToLevels(20, 100, candles, [d], undefined, 0.1)).toBe(null);
  });

  it("stays unbounded when no radius is given", () => {
    expect(snapToLevels(20, 100, candles, [])).toBe(12);
  });

  it("grabs anywhere on the candle, including the middle of a long wick", () => {
    // The bug this covers: aiming at the middle of a wick is the obvious
    // place to aim, and it is the furthest point from both of its ends. A
    // reach measured from the levels found nothing there and the magnet
    // looked dead. The candle below runs 8..12 with the body at 10..11, so
    // 8.9 is a full 0.9 from the nearest level with a reach of only 0.5.
    expect(snapToLevels(8.9, 100, [candle(100, 10, 12, 8, 11)], [], undefined, 0.5)).toBe(8);
    expect(snapToLevels(11.6, 100, [candle(100, 10, 12, 8, 11)], [], undefined, 0.5)).toBe(12);
  });

  it("still declines once the cursor is off the candle", () => {
    // Which is what stops a dragged point being flung across the pane.
    expect(snapToLevels(7.4, 100, [candle(100, 10, 12, 8, 11)], [], undefined, 0.5)).toBe(null);
    expect(snapToLevels(12.6, 100, [candle(100, 10, 12, 8, 11)], [], undefined, 0.5)).toBe(null);
  });
});
