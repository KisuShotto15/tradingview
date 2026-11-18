import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { anchorKeyFor, vwapBands } from "./vwap";
import type { Candle } from "@/lib/binance/types";

function candle(time: number, price: number, volume: number): Candle {
  // Flat bar: typical price (H+L+C)/3 collapses to `price`, which keeps the
  // expected VWAP arithmetic readable.
  return {
    time,
    open: price,
    high: price,
    low: price,
    close: price,
    volume,
    isFinal: true,
  };
}

const DAY = 86400;
const UTC = (y: number, m: number, d: number, h = 0, min = 0) =>
  Date.UTC(y, m - 1, d, h, min) / 1000;

describe("anchorKeyFor — utc", () => {
  const key = anchorKeyFor("utc");

  it("groups a whole UTC day into one session", () => {
    expect(key(UTC(2026, 3, 10, 0, 0))).toBe(key(UTC(2026, 3, 10, 23, 59)));
  });

  it("starts a new session at 00:00 UTC", () => {
    expect(key(UTC(2026, 3, 10, 23, 59))).not.toBe(key(UTC(2026, 3, 11, 0, 0)));
  });
});

describe("anchorKeyFor — ny", () => {
  const key = anchorKeyFor("ny");

  it("holds one session from the 09:30 open to the end of the NY day", () => {
    // 14:30 UTC = 09:30 EST (winter). Same session through 23:59 NY.
    expect(key(UTC(2026, 1, 15, 14, 30))).toBe(key(UTC(2026, 1, 16, 4, 59)));
  });

  it("separates pre-market from the session that follows it", () => {
    // 13:00 UTC = 08:00 EST, before the open.
    expect(key(UTC(2026, 1, 15, 13, 0))).not.toBe(key(UTC(2026, 1, 15, 14, 30)));
  });

  it("separates pre-market from the previous day's session too", () => {
    // This is the journal's two-resets-a-day behaviour, kept deliberately:
    // the date rollover at local midnight also starts a new segment.
    expect(key(UTC(2026, 1, 15, 20, 0))).not.toBe(key(UTC(2026, 1, 16, 13, 0)));
  });

  it("follows daylight saving rather than a fixed offset", () => {
    // 2026-07-15 is EDT (UTC-4), so the open is 13:30 UTC, not 14:30.
    expect(key(UTC(2026, 7, 15, 13, 29))).not.toBe(key(UTC(2026, 7, 15, 13, 30)));
    expect(key(UTC(2026, 7, 15, 13, 30))).toBe(key(UTC(2026, 7, 15, 20, 0)));
    // In January the same 13:30 UTC is still pre-market (08:30 EST).
    expect(key(UTC(2026, 1, 15, 13, 30))).not.toBe(key(UTC(2026, 1, 15, 14, 30)));
  });
});

describe("vwapBands", () => {
  it("returns the bar's own price on the first bar of a session", () => {
    const out = vwapBands([candle(UTC(2026, 3, 10, 1), 100, 5)], "utc");
    expect(out[0].vwap).toBeCloseTo(100, 9);
    expect(out[0].sd).toBeCloseTo(0, 9);
  });

  it("weights by volume, not by bar count", () => {
    const out = vwapBands(
      [
        candle(UTC(2026, 3, 10, 1), 100, 1),
        candle(UTC(2026, 3, 10, 2), 200, 3),
      ],
      "utc",
    );
    // (100·1 + 200·3) / 4 = 175 — a plain mean would say 150.
    expect(out[1].vwap).toBeCloseTo(175, 9);
  });

  it("computes the volume-weighted standard deviation", () => {
    const out = vwapBands(
      [
        candle(UTC(2026, 3, 10, 1), 100, 1),
        candle(UTC(2026, 3, 10, 2), 200, 1),
      ],
      "utc",
    );
    // Equal weights around a mean of 150: σ = 50.
    expect(out[1].vwap).toBeCloseTo(150, 9);
    expect(out[1].sd).toBeCloseTo(50, 9);
  });

  it("restarts at the anchor instead of carrying the previous session", () => {
    const out = vwapBands(
      [
        candle(UTC(2026, 3, 10, 12), 100, 10),
        candle(UTC(2026, 3, 11, 1), 500, 1), // next UTC day
      ],
      "utc",
    );
    // Without the reset this would be ~136; the new session starts clean.
    expect(out[1].vwap).toBeCloseTo(500, 9);
    expect(out[1].sd).toBeCloseTo(0, 9);
    expect(out[1].anchor).not.toBe(out[0].anchor);
  });

  it("never returns a negative variance on a flat series", () => {
    // Floating-point cancellation in E[x²]−E[x]² can go slightly negative.
    const flat = Array.from({ length: 50 }, (_, i) =>
      candle(UTC(2026, 3, 10, 0) + i * 60, 61234.56, 3),
    );
    for (const p of vwapBands(flat, "utc")) {
      expect(p.sd >= 0).toBe(true);
      expect(Number.isNaN(p.sd)).toBe(false);
    }
  });

  it("survives zero-volume bars without dividing by zero", () => {
    const out = vwapBands(
      [candle(UTC(2026, 3, 10, 1), 100, 0), candle(UTC(2026, 3, 10, 2), 120, 0)],
      "utc",
    );
    for (const p of out) {
      expect(Number.isFinite(p.vwap)).toBe(true);
      expect(Number.isFinite(p.sd)).toBe(true);
    }
    expect(out[1].vwap).toBeCloseTo(120, 9);
  });

  it("handles an empty series", () => {
    expect(vwapBands([], "utc")).toEqual([]);
  });

  it("emits one point per candle, in order", () => {
    const cs = [
      candle(UTC(2026, 3, 10, 1), 10, 1),
      candle(UTC(2026, 3, 10, 2), 20, 1),
      candle(UTC(2026, 3, 10, 3), 30, 1),
    ];
    const out = vwapBands(cs, "utc");
    expect(out.length).toBe(3);
    expect(out.map((p) => p.time)).toEqual(cs.map((c) => c.time));
  });

  it("uses the typical price (H+L+C)/3, not the close", () => {
    const c: Candle = {
      time: UTC(2026, 3, 10, 1),
      open: 0,
      high: 120,
      low: 60,
      close: 90,
      volume: 1,
      isFinal: true,
    };
    // (120 + 60 + 90) / 3 = 90 — equals the close here only by construction.
    expect(vwapBands([c], "utc")[0].vwap).toBeCloseTo(90, 9);
    const c2 = { ...c, high: 150 };
    // (150 + 60 + 90) / 3 = 100, so the close alone would give the wrong answer.
    expect(vwapBands([c2], "utc")[0].vwap).toBeCloseTo(100, 9);
  });
});
