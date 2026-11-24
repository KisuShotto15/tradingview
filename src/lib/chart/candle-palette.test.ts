import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import {
  DEFAULT_CANDLE_PALETTE,
  CANDLE_PALETTE_VERSION,
  applyCandlePalette,
} from "./candle-palette";

const OLD_DEFAULT = {
  bodyUp: "#26a69a",
  bodyDown: "#ef5350",
  borderUp: "#26a69a",
  borderDown: "#ef5350",
  wickUp: "#26a69a",
  wickDown: "#ef5350",
};

describe("applyCandlePalette", () => {
  it("moves the old default onto the new palette", () => {
    expect(applyCandlePalette({ ...OLD_DEFAULT })).toEqual(DEFAULT_CANDLE_PALETTE);
  });

  it("also moves a customised set — the whole point of v7", () => {
    // v6 skipped these, so the change reached nobody who had ever opened the
    // colour pickers.
    const custom = { ...OLD_DEFAULT, bodyUp: "#ba68c8", wickUp: "#e1bee7" };
    expect(applyCandlePalette(custom)).toEqual(DEFAULT_CANDLE_PALETTE);
  });

  it("keeps the non-candle colours around it", () => {
    const stored = { bg: "#111111", gridLines: "#222222", ...OLD_DEFAULT };
    const out = applyCandlePalette(stored);
    expect(out.bg).toBe("#111111");
    expect(out.gridLines).toBe("#222222");
    expect(out.bodyUp).toBe(DEFAULT_CANDLE_PALETTE.bodyUp);
  });

  it("is idempotent", () => {
    const once = applyCandlePalette({ ...OLD_DEFAULT });
    expect(applyCandlePalette(once)).toEqual(once);
  });

  it("fills in a set that is missing fields entirely", () => {
    expect(applyCandlePalette({})).toEqual(DEFAULT_CANDLE_PALETTE);
  });

  it("emits bodies in the exact shape ColorPicker round-trips", () => {
    // formatColor() writes `rgba(r, g, b, 0.30)`; anything else would be
    // rewritten the first time the dialog is opened.
    expect(DEFAULT_CANDLE_PALETTE.bodyUp).toBe("rgba(179, 158, 215, 0.30)");
    expect(DEFAULT_CANDLE_PALETTE.bodyDown).toBe("rgba(79, 51, 163, 0.30)");
  });
});

describe("CANDLE_PALETTE_VERSION", () => {
  it("is ahead of the 0 an unstamped cloud row reads as", () => {
    // `vs.candlePaletteVersion ?? 0` is how a pre-marker row is detected; if
    // the version were ever 0 the migration would never run on those rows.
    expect(CANDLE_PALETTE_VERSION > 0).toBe(true);
  });
});
