"use client";

import type { SavedViewport } from "./viewport-memory";

/**
 * Where each chart was last left, kept across restarts.
 *
 * Deliberately its own localStorage key rather than a field on the Zustand
 * store: this is written on every pan and zoom (debounced), and routing that
 * through a persisted store would drag the whole chart state — colours,
 * indicator config, watchlists — through `JSON.stringify` on every scroll,
 * and push it to Supabase on top.
 *
 * Keyed by symbol *and* timeframe because they are different views of
 * different things: where you were on the 5m says nothing about the daily.
 */
const KEY = "kc-viewport-v1";
/** Enough for a session's worth of charts; the oldest are dropped. */
const MAX_ENTRIES = 40;

type Stored = Record<string, SavedViewport & { at: number }>;

function read(): Stored {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Stored) : {};
  } catch {
    // Private mode, blocked storage, or something else wrote garbage here.
    // Forgetting the scroll position is not worth throwing over.
    return {};
  }
}

function keyFor(symbol: string, timeframe: string): string {
  return `${symbol}|${timeframe}`;
}

export function saveViewport(
  symbol: string,
  timeframe: string,
  viewport: SavedViewport | null,
): void {
  if (!viewport || typeof window === "undefined") return;
  try {
    const all = read();
    all[keyFor(symbol, timeframe)] = { ...viewport, at: Date.now() };

    const keys = Object.keys(all);
    if (keys.length > MAX_ENTRIES) {
      keys
        .sort((a, b) => (all[a]?.at ?? 0) - (all[b]?.at ?? 0))
        .slice(0, keys.length - MAX_ENTRIES)
        .forEach((k) => delete all[k]);
    }

    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Quota or blocked storage — the chart still works, it just opens where
    // lightweight-charts would have put it.
  }
}

export function loadViewport(
  symbol: string,
  timeframe: string,
): SavedViewport | null {
  const entry = read()[keyFor(symbol, timeframe)];
  return entry ? { span: entry.span, fromTime: entry.fromTime, rightOffset: entry.rightOffset } : null;
}
