import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { describeSymbol } from "./describe";

describe("describeSymbol", () => {
  it("names both sides of a spot pair", () => {
    expect(describeSymbol("BTCUSDT")).toBe("Bitcoin / TetherUS");
  });

  it("marks a perpetual", () => {
    expect(describeSymbol("BTCUSDT.P")).toBe("Bitcoin / TetherUS PERPETUAL");
  });

  it("ignores the exchange qualifier", () => {
    expect(describeSymbol("BYBIT:SOLUSDT.P")).toBe("Solana / TetherUS PERPETUAL");
  });

  it("splits on the longest quote, so USDT never reads as USD", () => {
    // "BTCUSDT" ends with both "USD" and "USDT"; the wrong one leaves a
    // stray "T" on the base asset.
    expect(describeSymbol("BTCUSDT")).toBe("Bitcoin / TetherUS");
    expect(describeSymbol("BTCUSD")).toBe("Bitcoin / USD");
  });

  it("handles a crypto-quoted pair", () => {
    expect(describeSymbol("ETHBTC")).toBe("Ethereum / Bitcoin");
  });

  it("falls back to the ticker for an unknown base", () => {
    expect(describeSymbol("ZZZUSDT")).toBe("ZZZ / TetherUS");
  });

  it("never swallows the whole symbol as a quote", () => {
    // "USDT" alone must not split into an empty base.
    expect(describeSymbol("USDT")).toBe("TetherUS");
  });

  it("prefers a catalog entry's own description", () => {
    expect(describeSymbol("AAPL")).toBe("Apple Inc.");
  });
});
