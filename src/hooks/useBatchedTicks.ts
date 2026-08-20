"use client";

import { useCallback, useEffect, useRef } from "react";

interface Row {
  symbol: string;
  price: number;
  pct: number;
}

interface Tick {
  symbol: string;
  close: number;
  pct: number;
}

type FlashState = Record<string, "up" | "down" | null>;

// Bybit's public ticker stream pushes on every trade — much faster than
// Binance's `@miniTicker`, which the exchange itself caps to ~once/second —
// so applying every message straight to state (one setRows call each) makes
// a volatile Bybit row flicker far more violently than TradingView's own UI,
// which decouples render rate from feed rate. Coalescing ticks that land
// within the same short window into a single flush reproduces that: the
// watchlist still reflects the latest price, but repaints at a capped rate
// instead of once per raw message.
const FLUSH_MS = 150;

/** Returns a stable `applyTick` callback that batches incoming ticks and
 *  flushes them into `rows`/`flash` state at most once every `FLUSH_MS`. */
export function useBatchedTicks(
  setRows: (updater: (prev: Record<string, Row>) => Record<string, Row>) => void,
  setFlash: (updater: (prev: FlashState) => FlashState) => void,
) {
  const pendingRef = useRef<Map<string, Tick>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const flush = useCallback(() => {
    timerRef.current = null;
    const pending = pendingRef.current;
    if (pending.size === 0) return;
    pendingRef.current = new Map();

    const ups: string[] = [];
    const downs: string[] = [];
    setRows((prev) => {
      const next = { ...prev };
      for (const [symbol, tick] of pending) {
        const prevRow = prev[symbol];
        if (prevRow) {
          if (tick.close > prevRow.price) ups.push(symbol);
          else if (tick.close < prevRow.price) downs.push(symbol);
        }
        next[symbol] = { symbol, price: tick.close, pct: tick.pct };
      }
      return next;
    });

    if (ups.length > 0 || downs.length > 0) {
      setFlash((f) => {
        const next = { ...f };
        for (const s of ups) next[s] = "up";
        for (const s of downs) next[s] = "down";
        return next;
      });
      setTimeout(() => {
        setFlash((f) => {
          const next = { ...f };
          for (const s of [...ups, ...downs]) if (next[s]) next[s] = null;
          return next;
        });
      }, 300);
    }
  }, [setRows, setFlash]);

  return useCallback(
    (tick: Tick) => {
      pendingRef.current.set(tick.symbol, tick);
      if (timerRef.current == null) timerRef.current = setTimeout(flush, FLUSH_MS);
    },
    [flush],
  );
}
