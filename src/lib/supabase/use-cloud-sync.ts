"use client";

import { useEffect, useRef } from "react";
import { useChartStore, DEFAULT_CONFIG } from "@/lib/store/chart-store";
import {
  loadChartSettings,
  saveChartSettings,
  loadWatchlist,
  saveWatchlist,
  loadPriceLines,
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
  const setCloudPriceLines = useChartStore((s) => s.setCloudPriceLines);

  // Carga inicial desde la nube cuando el usuario se autentica
  useEffect(() => {
    if (!user || initializedRef.current) return;
    initializedRef.current = true;

    async function init() {
      const [settings, wl, pls] = await Promise.all([
        loadChartSettings(),
        loadWatchlist(),
        loadPriceLines(),
      ]);

      if (settings) {
        setSymbol(settings.symbol);
        setTimeframe(settings.timeframe);
        // Aplicar indicadores y config desde la nube via store
        useChartStore.setState({
          indicators: settings.indicators,
          hidden: settings.hidden,
          config: settings.config ?? DEFAULT_CONFIG,
        });
      }

      if (wl) {
        useChartStore.setState({ watchlist: wl });
      }

      if (pls.length > 0) {
        setCloudPriceLines(pls);
      }
    }

    init();
  }, [user]);

  // Reset cuando el usuario cierra sesión
  useEffect(() => {
    if (!user) {
      initializedRef.current = false;
    }
  }, [user]);

  // Sync settings con debounce
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

  // Sync watchlist con debounce
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
