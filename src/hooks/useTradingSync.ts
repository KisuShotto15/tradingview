"use client";

import { useEffect } from "react";
import { useTradingStore } from "@/lib/store/trading-store";
import { useChartStore } from "@/lib/store/chart-store";
import { isPerp } from "@/lib/binance/rest";

/**
 * Global trading sync. Keeps positions / orders / balance fresh whenever
 * credentials are set, independent of whether any trading panel is open — so
 * the chart's EP / SL / TP / liquidation lines always reflect the live account.
 *
 * The per-panel effects still run when their panels are visible; this hook just
 * guarantees a baseline refresh so the chart overlay is never stale.
 */
const POLL_MS = 5000;

export function useTradingSync() {
  const apiKey = useTradingStore((s) => s.apiKey);
  const apiSecret = useTradingStore((s) => s.apiSecret);
  const exchange = useTradingStore((s) => s.exchange);
  const testnet = useTradingStore((s) => s.testnet);
  const symbol = useChartStore((s) => s.symbol);

  useEffect(() => {
    if (!apiKey || !apiSecret) return;
    const perp = isPerp(symbol);

    function refresh() {
      const s = useTradingStore.getState();
      void s.fetchBalance(symbol);
      void s.fetchOrders(symbol);
      if (perp) void s.fetchPositions(symbol);
    }

    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [apiKey, apiSecret, exchange, testnet, symbol]);
}
