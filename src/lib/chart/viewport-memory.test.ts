import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import {
  captureViewport,
  restoreViewport,
  sameCandles,
} from "./viewport-memory";

/** 100 bars one minute apart, starting at 1000. */
const times = Array.from({ length: 100 }, (_, i) => 1000 + i * 60);

describe("captureViewport", () => {
  it("records the zoom as a bar count and the left edge as a timestamp", () => {
    const v = captureViewport({ from: 20, to: 70 }, times);
    expect(v).toEqual({ span: 50, fromTime: times[20], rightOffset: 70 - 99 });
  });

  it("records the gap past the last bar when parked at the right edge", () => {
    const v = captureViewport({ from: 95, to: 105 }, times);
    expect(v!.rightOffset).toBe(6);
    expect(v!.fromTime).toBe(times[95]);
  });

  it("has no left-edge timestamp when the whole window sits past the data", () => {
    const v = captureViewport({ from: 120, to: 140 }, times);
    expect(v!.fromTime).toBe(null);
  });

  it("returns null for a degenerate or absent range", () => {
    expect(captureViewport(null, times)).toBe(null);
    expect(captureViewport({ from: 5, to: 5 }, times)).toBe(null);
    expect(captureViewport({ from: 0, to: 10 }, [])).toBe(null);
  });
});

describe("restoreViewport", () => {
  it("round-trips a window over history unchanged", () => {
    const v = captureViewport({ from: 20, to: 70 }, times);
    expect(restoreViewport(v, times)).toEqual({ from: 20, to: 70 });
  });

  it("keeps the same bars when the array has grown on the right", () => {
    // The refetch that used to move the chart: five new candles arrive while
    // the user is looking at older ones.
    const v = captureViewport({ from: 20, to: 70 }, times);
    const grown = [...times, ...[1, 2, 3, 4, 5].map((n) => 1000 + (99 + n) * 60)];
    expect(restoreViewport(v, grown)).toEqual({ from: 20, to: 70 });
  });

  it("keeps the same bars when older history is dropped from the left", () => {
    const v = captureViewport({ from: 20, to: 70 }, times);
    const trimmed = times.slice(10);
    // Those same candles are now ten indices lower.
    expect(restoreViewport(v, trimmed)).toEqual({ from: 10, to: 60 });
  });

  it("reproduces the right-edge gap when the left edge is past the data", () => {
    const v = captureViewport({ from: 120, to: 140 }, times);
    const grown = [...times, 1000 + 100 * 60, 1000 + 101 * 60];
    // rightOffset was 140 - 99 = 41, so 'to' lands 41 bars past the new last.
    expect(restoreViewport(v, grown)).toEqual({ from: 122, to: 142 });
  });

  it("gives up rather than guessing", () => {
    expect(restoreViewport(null, times)).toBe(null);
    expect(restoreViewport({ span: 0, fromTime: 1000, rightOffset: 0 }, times)).toBe(null);
    expect(restoreViewport({ span: 10, fromTime: 1000, rightOffset: 0 }, [])).toBe(null);
    expect(
      restoreViewport({ span: NaN, fromTime: 1000, rightOffset: 0 }, times),
    ).toBe(null);
  });
});

describe("sameCandles", () => {
  const c = (time: number, close: number) => ({ time, close });

  it("is true for an identical array", () => {
    const a = [c(1, 10), c(2, 11), c(3, 12)];
    expect(sameCandles(a, [c(1, 10), c(2, 11), c(3, 12)])).toBe(true);
  });

  it("is false when the live bar's close moved", () => {
    expect(sameCandles([c(1, 10), c(2, 11)], [c(1, 10), c(2, 12)])).toBe(false);
  });

  it("is false when a bar was added or the window slid", () => {
    expect(sameCandles([c(1, 10), c(2, 11)], [c(1, 10), c(2, 11), c(3, 12)])).toBe(false);
    expect(sameCandles([c(1, 10), c(2, 11)], [c(2, 11), c(3, 12)])).toBe(false);
  });

  it("is false for empty input, so a first load always applies", () => {
    expect(sameCandles([], [])).toBe(false);
  });
});
