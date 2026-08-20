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
/** How long a row stays tinted green/red after a price change. */
const FLASH_MS = 300;

/** Returns a stable `applyTick` callback that batches incoming ticks and
 *  flushes them into `rows`/`flash` state at most once every `FLUSH_MS`. */
export function useBatchedTicks(
  setRows: (updater: (prev: Record<string, Row>) => Record<string, Row>) => void,
  setFlash: (updater: (prev: FlashState) => FlashState) => void,
) {
  const pendingRef = useRef<Map<string, Tick>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Last price seen per symbol, kept here rather than read back out of `rows`.
   * A `setRows` updater does not run synchronously — React defers it to the
   * render pass — so deriving the up/down direction inside one and reading the
   * result straight afterwards always sees an empty list, and no row ever
   * flashes. Diffing against our own record keeps the updater pure and the
   * direction correct.
   */
  const lastPriceRef = useRef<Map<string, number>>(new Map());
  /**
   * Per-symbol counter identifying the most recent flash. A symbol can change
   * again inside the 300ms window, and without this the older clear-timeout
   * would wipe the newer flash early, cutting the animation short.
   */
  const flashSeqRef = useRef<Map<string, number>>(new Map());
  const clearTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const timers = clearTimersRef.current;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const flush = useCallback(() => {
    timerRef.current = null;
    const pending = pendingRef.current;
    if (pending.size === 0) return;
    pendingRef.current = new Map();

    const ups: string[] = [];
    const downs: string[] = [];
    const updates: Record<string, Row> = {};

    for (const [symbol, tick] of pending) {
      const prevPrice = lastPriceRef.current.get(symbol);
      if (prevPrice !== undefined) {
        if (tick.close > prevPrice) ups.push(symbol);
        else if (tick.close < prevPrice) downs.push(symbol);
      }
      lastPriceRef.current.set(symbol, tick.close);
      updates[symbol] = { symbol, price: tick.close, pct: tick.pct };
    }

    setRows((prev) => ({ ...prev, ...updates }));

    const changed = [...ups, ...downs];
    if (changed.length === 0) return;

    // Stamp this batch's flashes, so the clear below can tell whether it is
    // still the newest one for each symbol.
    const seqs = new Map<string, number>();
    for (const s of changed) {
      const next = (flashSeqRef.current.get(s) ?? 0) + 1;
      flashSeqRef.current.set(s, next);
      seqs.set(s, next);
    }

    setFlash((f) => {
      const next = { ...f };
      for (const s of ups) next[s] = "up";
      for (const s of downs) next[s] = "down";
      return next;
    });

    const timer = setTimeout(() => {
      clearTimersRef.current.delete(timer);
      setFlash((f) => {
        const next = { ...f };
        let touched = false;
        for (const s of changed) {
          // A newer flash for this symbol has since replaced ours — leave it.
          if (flashSeqRef.current.get(s) !== seqs.get(s)) continue;
          if (next[s]) {
            next[s] = null;
            touched = true;
          }
        }
        return touched ? next : f;
      });
    }, FLASH_MS);
    clearTimersRef.current.add(timer);
  }, [setRows, setFlash]);

  return useCallback(
    (tick: Tick) => {
      pendingRef.current.set(tick.symbol, tick);
      if (timerRef.current == null) timerRef.current = setTimeout(flush, FLUSH_MS);
    },
    [flush],
  );
}
