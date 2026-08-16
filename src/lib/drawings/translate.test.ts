import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { translateDrawing } from "./translate";
import type { Drawing } from "./types";

const base = { id: "d1", symbol: "BTCUSDT" };

describe("translateDrawing", () => {
  it("moves both anchors of a two-point shape, preserving its shape", () => {
    const d: Drawing = {
      ...base,
      kind: "trendline",
      a: { time: 100, price: 10 },
      b: { time: 200, price: 20 },
    };
    const moved = translateDrawing(d, 50, 5);
    if (moved.kind !== "trendline") throw new Error("kind changed");
    expect(moved.a).toEqual({ time: 150, price: 15 });
    expect(moved.b).toEqual({ time: 250, price: 25 });
  });

  it("ignores the axis a shape is unbounded on", () => {
    const h = translateDrawing({ ...base, kind: "hline", price: 10 }, 50, 5);
    if (h.kind !== "hline") throw new Error("kind changed");
    expect(h.price).toBe(15);

    const v = translateDrawing({ ...base, kind: "vline", time: 100 }, 50, 5);
    if (v.kind !== "vline") throw new Error("kind changed");
    expect(v.time).toBe(150);
  });

  it("moves every level of a position drawing together", () => {
    const d: Drawing = {
      ...base,
      kind: "long",
      entry: 100,
      stop: 90,
      target: 120,
      timeA: 10,
      timeB: 20,
    };
    const moved = translateDrawing(d, 5, -3);
    if (moved.kind !== "long") throw new Error("kind changed");
    expect(moved.entry).toBe(97);
    expect(moved.stop).toBe(87);
    expect(moved.target).toBe(117);
    expect(moved.timeA).toBe(15);
    expect(moved.timeB).toBe(25);
  });

  it("drops cached bar indices on a brush so it doesn't snap back", () => {
    const d: Drawing = {
      ...base,
      kind: "brush",
      points: [
        { time: 1, price: 1 },
        { time: 2, price: 2 },
      ],
      logicals: [0, 1],
    };
    const moved = translateDrawing(d, 10, 1);
    if (moved.kind !== "brush") throw new Error("kind changed");
    expect(moved.points).toEqual([
      { time: 11, price: 2 },
      { time: 12, price: 3 },
    ]);
    expect(moved.logicals).toBe(undefined);
  });

  it("leaves the original untouched", () => {
    const d: Drawing = {
      ...base,
      kind: "rectangle",
      a: { time: 1, price: 1 },
      b: { time: 2, price: 2 },
    };
    translateDrawing(d, 10, 10);
    expect(d.a).toEqual({ time: 1, price: 1 });
  });
});
