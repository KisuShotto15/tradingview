"use client";

import { useEffect, useRef } from "react";
import { useChartStore, DEFAULT_CONFIG } from "@/lib/store/chart-store";
import {
  loadChartSettings,
  saveChartSettings,
  loadWatchlist,
  saveWatchlist,
} from "./user-data";
import { useAuth } from "./auth-context";

const DEBOUNCE_MS = 1500;

export function useCloudSync() {
  const { user } = useAuth();
  const initializedRef = useRef(false);

  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const indicators = useChartStore((s) => s.indicators);
  const hidden = useChartStore((s) => s.hidden);
  const config = useChartStore((s) => s.config);
  const watchlist = useChartStore((s) => s.watchlist);

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

      if (wl) {
        useChartStore.setState({ watchlist: wl });
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

  // Debounced watchlist sync
  const wlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user || !initializedRef.current) return;
    if (wlTimerRef.current) clearTimeout(wlTimerRef.current);
    wlTimerRef.current = setTimeout(() => {
      saveWatchlist(watchlist);
    }, DEBOUNCE_MS);
    return () => {
      if (wlTimerRef.current) clearTimeout(wlTimerRef.current);
    };
  }, [user, watchlist]);
}
