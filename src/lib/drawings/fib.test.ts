import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { fibExtensionLevels, FIB_EXT_RATIOS_DEFAULT } from "./fib";

describe("fibExtensionLevels", () => {
  it("projects levels from C by the A→B move (up move)", () => {
    // A=100, B=200 (move +100), C=150.
    const out = fibExtensionLevels(100, 200, 150, [0, 1, 1.618]);
    expect(out.map((l) => l.price)).toEqual([150, 250, 311.8]);
  });

  it("handles a down move (negative range)", () => {
    // A=200, B=100 (move -100), C=150.
    const out = fibExtensionLevels(200, 100, 150, [0, 0.618, 1]);
    expect(out.map((l) => Math.round(l.price * 10) / 10)).toEqual([150, 88.2, 50]);
  });

  it("preserves ratios alongside prices", () => {
    const out = fibExtensionLevels(0, 10, 0, FIB_EXT_RATIOS_DEFAULT);
    expect(out.map((l) => l.ratio)).toEqual(FIB_EXT_RATIOS_DEFAULT);
    // move = 10, C = 0 → price == ratio*10
    expect(out.map((l) => l.price)).toEqual(FIB_EXT_RATIOS_DEFAULT.map((r) => r * 10));
  });
});
