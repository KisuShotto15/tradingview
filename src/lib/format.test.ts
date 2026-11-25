import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { formatPrice, formatPct, formatVolume, pricePrecisionFor, priceFormatFor, axisPriceFormatter, changeFromPct, formatChange } from "./format";

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

describe("pricePrecisionFor", () => {
  it("keeps 2 decimals for prices >= 1", () => {
    expect(pricePrecisionFor(64320.6)).toBe(2);
    expect(pricePrecisionFor(1)).toBe(2);
  });
  it("gives sub-cent prices enough decimals to be readable", () => {
    // e.g. the chart's price scale used to flatten every symbol to 2
    // decimals, which showed a 0.00012 altcoin as "0.00".
    expect(pricePrecisionFor(0.00012)).toBe(8);
    expect(pricePrecisionFor(0.0814)).toBe(4);
  });
  it("falls back to 2 for non-finite or zero input", () => {
    expect(pricePrecisionFor(0)).toBe(2);
    expect(pricePrecisionFor(NaN)).toBe(2);
  });
});

describe("priceFormatFor", () => {
  it("pairs precision with a matching minMove", () => {
    expect(priceFormatFor(0.00012)).toEqual({ precision: 8, minMove: 1e-8 });
    expect(priceFormatFor(64320.6)).toEqual({ precision: 2, minMove: 0.01 });
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

describe("changeFromPct", () => {
  it("recovers the absolute move from price and percentage", () => {
    // 110 after +10% means the open was 100, so the move is +10.
    expect(changeFromPct(110, 10)).toBeCloseTo(10, 9);
    expect(changeFromPct(90, -10)).toBeCloseTo(-10, 9);
  });

  it("is zero on a flat tape", () => {
    expect(changeFromPct(100, 0)).toBe(0);
  });

  it("gives up rather than dividing by zero at -100%", () => {
    expect(changeFromPct(100, -100)).toBe(null);
  });

  it("rejects non-finite inputs", () => {
    expect(changeFromPct(NaN, 1)).toBe(null);
    expect(changeFromPct(1, Infinity)).toBe(null);
  });
});

describe("formatChange", () => {
  it("always carries an explicit sign", () => {
    expect(formatChange(1420.33)).toBe("+1,420.33");
    expect(formatChange(-1420.33)).toBe("−1,420.33");
  });
});

describe("axisPriceFormatter", () => {
  it("groups thousands at the precision it is given", () => {
    expect(axisPriceFormatter(1)(61450.5)).toBe("61,450.5");
    expect(axisPriceFormatter(2)(67440.03)).toBe("67,440.03");
  });

  it("keeps a sub-cent instrument's digits", () => {
    expect(axisPriceFormatter(6)(0.000123)).toBe("0.000123");
  });

  it("pads to the precision rather than dropping trailing zeros", () => {
    // The axis must not print 61,450 next to 61,450.5 — the steps would
    // look uneven.
    expect(axisPriceFormatter(1)(61450)).toBe("61,450.0");
  });

  it("does not crash on a non-finite price", () => {
    expect(axisPriceFormatter(2)(NaN)).toBe("—");
  });
});
