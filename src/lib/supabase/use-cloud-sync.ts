"use client";

import { useEffect, useRef } from "react";
import {
  useChartStore,
  DEFAULT_CONFIG,
  type Watchlist,
} from "@/lib/store/chart-store";
import {
  loadChartSettings,
  saveChartSettings,
  loadWatchlist,
  saveWatchlist,
} from "./user-data";
import { useAuth } from "./auth-context";

const DEBOUNCE_MS = 1500;

function activeSymbols(watchlists: Watchlist[], activeId: string): string[] {
  const w = watchlists.find((x) => x.id === activeId);
  if (!w) return [];
  return w.items.filter((i) => i.type === "symbol").map((i) => i.value);
}

export function useCloudSync() {
  const { user } = useAuth();
  const initializedRef = useRef(false);

  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const indicators = useChartStore((s) => s.indicators);
  const hidden = useChartStore((s) => s.hidden);
  const config = useChartStore((s) => s.config);
  const watchlists = useChartStore((s) => s.watchlists);
  const activeWatchlistId = useChartStore((s) => s.activeWatchlistId);

  const setSymbol = useChartStore((s) => s.setSymbol);
  const setTimeframe = useChartStore((s) => s.setTimeframe);

  // Initial cloud load after sign-in
  useEffect(() => {
    if (!user || initializedRef.current) return;
    initializedRef.current = true;

    async function init() {
      const [settings, wl] = await Promise.all([
        loadChartSettings(),
        loadWatchlist(),
      ]);

      if (settings) {
        setSymbol(settings.symbol);
        setTimeframe(settings.timeframe);
        useChartStore.setState({
          indicators: settings.indicators,
          hidden: settings.hidden,
          config: settings.config ?? DEFAULT_CONFIG,
        });
      }

      if (wl && wl.length > 0) {
        // Merge cloud symbols into the active watchlist as new entries (without
        // duplicating). Preserves any labels/multi-list structure the user has
        // locally.
        useChartStore.setState((state) => {
          const next = state.watchlists.map((w) => {
            if (w.id !== state.activeWatchlistId) return w;
            const have = new Set(
              w.items.filter((i) => i.type === "symbol").map((i) => i.value),
            );
            const adds = wl
              .filter((s) => !have.has(s))
              .map((sym) => ({
                id: Math.random().toString(36).slice(2, 10),
                type: "symbol" as const,
                value: sym,
              }));
            return adds.length === 0
              ? w
              : { ...w, items: [...w.items, ...adds] };
          });
          return { watchlists: next };
        });
      }
    }

    init();
  }, [user, setSymbol, setTimeframe]);

  // Reset on sign-out
  useEffect(() => {
    if (!user) {
      initializedRef.current = false;
    }
  }, [user]);

  // Debounced settings sync
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user || !initializedRef.current) return;
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    settingsTimerRef.current = setTimeout(() => {
      saveChartSettings({ symbol, timeframe, indicators, hidden, config });
    }, DEBOUNCE_MS);
    return () => {
      if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    };
  }, [user, symbol, timeframe, indicators, hidden, config]);

  // Debounced watchlist sync — only the active watchlist's symbols are pushed,
  // since the cloud table stores a flat list (labels live local-only for now).
  const wlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user || !initializedRef.current) return;
    if (wlTimerRef.current) clearTimeout(wlTimerRef.current);
    const symbols = activeSymbols(watchlists, activeWatchlistId);
    wlTimerRef.current = setTimeout(() => {
      saveWatchlist(symbols);
    }, DEBOUNCE_MS);
    return () => {
      if (wlTimerRef.current) clearTimeout(wlTimerRef.current);
    };
  }, [user, watchlists, activeWatchlistId]);
}
