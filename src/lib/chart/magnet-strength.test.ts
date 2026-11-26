import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { magnetFor } from "./magnet";
import { snapToLevels } from "./snap";
import { useChartStore } from "@/lib/store/chart-store";
import type { Candle } from "@/lib/binance/types";
import type { Drawing } from "@/lib/drawings/types";

/**
 * The two magnets, in TradingView's own terms.
 *
 * "Strong Magnet pulls the drawing points to chart values (bars), regardless
 * of the distance between the points and chart values." / "Weak Magnet pulls
 * the drawing points to chart values (bars) when you are drawing near them."
 *
 * This repo spent three rounds shipping one hybrid of the two and hearing,
 * correctly, that it was wrong: a weak magnet reads as dead to someone who
 * wanted strong, and a strong one reads as a teleport to someone who wanted
 * weak. The setting is the fix; these cases pin both halves of it.
 */

function candle(time: number, o: number, h: number, l: number, c: number): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: 1, isFinal: true };
}

// A bar 4 units tall, with 1000 units of empty pane above it.
const bars = [candle(0, 10, 12, 8, 11), candle(100, 10, 12, 8, 11)];
const REACH = 0.5;

describe("snapToLevels, by strength", () => {
  it("weak lets go once the aim is past the reach", () => {
    expect(snapToLevels(20, 100, bars, [], undefined, REACH, "weak")).toBeNull();
    expect(snapToLevels(-5, 100, bars, [], undefined, REACH, "weak")).toBeNull();
  });

  it("strong pulls from anywhere in the bar's column", () => {
    // Eight units above the high, sixteen times the reach — and it still lands
    // on the high. That is the behaviour, not a bug: a point placed with the
    // strong magnet is always on an OHLC value.
    expect(snapToLevels(20, 100, bars, [], undefined, REACH, "strong")).toBe(12);
    expect(snapToLevels(-5, 100, bars, [], undefined, REACH, "strong")).toBe(8);
  });

  it("both agree when the aim is on the bar", () => {
    for (const s of ["weak", "strong"] as const) {
      expect(snapToLevels(11.9, 100, bars, [], undefined, REACH, s)).toBe(12);
      expect(snapToLevels(8.1, 100, bars, [], undefined, REACH, s)).toBe(8);
    }
  });

  it("defaults to weak, so a caller that forgets cannot teleport a point", () => {
    expect(snapToLevels(20, 100, bars, [], undefined, REACH)).toBeNull();
  });

  it("strong still respects the column: past the last bar there is no candle", () => {
    // Half a bar past the last bar's centre is still its column; beyond that
    // the cursor must move freely or a drawing could never be placed in the
    // empty space to the right of the series.
    expect(snapToLevels(20, 150, bars, [], undefined, REACH, "strong")).toBe(12);
    expect(snapToLevels(20, 151, bars, [], undefined, REACH, "strong")).toBeNull();
  });

  it("keeps the drawings' levels bounded even on strong", () => {
    const base = {
      symbol: "BTCUSDT",
      createdAt: 0,
      style: {},
    } as unknown as Drawing;
    const far: Drawing = { ...base, id: "a", kind: "hline", price: 500 };
    // "Regardless of the distance" is answerable for a candle, which owns the
    // column under the cursor. For a line at any price on the pane it would
    // mean dragging the point to whichever one happened to be nearest, so the
    // bar wins here rather than the line 480 units away.
    expect(snapToLevels(20, 100, bars, [far], undefined, REACH, "strong")).toBe(12);
  });
});

describe("magnetFor — the modifier inverts the setting", () => {
  function set(magnetMode: boolean, magnetStrength: "weak" | "strong") {
    useChartStore.setState({ magnetMode, magnetStrength });
  }

  it("off, no key: nothing snaps", () => {
    set(false, "weak");
    expect(magnetFor({}).on).toBe(false);
  });

  it("off, Ctrl held: the strong magnet, whatever the saved strength", () => {
    // "You can temporarily turn the strong magnet feature on by [...] holding
    // CTRL/Command" — it is always the strong one the key summons.
    set(false, "weak");
    expect(magnetFor({ ctrlKey: true })).toEqual({ on: true, strength: "strong" });
    expect(magnetFor({ metaKey: true })).toEqual({ on: true, strength: "strong" });
  });

  it("on: the saved strength applies", () => {
    set(true, "weak");
    expect(magnetFor({})).toEqual({ on: true, strength: "weak" });
    set(true, "strong");
    expect(magnetFor({})).toEqual({ on: true, strength: "strong" });
  });

  it("on, Ctrl held: the magnet is off for that gesture", () => {
    // "If the magnet mode is on you can temporarily turn it off by holding
    // CTRL/Command." The old `ctrlKey || magnetMode` could not express this,
    // so there was no way to place one free point without visiting the
    // toolbar.
    set(true, "strong");
    expect(magnetFor({ ctrlKey: true }).on).toBe(false);
    expect(magnetFor({ metaKey: true }).on).toBe(false);
  });

  it("treats a missing event as no modifier", () => {
    set(true, "strong");
    expect(magnetFor().on).toBe(true);
    set(false, "strong");
    expect(magnetFor(null).on).toBe(false);
  });
});
