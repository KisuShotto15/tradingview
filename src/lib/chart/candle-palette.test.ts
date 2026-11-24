import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import {
  DEFAULT_CANDLE_PALETTE,
  LEGACY_CANDLE_PALETTE,
  isLegacyCandlePalette,
  migrateCandlePalette,
} from "./candle-palette";

describe("isLegacyCandlePalette", () => {
  it("recognises the old default", () => {
    expect(isLegacyCandlePalette(LEGACY_CANDLE_PALETTE)).toBe(true);
  });

  it("ignores case, since a stored hex may be uppercase", () => {
    const upper = Object.fromEntries(
      Object.entries(LEGACY_CANDLE_PALETTE).map(([k, v]) => [k, v.toUpperCase()]),
    );
    expect(isLegacyCandlePalette(upper)).toBe(true);
  });

  it("is false once any single colour was changed", () => {
    expect(
      isLegacyCandlePalette({ ...LEGACY_CANDLE_PALETTE, wickUp: "#ffffff" }),
    ).toBe(false);
  });

  it("is false for the new palette, so the migration cannot run twice", () => {
    expect(isLegacyCandlePalette(DEFAULT_CANDLE_PALETTE)).toBe(false);
  });

  it("is false for a missing or incomplete set", () => {
    expect(isLegacyCandlePalette(null)).toBe(false);
    expect(isLegacyCandlePalette({})).toBe(false);
    expect(isLegacyCandlePalette({ bodyUp: "#26a69a" })).toBe(false);
  });
});

describe("migrateCandlePalette", () => {
  it("moves an untouched set onto the new palette", () => {
    expect(migrateCandlePalette({ ...LEGACY_CANDLE_PALETTE })).toEqual(
      DEFAULT_CANDLE_PALETTE,
    );
  });

  it("keeps the non-candle colours around it", () => {
    const stored = { bg: "#111111", gridLines: "#222222", ...LEGACY_CANDLE_PALETTE };
    const out = migrateCandlePalette(stored);
    expect(out.bg).toBe("#111111");
    expect(out.gridLines).toBe("#222222");
    expect(out.bodyUp).toBe(DEFAULT_CANDLE_PALETTE.bodyUp);
  });

  it("leaves a customised set completely alone", () => {
    const mine = { ...LEGACY_CANDLE_PALETTE, bodyUp: "#123456" };
    expect(migrateCandlePalette(mine)).toEqual(mine);
  });

  it("is idempotent", () => {
    const once = migrateCandlePalette({ ...LEGACY_CANDLE_PALETTE });
    expect(migrateCandlePalette(once)).toEqual(once);
  });

  it("emits bodies in the exact shape ColorPicker round-trips", () => {
    // formatColor() writes `rgba(r, g, b, 0.30)`; anything else would be
    // rewritten the first time the dialog is opened.
    expect(DEFAULT_CANDLE_PALETTE.bodyUp).toBe("rgba(179, 158, 215, 0.30)");
    expect(DEFAULT_CANDLE_PALETTE.bodyDown).toBe("rgba(79, 51, 163, 0.30)");
  });
});
