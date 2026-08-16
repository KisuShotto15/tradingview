import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import {
  roundToStep,
  roundToTick,
  ticksBetween,
  marginUsdFromQty,
  qtyFromMarginUsd,
  pctBalanceFromQty,
  qtyFromPctBalance,
  riskUsdFromQty,
  qtyFromRiskUsd,
  rrRatio,
  modeRequiresSl,
  sizingToQty,
  slInputToPrice,
  slPriceToInput,
  type SizingCtx,
  type SlCtx,
} from "./sizing";

const ctx: SizingCtx = {
  entry: 100,
  sl: 90,
  leverage: 10,
  balanceUsd: 1000,
  tickSize: 0.5,
  stepSize: 0.001,
};

describe("roundToStep", () => {
  it("floors to the step size", () => {
    expect(roundToStep(1.23456, 0.001)).toBeCloseTo(1.234, 6);
  });
  it("guards invalid input", () => {
    expect(roundToStep(-1, 0.001)).toBe(0);
    expect(roundToStep(1, 0)).toBe(0);
  });
});

describe("roundToTick", () => {
  it("rounds to the nearest tick", () => {
    expect(roundToTick(100.3, 0.5)).toBeCloseTo(100.5, 6);
    expect(roundToTick(100.2, 0.5)).toBeCloseTo(100.0, 6);
  });
  it("returns price unchanged for an invalid tick", () => {
    expect(roundToTick(100, 0)).toBe(100);
  });
});

describe("ticksBetween", () => {
  it("returns signed whole ticks", () => {
    expect(ticksBetween(100, 101, 0.5)).toBe(2);
    expect(ticksBetween(101, 100, 0.5)).toBe(-2);
  });
});

describe("margin <-> qty", () => {
  it("round-trips margin and qty", () => {
    expect(marginUsdFromQty(1, ctx)).toBeCloseTo(10, 6); // 1*100/10
    expect(qtyFromMarginUsd(10, ctx)).toBeCloseTo(1, 6);
  });
});

describe("% balance <-> qty", () => {
  it("round-trips", () => {
    expect(pctBalanceFromQty(1, ctx)).toBeCloseTo(1, 6); // margin 10 / 1000 * 100
    expect(qtyFromPctBalance(1, ctx)).toBeCloseTo(1, 6);
  });
});

describe("risk USD <-> qty", () => {
  it("uses SL distance", () => {
    expect(riskUsdFromQty(1, ctx)).toBeCloseTo(10, 6); // |100-90|*1
    expect(qtyFromRiskUsd(10, ctx)).toBeCloseTo(1, 6);
  });
  it("degrades gracefully with no SL", () => {
    const noSl = { ...ctx, sl: null };
    expect(riskUsdFromQty(1, noSl)).toBe(0);
    expect(Number.isNaN(qtyFromRiskUsd(10, noSl))).toBe(true);
  });
});

describe("rrRatio", () => {
  it("computes reward / risk", () => {
    expect(rrRatio(100, 90, 120)).toBeCloseTo(2, 6);
  });
  it("is 0 when a leg is missing", () => {
    expect(rrRatio(100, null, 120)).toBe(0);
    expect(rrRatio(100, 90, null)).toBe(0);
  });
});

describe("modeRequiresSl", () => {
  it("is true only for risk modes", () => {
    expect(modeRequiresSl("RISK_USD")).toBe(true);
    expect(modeRequiresSl("RISK_PCT")).toBe(true);
    expect(modeRequiresSl("AMOUNT")).toBe(false);
    expect(modeRequiresSl("MARGIN_USD")).toBe(false);
  });
});

describe("sizingToQty", () => {
  it("dispatches per mode and step-rounds", () => {
    expect(sizingToQty("AMOUNT", 2.5, ctx)).toBeCloseTo(2.5, 6);
    expect(sizingToQty("MARGIN_USD", 10, ctx)).toBeCloseTo(1, 6);
    expect(sizingToQty("RISK_USD", 10, ctx)).toBeCloseTo(1, 6);
  });
  it("returns 0 for non-positive input", () => {
    expect(sizingToQty("AMOUNT", 0, ctx)).toBe(0);
    expect(sizingToQty("AMOUNT", -3, ctx)).toBe(0);
  });
});

/* ── Stop-loss input modes ─────────────────────────────────────────────── */

const longCtx: SlCtx = { entry: 100, side: "BUY", qty: 2, balanceUsd: 1000 };
const shortCtx: SlCtx = { entry: 100, side: "SELL", qty: 2, balanceUsd: 1000 };

describe("slInputToPrice", () => {
  it("passes a price through unchanged", () => {
    expect(slInputToPrice("PRICE", 95, longCtx)).toBe(95);
  });

  it("puts the stop below entry for a long and above for a short", () => {
    // 5% of a 100 entry = 5 away from it, on the losing side.
    expect(slInputToPrice("PCT_PRICE", 5, longCtx)).toBeCloseTo(95, 6);
    expect(slInputToPrice("PCT_PRICE", 5, shortCtx)).toBeCloseTo(105, 6);
  });

  it("derives the stop from a cash risk over the position size", () => {
    // 20 USD risk across 2 units = 10 of price distance.
    expect(slInputToPrice("RISK_USD", 20, longCtx)).toBeCloseTo(90, 6);
    expect(slInputToPrice("RISK_USD", 20, shortCtx)).toBeCloseTo(110, 6);
  });

  it("derives the stop from a percentage of balance", () => {
    // 2% of 1000 = 20 USD risk, same as above.
    expect(slInputToPrice("RISK_PCT", 2, longCtx)).toBeCloseTo(90, 6);
  });

  it("returns NaN when the inputs can't produce a stop", () => {
    expect(Number.isNaN(slInputToPrice("PRICE", 0, longCtx))).toBe(true);
    // Risk modes need a position size to divide by.
    expect(Number.isNaN(slInputToPrice("RISK_USD", 20, { ...longCtx, qty: 0 }))).toBe(true);
    expect(Number.isNaN(slInputToPrice("RISK_PCT", 2, { ...longCtx, balanceUsd: 0 }))).toBe(true);
    // A stop that would land at or below zero is not a stop.
    expect(Number.isNaN(slInputToPrice("PCT_PRICE", 100, longCtx))).toBe(true);
  });
});

describe("slPriceToInput", () => {
  it("round-trips every mode", () => {
    for (const [mode, value] of [
      ["PRICE", 95],
      ["PCT_PRICE", 5],
      ["RISK_USD", 20],
      ["RISK_PCT", 2],
    ] as const) {
      const price = slInputToPrice(mode, value, longCtx);
      expect(slPriceToInput(mode, price, longCtx)).toBeCloseTo(value, 6);
    }
  });

  it("reports the same magnitude regardless of side", () => {
    expect(slPriceToInput("PCT_PRICE", 95, longCtx)).toBeCloseTo(5, 6);
    expect(slPriceToInput("PCT_PRICE", 105, shortCtx)).toBeCloseTo(5, 6);
  });

  it("returns 0 when there is no usable stop", () => {
    expect(slPriceToInput("RISK_USD", 0, longCtx)).toBe(0);
    expect(slPriceToInput("RISK_PCT", 90, { ...longCtx, balanceUsd: 0 })).toBe(0);
  });
});
