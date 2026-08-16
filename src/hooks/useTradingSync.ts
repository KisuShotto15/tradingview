"use client";

import { useEffect, useRef } from "react";
import { useTradingStore } from "@/lib/store/trading-store";
import { useChartStore } from "@/lib/store/chart-store";
import { useToastStore } from "@/lib/alerts/toast-store";
import { isPerp } from "@/lib/binance/rest";
import { formatPrice } from "@/lib/format";
import type { Position } from "@/lib/binance/trading-types";

/**
 * Global trading sync. Keeps positions / orders / balance fresh whenever
 * credentials are set, independent of whether any trading panel is open — so
 * the chart's EP / SL / TP / liquidation lines always reflect the live account.
 *
 * Also keeps `allPositions` (every open position on the account, not just the
 * chart's current symbol) fresh, so the watchlist can badge any row with an
 * open trade, and raises a toast when a position opens, is added to, or closes.
 *
 * The per-panel effects still run when their panels are visible; this hook just
 * guarantees a baseline refresh so the chart overlay is never stale.
 */
// Fast enough that a fill shows up on the chart almost immediately.
const POLL_MS = 2000;

/** Hedge-mode accounts can hold both directions on one symbol. */
function positionKey(p: Position): string {
  return `${p.symbol}#${p.positionIdx ?? 0}`;
}

function openPositions(list: Position[]): Map<string, Position> {
  return new Map(list.filter((p) => p.positionAmt !== 0).map((p) => [positionKey(p), p]));
}

export function useTradingSync() {
  const apiKey = useTradingStore((s) => s.apiKey);
  const apiSecret = useTradingStore((s) => s.apiSecret);
  const exchange = useTradingStore((s) => s.exchange);
  const testnet = useTradingStore((s) => s.testnet);
  const symbol = useChartStore((s) => s.symbol);

  /** False until the first snapshot lands, so pre-existing positions don't
   *  announce themselves as fresh fills on load or after switching accounts. */
  const seededRef = useRef(false);
  useEffect(() => {
    seededRef.current = false;
  }, [apiKey, apiSecret, exchange, testnet]);

  useEffect(() => {
    if (!apiKey || !apiSecret) return;
    const perp = isPerp(symbol);
    let cancelled = false;

    async function refresh() {
      const s = useTradingStore.getState();
      void s.fetchBalance(symbol);
      void s.fetchOrders(symbol);
      if (perp) void s.fetchPositions(symbol);
      await s.fetchAllPositions();
      if (!cancelled) seededRef.current = true;
    }

    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [apiKey, apiSecret, exchange, testnet, symbol]);

  // Announce fills by diffing consecutive position snapshots. Without a signed
  // user-data socket this is the reliable signal: the exchange has already
  // averaged the entry price for us, so a size change IS a fill.
  useEffect(() => {
    return useTradingStore.subscribe((state, prev) => {
      if (state.allPositions === prev.allPositions) return;
      if (!seededRef.current) return;

      const before = openPositions(prev.allPositions);
      const after = openPositions(state.allPositions);
      const toast = useToastStore.getState().push;

      for (const [key, pos] of after) {
        const wasOpen = before.get(key);
        const side = pos.positionAmt > 0 ? "Long" : "Short";
        const size = Math.abs(pos.positionAmt);
        if (!wasOpen) {
          toast({
            variant: "info",
            title: "Order filled",
            message: `${side} ${size} ${pos.symbol} @ ${formatPrice(pos.entryPrice)}`,
          });
        } else if (Math.abs(pos.positionAmt) > Math.abs(wasOpen.positionAmt) + 1e-12) {
          // Added to an existing position — the entry price is now an average.
          toast({
            variant: "info",
            title: "Order filled — position increased",
            message: `${side} ${size} ${pos.symbol} · avg entry ${formatPrice(pos.entryPrice)}`,
          });
        }
      }

      for (const [key, pos] of before) {
        if (!after.has(key)) {
          toast({
            variant: "info",
            title: "Position closed",
            message: `${pos.symbol}`,
          });
        }
      }
    });
  }, []);
}
