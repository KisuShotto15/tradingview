import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { isStreamed, quoteFromCandles } from "./quotes";

describe("quoteFromCandles", () => {
  it("prices the last close against the one before", () => {
    const q = quoteFromCandles("AAPL", [{ close: 100 }, { close: 200 }, { close: 210 }]);
    expect(q?.lastPrice).toBe(210);
    expect(q?.priceChangePercent).toBe(5);
  });
  it("reports no change with a single bar, and nothing with none", () => {
    expect(quoteFromCandles("X", [{ close: 7 }])?.priceChangePercent).toBe(0);
    expect(quoteFromCandles("X", [])).toBe(null);
  });
});

describe("isStreamed", () => {
  it("is true for exchange symbols only", () => {
    expect(isStreamed("BTCUSDT")).toBe(true);
    expect(isStreamed("BTCUSDT.P")).toBe(true);
    expect(isStreamed("BYBIT:SOLUSDT.P")).toBe(true);
    expect(isStreamed("BTCUSDT/ETHUSDT")).toBe(false);
  });
});
