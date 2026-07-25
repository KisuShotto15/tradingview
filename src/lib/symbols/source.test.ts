import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { resolveSource, sourceKindOf } from "./source";
import { isPerp, cleanSym } from "@/lib/binance/rest";

describe("resolveSource", () => {
  it("defaults an unknown ticker to Binance spot", () => {
    const s = resolveSource("BTCUSDT");
    expect(s.kind).toBe("binance");
  });

  it("classifies a synthetic expression", () => {
    expect(sourceKindOf("BTCUSDT-ETHUSDT")).toBe("synthetic");
    const s = resolveSource("BTCUSDT/ETHUSDT");
    expect(s.kind).toBe("synthetic");
  });

  it("uppercases and trims the input", () => {
    const s = resolveSource("  btcusdt  ");
    expect(s.kind).toBe("binance");
    if (s.kind === "binance") expect(s.symbol).toBe("BTCUSDT");
  });
});

describe("isPerp / cleanSym", () => {
  it("detects the .P perp suffix", () => {
    expect(isPerp("BTCUSDT.P")).toBe(true);
    expect(isPerp("BTCUSDT")).toBe(false);
    expect(isPerp("btcusdt.p")).toBe(true);
  });
  it("strips the .P suffix and uppercases", () => {
    expect(cleanSym("BTCUSDT.P")).toBe("BTCUSDT");
    expect(cleanSym("ethusdt")).toBe("ETHUSDT");
  });
});
