import { test } from "node:test";
import { expect } from "@/test-utils/expect";
import { bybitInterval, bybitSymbol } from "@/lib/bybit/public";
import { registerDynamicEntries } from "@/lib/symbols/catalog";
import { resolveSource } from "@/lib/symbols/source";

test("bybitInterval maps app timeframes to Bybit codes", () => {
  expect(bybitInterval("1m")).toBe("1");
  expect(bybitInterval("1h")).toBe("60");
  expect(bybitInterval("4h")).toBe("240");
  expect(bybitInterval("1d")).toBe("D");
  expect(bybitInterval("1w")).toBe("W");
  expect(bybitInterval("1M")).toBe("M");
  // Unsupported intervals degrade to the nearest lower supported one.
  expect(bybitInterval("8h")).toBe("240");
  expect(bybitInterval("3d")).toBe("D");
});

test("bybitSymbol strips the .P perp suffix", () => {
  expect(bybitSymbol("BTCUSDT.P")).toBe("BTCUSDT");
  expect(bybitSymbol("myrousdt.p")).toBe("MYROUSDT");
  expect(bybitSymbol("ETHUSDT")).toBe("ETHUSDT");
});

test("resolveSource routes a registered Bybit-exclusive perp to bybit", () => {
  registerDynamicEntries([
    {
      ticker: "TESTUSDT.P",
      providerSymbol: "TESTUSDT",
      source: "bybit",
      category: "Crypto",
      description: "Test / USDT Perpetual · Bybit",
    },
  ]);
  const src = resolveSource("TESTUSDT.P");
  expect(src.kind).toBe("bybit");
  if (src.kind === "bybit") expect(src.providerSymbol).toBe("TESTUSDT");
});

test("resolveSource still defaults unknown perps to binance", () => {
  const src = resolveSource("BTCUSDT.P");
  expect(src.kind).toBe("binance");
});
