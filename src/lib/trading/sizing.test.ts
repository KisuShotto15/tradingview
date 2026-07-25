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
  type SizingCtx,
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
