import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { timeframeLabel } from "./coords";
import type { Timeframe } from "@/lib/binance/types";

/**
 * The case of the unit letter is load-bearing: "m" is minutes and "M" is
 * months, so a blanket `.toUpperCase()` on a label turns the 5-minute chart
 * into something that reads as 5 months. That has now happened twice — hence
 * this test rather than only the warning in the helper's doc comment.
 */
describe("timeframeLabel", () => {
  it("keeps minutes lowercase", () => {
    for (const tf of ["1m", "3m", "5m", "15m", "30m"] as Timeframe[]) {
      expect(timeframeLabel(tf)).toBe(tf);
    }
  });

  it("keeps hours lowercase", () => {
    for (const tf of ["1h", "2h", "4h", "6h", "8h", "12h"] as Timeframe[]) {
      expect(timeframeLabel(tf)).toBe(tf);
    }
  });

  it("reserves the capital M for the monthly chart", () => {
    expect(timeframeLabel("1M")).toBe("M");
    // And nothing else may produce it.
    const all: Timeframe[] = [
      "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h",
      "1d", "3d", "1w", "1M",
    ];
    const capitalM = all.filter((tf) => timeframeLabel(tf).includes("M"));
    expect(capitalM).toEqual(["1M"]);
  });

  it("drops the leading 1 from the single-unit day/week/month charts", () => {
    expect(timeframeLabel("1d")).toBe("D");
    expect(timeframeLabel("1w")).toBe("W");
    expect(timeframeLabel("3d")).toBe("3D");
  });
});
