import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { isSyntheticExpression, extractSymbols } from "./synthetic";

describe("isSyntheticExpression", () => {
  it("is true for operator expressions over symbols", () => {
    expect(isSyntheticExpression("BTCUSDT-ETHUSDT")).toBe(true);
    expect(isSyntheticExpression("BTCUSDT/ETHUSDT")).toBe(true);
    expect(isSyntheticExpression("(BTCUSDT+ETHUSDT)/2")).toBe(true);
  });

  it("is false for a plain symbol or empty input", () => {
    expect(isSyntheticExpression("BTCUSDT")).toBe(false);
    expect(isSyntheticExpression("")).toBe(false);
  });

  it("is idempotent across repeated calls (regression: stateful global regex)", () => {
    // Calling many times must not flip due to a shared regex lastIndex.
    for (let i = 0; i < 5; i++) {
      expect(isSyntheticExpression("BTCUSDT/ETHUSDT")).toBe(true);
      expect(isSyntheticExpression("BTCUSDT-ETHUSDT")).toBe(true);
    }
  });
});

describe("extractSymbols", () => {
  it("returns unique uppercased tokens", () => {
    expect(extractSymbols("BTCUSDT-ETHUSDT").sort()).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(extractSymbols("(BTCUSDT+BTCUSDT)/2")).toEqual(["BTCUSDT"]);
  });
});
