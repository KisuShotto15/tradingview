import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { conditionHit, priceLevelFor } from "@/lib/alerts/alert-eval";
import type { Drawing } from "@/lib/drawings/types";

describe("conditionHit", () => {
  it("'crossing' matches either direction", () => {
    expect(conditionHit("crossing", true, false)).toBe(true);
    expect(conditionHit("crossing", false, true)).toBe(true);
    expect(conditionHit("crossing", false, false)).toBe(false);
  });

  it("'crossing-up' matches up only", () => {
    expect(conditionHit("crossing-up", true, false)).toBe(true);
    expect(conditionHit("crossing-up", false, true)).toBe(false);
  });

  it("'crossing-down' matches down only", () => {
    expect(conditionHit("crossing-down", false, true)).toBe(true);
    expect(conditionHit("crossing-down", true, false)).toBe(false);
  });
});

describe("priceLevelFor", () => {
  it("hline returns its price (time-independent)", () => {
    const d = { id: "1", symbol: "X", kind: "hline", price: 42 } as Drawing;
    expect(priceLevelFor(d, null)).toBe(42);
  });

  it("hray returns its anchor price", () => {
    const d = { id: "1", symbol: "X", kind: "hray", anchor: { time: 0, price: 7 } } as Drawing;
    expect(priceLevelFor(d, 100)).toBe(7);
  });

  it("trend line interpolates and extrapolates to nowTime", () => {
    // a=(0,100), b=(10,200) → slope 10/unit time.
    const d = {
      id: "1",
      symbol: "X",
      kind: "trendline",
      a: { time: 0, price: 100 },
      b: { time: 10, price: 200 },
    } as Drawing;
    expect(priceLevelFor(d, 5)).toBeCloseTo(150, 9);
    expect(priceLevelFor(d, 20)).toBeCloseTo(300, 9); // extrapolated past b
  });

  it("trend line needs a nowTime and a non-vertical span", () => {
    const d = {
      id: "1",
      symbol: "X",
      kind: "trendline",
      a: { time: 5, price: 100 },
      b: { time: 5, price: 200 },
    } as Drawing;
    expect(priceLevelFor(d, 10)).toBeNull(); // vertical span
    const ok = {
      id: "1",
      symbol: "X",
      kind: "trendline",
      a: { time: 0, price: 100 },
      b: { time: 10, price: 200 },
    } as Drawing;
    expect(priceLevelFor(ok, null)).toBeNull(); // no nowTime
  });

  it("returns null for non-alertable kinds", () => {
    const d = {
      id: "1",
      symbol: "X",
      kind: "rectangle",
      a: { time: 0, price: 0 },
      b: { time: 1, price: 1 },
    } as Drawing;
    expect(priceLevelFor(d, 5)).toBeNull();
  });
});
