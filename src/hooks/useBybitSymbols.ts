"use client";

import { useEffect } from "react";
import { fetchBybitPerpSymbols } from "@/lib/bybit/public";
import { registerDynamicEntries } from "@/lib/symbols/catalog";
import { BYBIT_PREFIX } from "@/lib/symbols/prefix";

let registered = false;

/**
 * Loads the Bybit linear-perp universe once per session and registers every
 * perp as a `BYBIT:<ticker>` catalog entry, so the search list offers an
 * explicit Bybit variant alongside Binance for shared tickers (e.g. both
 * `SOLUSDT.P` and `BYBIT:SOLUSDT.P`), and Bybit-only perps become selectable.
 * Runs eagerly so a persisted `BYBIT:` symbol also shows in search after reload.
 */
export function useBybitSymbols() {
  useEffect(() => {
    if (registered) return;
    registered = true;
    (async () => {
      try {
        const bybit = await fetchBybitPerpSymbols();
        registerDynamicEntries(
          bybit.map((b) => ({
            ticker: `${BYBIT_PREFIX}${b.ticker}`,
            providerSymbol: b.symbol,
            source: "bybit" as const,
            category: "Crypto" as const,
            description: `${b.baseCoin} / ${b.quoteCoin} Perpetual · Bybit`,
          })),
        );
      } catch {
        registered = false; // allow a retry on next mount
      }
    })();
  }, []);
}
