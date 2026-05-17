"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";

export type IndicatorKey =
  | "ema20"
  | "ema50"
  | "ema200"
  | "rsi"
  | "macd"
  | "volume"
  | "adx"
  | "squeeze"
  | "vumanchu";

export type DrawingTool =
  | "cursor"
  | "measure"
  | "eraser"
  | "hline"
  | "vline"
  | "trendline"
  | "ray"
  | "hray"
  | "parallel-channel"
  | "fib-retracement"
  | "price-range"
  | "date-range"
  | "long"
  | "short";

export interface IndicatorConfig {
  ema20: number;
  ema50: number;
  ema200: number;
  rsi: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  adx: number;
  squeezeBB: number;
  squeezeBBMult: number;
  squeezeKC: number;
  squeezeKCMult: number;
  vumanchuChannelLen: number;
  vumanchuAvgLen: number;
  vumanchuMaLen: number;
  vumanchuMfiPeriod: number;
}

export const DEFAULT_CONFIG: IndicatorConfig = {
  ema20: 20,
  ema50: 50,
  ema200: 200,
  rsi: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  adx: 14,
  squeezeBB: 20,
  squeezeBBMult: 2,
  squeezeKC: 20,
  squeezeKCMult: 1.5,
  vumanchuChannelLen: 9,
  vumanchuAvgLen: 12,
  vumanchuMaLen: 3,
  vumanchuMfiPeriod: 60,
};

export const INDICATOR_COLORS: Record<IndicatorKey, string> = {
  ema20: "#ffb74d",
  ema50: "#2962ff",
  ema200: "#ab47bc",
  rsi: "#ab47bc",
  macd: "#2962ff",
  volume: "#787b86",
  adx: "#ffb74d",
  squeeze: "#2962ff",
  vumanchu: "#4994ec",
};

export interface ChartColors {
  bg: string;
  gridLines: string;
  /** Candle body (filled rectangle) */
  bodyUp: string;
  bodyDown: string;
  /** Candle border (outline of the body) */
  borderUp: string;
  borderDown: string;
  /** Candle wick (high/low extension lines) */
  wickUp: string;
  wickDown: string;
}

export const DEFAULT_CHART_COLORS: ChartColors = {
  bg: "#000000",
  gridLines: "#0e0e0e",
  bodyUp: "#26a69a",
  bodyDown: "#ef5350",
  borderUp: "#26a69a",
  borderDown: "#ef5350",
  wickUp: "#26a69a",
  wickDown: "#ef5350",
};

export const DEFAULT_WATCHLIST = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "MATICUSDT",
];

interface ChartState {
  symbol: string;
  timeframe: Timeframe;
  /** Indicator is added to the chart (appears in pill + renders unless hidden) */
  indicators: Record<IndicatorKey, boolean>;
  /** Indicator is hidden (eye icon off) — kept in pill list, just not rendered */
  hidden: Record<IndicatorKey, boolean>;
  /** Periods and parameters for each indicator */
  config: IndicatorConfig;
  watchlist: string[];

  /** Chart color customization */
  chartColors: ChartColors;

  // Ephemeral UI state (not persisted)
  tool: DrawingTool;
  symbolDialogOpen: boolean;
  /** Which indicator's settings dialog is open (null = closed) */
  settingsTarget: IndicatorKey | null;
  chartSettingsOpen: boolean;

  // Actions
  setSymbol: (s: string) => void;
  setTimeframe: (t: Timeframe) => void;
  setChartColors: (patch: Partial<ChartColors>) => void;
  toggleIndicator: (key: IndicatorKey) => void;
  removeIndicator: (key: IndicatorKey) => void;
  toggleHidden: (key: IndicatorKey) => void;
  setConfig: (patch: Partial<IndicatorConfig>) => void;
  addToWatchlist: (s: string) => void;
  removeFromWatchlist: (s: string) => void;
  setTool: (t: DrawingTool) => void;
  setSymbolDialogOpen: (v: boolean) => void;
  setSettingsTarget: (k: IndicatorKey | null) => void;
  setChartSettingsOpen: (v: boolean) => void;
}

export const useChartStore = create<ChartState>()(
  persist(
    (set) => ({
      symbol: "BTCUSDT",
      timeframe: "15m" as Timeframe,
      indicators: {
        ema20: true,
        ema50: true,
        ema200: false,
        rsi: true,
        macd: false,
        volume: true,
        adx: false,
        squeeze: false,
        vumanchu: false,
      },
      hidden: {
        ema20: false,
        ema50: false,
        ema200: false,
        rsi: false,
        macd: false,
        volume: false,
        adx: false,
        squeeze: false,
        vumanchu: false,
      },
      config: { ...DEFAULT_CONFIG },
      watchlist: DEFAULT_WATCHLIST,
      chartColors: { ...DEFAULT_CHART_COLORS },
      tool: "cursor",
      symbolDialogOpen: false,
      settingsTarget: null,
      chartSettingsOpen: false,

      setSymbol: (symbol) => set({ symbol }),
      setTimeframe: (timeframe) => set({ timeframe }),
      toggleIndicator: (key) =>
        set((s) => ({
          indicators: { ...s.indicators, [key]: !s.indicators[key] },
          // When re-adding, ensure not hidden
          hidden: !s.indicators[key]
            ? { ...s.hidden, [key]: false }
            : s.hidden,
        })),
      removeIndicator: (key) =>
        set((s) => ({
          indicators: { ...s.indicators, [key]: false },
          hidden: { ...s.hidden, [key]: false },
        })),
      toggleHidden: (key) =>
        set((s) => ({ hidden: { ...s.hidden, [key]: !s.hidden[key] } })),
      setConfig: (patch) =>
        set((s) => ({ config: { ...s.config, ...patch } })),
      addToWatchlist: (s) =>
        set((state) => ({
          watchlist: state.watchlist.includes(s)
            ? state.watchlist
            : [...state.watchlist, s],
        })),
      removeFromWatchlist: (s) =>
        set((state) => ({
          watchlist: state.watchlist.filter((x) => x !== s),
        })),
      setChartColors: (patch) =>
        set((s) => ({ chartColors: { ...s.chartColors, ...patch } })),
      setTool: (tool) => set({ tool }),
      setSymbolDialogOpen: (symbolDialogOpen) => set({ symbolDialogOpen }),
      setSettingsTarget: (settingsTarget) => set({ settingsTarget }),
      setChartSettingsOpen: (chartSettingsOpen) => set({ chartSettingsOpen }),
    }),
    {
      name: "tv-gratis-chart-state",
      partialize: (s) => ({
        symbol: s.symbol,
        timeframe: s.timeframe,
        indicators: s.indicators,
        hidden: s.hidden,
        config: s.config,
        watchlist: s.watchlist,
        chartColors: s.chartColors,
      }),
    },
  ),
);
