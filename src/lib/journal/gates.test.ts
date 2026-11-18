import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { normalizeGates, tradingBlocked, blockReasons } from "./gates";
import type { JournalStatus } from "./client";

const st = (partial: Partial<JournalStatus>): JournalStatus =>
  ({ lock: null, ...partial }) as JournalStatus;

describe("normalizeGates", () => {
  it("reads the object form", () => {
    const g = normalizeGates(
      st({ gates: { daily_loss: { ok: false, reason: "-3.2% today" } } }),
    );
    expect(g).toEqual([
      { key: "daily_loss", label: "Daily Loss", ok: false, reason: "-3.2% today" },
    ]);
  });

  it("reads the bare-boolean form the gateway also sends", () => {
    const g = normalizeGates(st({ gates: { window: true } }));
    expect(g).toEqual([{ key: "window", label: "Window", ok: true }]);
  });

  it("puts blocking gates first, then sorts by label", () => {
    const g = normalizeGates(
      st({
        gates: {
          window: true,
          cooldown: { ok: false },
          alpha: true,
          max_trades: { ok: false },
        },
      }),
    );
    expect(g.map((x) => x.key)).toEqual([
      "cooldown",
      "max_trades",
      "alpha",
      "window",
    ]);
  });

  it("skips summary keys that aren't rules", () => {
    const g = normalizeGates(st({ gates: { ok: true, window: true } }));
    expect(g.map((x) => x.key)).toEqual(["window"]);
  });

  it("ignores entries with no usable verdict", () => {
    const gates = { weird: { reason: "no ok field" }, n: 3 } as unknown as JournalStatus["gates"];
    expect(normalizeGates(st({ gates }))).toEqual([]);
  });

  it("survives a missing or malformed gates field", () => {
    expect(normalizeGates(null)).toEqual([]);
    expect(normalizeGates(st({}))).toEqual([]);
    expect(normalizeGates(st({ gates: undefined }))).toEqual([]);
  });

  it("falls back to the key when no label is sent", () => {
    const g = normalizeGates(st({ gates: { max_open_risk: { ok: true } } }));
    expect(g[0].label).toBe("Max Open Risk");
  });
});

describe("tradingBlocked", () => {
  it("is false when every gate passes and nothing is locked", () => {
    expect(tradingBlocked(st({ gates: { a: true, b: { ok: true } } }))).toBe(false);
  });

  it("is true on a failing gate", () => {
    expect(tradingBlocked(st({ gates: { a: true, b: { ok: false } } }))).toBe(true);
  });

  it("is true while locked, even with every gate passing", () => {
    const s = st({ lock: { until: 9e9, reason: "Self lock" }, gates: { a: true } });
    expect(tradingBlocked(s)).toBe(true);
  });

  it("is false with nothing to go on, rather than claiming a block", () => {
    expect(tradingBlocked(null)).toBe(false);
  });
});

describe("blockReasons", () => {
  it("leads with the lock, then the failing gates", () => {
    const s = st({
      lock: { until: 9e9, reason: "Cooldown after a loss" },
      gates: { window: true, max_trades: { ok: false, reason: "6 of 6" } },
    });
    expect(blockReasons(s)).toEqual([
      "Cooldown after a loss",
      "Max Trades: 6 of 6",
    ]);
  });

  it("uses the label alone when a gate gives no reason", () => {
    expect(blockReasons(st({ gates: { cooldown: { ok: false } } }))).toEqual([
      "Cooldown",
    ]);
  });

  it("names the lock even when its reason is missing", () => {
    expect(blockReasons(st({ lock: { until: 9e9 } }))).toEqual(["Trading locked"]);
  });

  it("is empty when nothing blocks", () => {
    expect(blockReasons(st({ gates: { a: true } }))).toEqual([]);
  });
});
