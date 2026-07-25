import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { formatPrice, formatPct, formatVolume } from "./format";

describe("formatPrice", () => {
  it("uses thousands separators above 1000", () => {
    expect(formatPrice(60000)).toBe("60,000");
    expect(formatPrice(1234.567)).toBe("1,234.57");
  });
  it("scales decimals by magnitude", () => {
    expect(formatPrice(12.5)).toBe("12.50");
    expect(formatPrice(0.1234)).toBe("0.1234");
    expect(formatPrice(0.00012345)).toBe("0.000123");
  });
  it("returns an em dash for non-finite input", () => {
    expect(formatPrice(Infinity)).toBe("—");
    expect(formatPrice(NaN)).toBe("—");
  });
});

describe("formatPct", () => {
  it("prefixes a sign", () => {
    expect(formatPct(2.5)).toBe("+2.50%");
    expect(formatPct(-1.2)).toBe("-1.20%");
    expect(formatPct(0)).toBe("+0.00%");
  });
});

describe("formatVolume", () => {
  it("abbreviates by magnitude", () => {
    expect(formatVolume(2_500_000_000)).toBe("2.50B");
    expect(formatVolume(3_400_000)).toBe("3.40M");
    expect(formatVolume(7_800)).toBe("7.80K");
    expect(formatVolume(42)).toBe("42.00");
  });
});
