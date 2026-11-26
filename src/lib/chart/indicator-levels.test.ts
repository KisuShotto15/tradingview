import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import {
  indicatorLevelsAt,
  registerIndicatorLevels,
  valueAtTime,
} from "./indicator-levels";
import { snapToLevels } from "./snap";
import type { Candle } from "@/lib/binance/types";

/**
 * "Snap to indicators" — TradingView added it to the magnet in March 2025, so
 * a line can be drawn off an EMA or a VWAP band as precisely as off a wick.
 */

function candle(time: number, o: number, h: number, l: number, c: number): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: 1, isFinal: true };
}

const line = [
  { time: 0, value: 100 },
  { time: 60, value: 101 },
  { time: 120, value: 102 },
  { time: 180, value: 103 },
];

describe("valueAtTime", () => {
  it("finds a point by time", () => {
    expect(valueAtTime(line, 0)).toBe(100);
    expect(valueAtTime(line, 120)).toBe(102);
    expect(valueAtTime(line, 180)).toBe(103);
  });

  it("answers nothing between points, rather than interpolating", () => {
    // These arrays are computed per candle, so a time that is not one of them
    // is off the end of the study — an EMA has no value for its first
    // `period` bars. Inventing one would snap a point to a line that is not
    // drawn there.
    expect(valueAtTime(line, 90)).toBeNull();
    expect(valueAtTime(line, -60)).toBeNull();
    expect(valueAtTime(line, 240)).toBeNull();
    expect(valueAtTime([], 0)).toBeNull();
  });

  it("skips a point the study could not compute", () => {
    expect(valueAtTime([{ time: 0, value: NaN }], 0)).toBeNull();
  });
});

describe("the registry", () => {
  it("answers with nothing while no chart is live", () => {
    registerIndicatorLevels(null);
    expect(indicatorLevelsAt(120)).toEqual([]);
  });

  it("hands back whatever the focused chart publishes", () => {
    registerIndicatorLevels((t) => (t === 120 ? [102, 99.5] : []));
    expect(indicatorLevelsAt(120)).toEqual([102, 99.5]);
    expect(indicatorLevelsAt(60)).toEqual([]);
    registerIndicatorLevels(null);
  });
});

describe("snapToLevels with indicator levels", () => {
  const bars = [candle(60, 10, 12, 8, 11), candle(120, 10, 12, 8, 11)];

  it("snaps to an indicator line when it is the nearest candidate", () => {
    // 12.4 is 0.4 from the bar's high and 0.1 from the EMA at 12.5.
    expect(snapToLevels(12.4, 120, bars, [], undefined, 1, "weak", [12.5])).toBe(12.5);
  });

  it("still prefers the candle when the candle is nearer", () => {
    expect(snapToLevels(11.9, 120, bars, [], undefined, 1, "weak", [12.5])).toBe(12);
  });

  it("keeps the reach around an indicator line on weak, not on strong", () => {
    // Weak: a line 40 away is not something the cursor was aiming at.
    expect(snapToLevels(60, 120, bars, [], undefined, 1, "weak", [52])).toBeNull();
    // Strong, inside the bar's column: the nearest candidate wins outright,
    // so the bar keeps a cursor at 12.4 and the line takes one at 60. Any
    // rule that bounds one candidate and not the other makes the target jump
    // between them as the cursor crosses the reach.
    expect(snapToLevels(12.4, 120, bars, [], undefined, 1, "strong", [52])).toBe(12);
    expect(snapToLevels(60, 120, bars, [], undefined, 1, "strong", [52])).toBe(52);
  });

  it("can snap where there is no bar at all", () => {
    // Past the end of the series the candle declines, but an indicator that
    // reaches there is still a legitimate target.
    expect(snapToLevels(12.4, 400, [], [], undefined, 1, "weak", [12.5])).toBe(12.5);
  });
});
