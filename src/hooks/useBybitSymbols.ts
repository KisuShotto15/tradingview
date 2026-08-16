"use client";

import { useEffect } from "react";
import { fetchExchangeSymbols } from "@/lib/binance/rest";
import { fetchBybitPerpSymbols } from "@/lib/bybit/public";
import { registerDynamicEntries } from "@/lib/symbols/catalog";

let registered = false;

/**
 * Loads the Bybit linear-perp universe once per session and registers the
 * perps that Binance does NOT list as dynamic catalog entries (source "bybit").
 * Shared tickers stay on Binance (faster WS, identical price); only Bybit
 * exclusives route to Bybit data. Runs eagerly so a persisted Bybit symbol
 * charts correctly right after a reload — before the search dialog is opened.
 */
export function useBybitSymbols() {
  useEffect(() => {
    if (registered) return;
    registered = true;
    (async () => {
      try {
        const [binance, bybit] = await Promise.all([
          fetchExchangeSymbols().catch(() => []),
          fetchBybitPerpSymbols(),
        ]);
        const binanceTickers = new Set(binance.map((s) => s.symbol.toUpperCase()));
        const exclusives = bybit.filter((b) => !binanceTickers.has(b.ticker.toUpperCase()));
        registerDynamicEntries(
          exclusives.map((b) => ({
            ticker: b.ticker,
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
