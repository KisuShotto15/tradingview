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

const drawingBase = {
  symbol: "BTCUSDT",
  createdAt: 0,
  style: {},
} as unknown as Drawing;

describe("snapToLevels, by strength", () => {
  it("weak lets go once the aim is past the reach", () => {
    expect(snapToLevels(20, 100, bars, [], undefined, REACH, "weak")).toBeNull();
    expect(snapToLevels(-5, 100, bars, [], undefined, REACH, "weak")).toBeNull();
  });

  it("strong pulls from anywhere between the levels, however far", () => {
    // A line 480 units away loses to the bar; a line 2.5 away beats it. Both
    // are far outside the weak reach, and neither is bounded by it — inside
    // the span the answer is simply the nearest candidate there is.
    const far: Drawing = { ...drawingBase, id: "a", kind: "hline", price: 500 };
    expect(snapToLevels(20, 100, bars, [far], undefined, REACH, "strong")).toBe(12);
  });

  it("lets go above the topmost level and below the bottommost, even on strong", () => {
    /*
     * This pinned the opposite until a phone measurement showed what it cost.
     *
     * "Nearest regardless of distance" stops being a pull and becomes a clamp
     * once there is nothing further out: above the bar's high the high stayed
     * the nearest candidate for ever, so a dragged line pinned there and the
     * region above it became unreachable with the magnet on — the line died
     * after three moves while the finger travelled another 77px, and a touch
     * screen has no Ctrl to escape with. Outside the span the strong magnet
     * therefore behaves as the weak one, which is the vertical half of the
     * rule the column gate already applies horizontally.
     */
    expect(snapToLevels(20, 100, bars, [], undefined, REACH, "strong")).toBeNull();
    expect(snapToLevels(-5, 100, bars, [], undefined, REACH, "strong")).toBeNull();
    /*
     * It lets go *at* the level, not a reach beyond it.
     *
     * Holding on for another `maxDistance` and then dropping the point is
     * what the weak magnet does, and on a dragged line it measured as a 53px
     * jump: the line sat on the high for four moves of the finger and then
     * leapt to catch up. Releasing exactly at the outermost level is the only
     * continuous answer — a hair inside, the target is that level; a hair
     * outside, it is the aim, which is the same price.
     */
    expect(snapToLevels(12.3, 100, bars, [], undefined, REACH, "strong")).toBeNull();
    expect(snapToLevels(7.7, 100, bars, [], undefined, REACH, "strong")).toBeNull();
    expect(snapToLevels(12, 100, bars, [], undefined, REACH, "strong")).toBe(12);
  });

  it("never moves the target backwards, or far, as the aim rises", () => {
    // A magnet has to be monotone in the aim, through the release point as
    // much as anywhere else: a target that steps back as the finger goes on
    // rising is the jumping this file already guards against. The step is
    // bounded too — the gaps between a bar's own levels, and nothing wider,
    // which is what rules out holding the point past the top and then
    // dropping it.
    const widestGap = 2; // 8 → 10 → 11 → 12 on this bar
    let prev = -Infinity;
    for (let aim = 6; aim <= 14; aim += 0.05) {
      const got = snapToLevels(aim, 100, bars, [], undefined, REACH, "strong") ?? aim;
      expect(got >= prev - 1e-9).toBe(true);
      if (prev !== -Infinity) expect(got - prev <= widestGap + 1e-9).toBe(true);
      prev = got;
    }
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
    expect(snapToLevels(11.9, 150, bars, [], undefined, REACH, "strong")).toBe(12);
    expect(snapToLevels(11.9, 151, bars, [], undefined, REACH, "strong")).toBeNull();
  });

  it("takes the nearest level in the column, near or far, on strong", () => {
    const far: Drawing = { ...drawingBase, id: "a", kind: "hline", price: 500 };
    const near: Drawing = { ...drawingBase, id: "b", kind: "hline", price: 18 };
    // A line 2.5 away beats the bar's high 3.5 away, even though both are
    // outside the weak reach. Bounding the lines while the candle went
    // unbounded is what let one pixel of movement flip the target between
    // them: the level dropped out of reach and the far bar won instead. The
    // nearest candidate, full stop, is the only rule that moves with the aim.
    expect(snapToLevels(15.5, 100, bars, [near], undefined, REACH, "strong")).toBe(18);
    expect(snapToLevels(15.5, 100, bars, [near, far], undefined, REACH, "strong")).toBe(18);
  });

  it("but outside a bar's column the reach applies on strong too", () => {
    const base = { symbol: "BTCUSDT", createdAt: 0, style: {} } as unknown as Drawing;
    const far: Drawing = { ...base, id: "a", kind: "hline", price: 500 };
    // Past the last bar there is no column to own the aim, so a level far up
    // the pane must not grab a point placed in the empty space to the right.
    expect(snapToLevels(20, 151, bars, [far], undefined, REACH, "strong")).toBeNull();
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
