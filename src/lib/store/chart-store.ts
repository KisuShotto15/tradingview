"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";

export type IndicatorKey =
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
  rsi: "#ab47bc",
  macd: "#2962ff",
  volume: "#787b86",
  adx: "#ffb74d",
  squeeze: "#2962ff",
  vumanchu: "#4994ec",
};

/** A user-added EMA instance. Multiple can coexist. */
export interface UserEMA {
  id: string;
  period: number;
  color: string;
  lineWidth: number;
  hidden: boolean;
}

const EMA_PALETTE = [
  "#ffb74d",
  "#2962ff",
  "#ab47bc",
  "#26a69a",
  "#ef5350",
  "#42a5f5",
  "#ec407a",
  "#ffee58",
];

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

/** Per-indicator style overrides (colors, visibility) */
export interface SqueezeStyle {
  /** Momentum histogram colors (Pine: lime/green/red/maroon) */
  momentumIncPos: string;
  momentumDecPos: string;
  momentumIncNeg: string;
  momentumDecNeg: string;
  /** Squeeze state dots (on/off/no-squeeze) */
  squeezeOn: string;
  squeezeOff: string;
  noSqueeze: string;
  /** Visibility toggles */
  showMomentum: boolean;
  showSqueezeDots: boolean;
}

export const DEFAULT_SQUEEZE_STYLE: SqueezeStyle = {
  momentumIncPos: "#00ff00",
  momentumDecPos: "#26a69a",
  momentumIncNeg: "#a52a2a",
  momentumDecNeg: "#ef5350",
  squeezeOn: "#000000",
  squeezeOff: "#787b86",
  noSqueeze: "#2962ff",
  showMomentum: true,
  showSqueezeDots: true,
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

/** Either a symbol entry or a section label inside a watchlist. */
export type WatchlistItem =
  | { id: string; type: "symbol"; value: string }
  | { id: string; type: "label"; value: string };

export interface Watchlist {
  id: string;
  name: string;
  items: WatchlistItem[];
}

/** Tagged settings target — either a builtin indicator key or an EMA instance id. */
export type SettingsTarget = IndicatorKey | { kind: "ema"; id: string };

interface ChartState {
  symbol: string;
  timeframe: Timeframe;
  /** Indicator is added to the chart (appears in pill + renders unless hidden) */
  indicators: Record<IndicatorKey, boolean>;
  /** Indicator is hidden (eye icon off) — kept in pill list, just not rendered */
  hidden: Record<IndicatorKey, boolean>;
  /** Periods and parameters for each indicator */
  config: IndicatorConfig;
  /** User-added EMA instances (multi-instance) */
  userEMAs: UserEMA[];
  /** Squeeze indicator style overrides */
  squeezeStyle: SqueezeStyle;
  /** Logarithmic price scale */
  logScale: boolean;
  /** How many recent bars to show when (re)loading a chart */
  visibleBars: number;
  /**
   * Maps an indicator to the indicator whose pane it shares ("own" = its own
   * pane). E.g. { adx: "squeeze" } overlays ADX on the Squeeze pane.
   */
  indicatorOverlays: Partial<Record<IndicatorKey, IndicatorKey | "own">>;

  /**
   * Per-drawing-kind defaults (color, lineWidth, lineStyle). Applied to new
   * drawings. Updated when the user edits a drawing's style — so next time
   * they use the same tool, the same style is pre-selected.
   */
  toolDefaults: Partial<
    Record<
      string,
      { color?: string; lineWidth?: number; lineStyle?: number }
    >
  >;
  /** User watchlists with sections/labels */
  watchlists: Watchlist[];
  activeWatchlistId: string;

  /** Chart color customization */
  chartColors: ChartColors;

  // Ephemeral UI state (not persisted)
  tool: DrawingTool;
  symbolDialogOpen: boolean;
  /** Which indicator/EMA's settings dialog is open (null = closed) */
  settingsTarget: SettingsTarget | null;
  chartSettingsOpen: boolean;

  // Actions
  setSymbol: (s: string) => void;
  setTimeframe: (t: Timeframe) => void;
  setChartColors: (patch: Partial<ChartColors>) => void;
  toggleIndicator: (key: IndicatorKey) => void;
  removeIndicator: (key: IndicatorKey) => void;
  toggleHidden: (key: IndicatorKey) => void;
  setConfig: (patch: Partial<IndicatorConfig>) => void;
  addUserEMA: () => void;
  removeUserEMA: (id: string) => void;
  updateUserEMA: (id: string, patch: Partial<UserEMA>) => void;
  toggleUserEMAHidden: (id: string) => void;
  setSqueezeStyle: (patch: Partial<SqueezeStyle>) => void;
  setLogScale: (v: boolean) => void;
  setVisibleBars: (n: number) => void;
  setIndicatorOverlay: (key: IndicatorKey, target: IndicatorKey | "own") => void;
  setToolDefault: (
    kind: string,
    patch: { color?: string; lineWidth?: number; lineStyle?: number },
  ) => void;
  createWatchlist: (name: string) => string;
  renameWatchlist: (id: string, name: string) => void;
  deleteWatchlist: (id: string) => void;
  setActiveWatchlist: (id: string) => void;
  addSymbolToWatchlist: (watchlistId: string, symbol: string) => void;
  addLabelToWatchlist: (watchlistId: string, label: string, beforeId?: string) => void;
  removeWatchlistItem: (watchlistId: string, itemId: string) => void;
  moveWatchlistItem: (watchlistId: string, itemId: string, delta: -1 | 1) => void;
  renameWatchlistItem: (watchlistId: string, itemId: string, value: string) => void;
  setTool: (t: DrawingTool) => void;
  setSymbolDialogOpen: (v: boolean) => void;
  setSettingsTarget: (k: SettingsTarget | null) => void;
  setChartSettingsOpen: (v: boolean) => void;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function initialWatchlists(): {
  watchlists: Watchlist[];
  activeWatchlistId: string;
} {
  const id = randomId();
  return {
    watchlists: [
      {
        id,
        name: "Default",
        items: DEFAULT_WATCHLIST.map((sym) => ({
          id: randomId(),
          type: "symbol" as const,
          value: sym,
        })),
      },
    ],
    activeWatchlistId: id,
  };
}

export const useChartStore = create<ChartState>()(
  persist(
    (set) => ({
      symbol: "BTCUSDT",
      timeframe: "15m" as Timeframe,
      indicators: {
        rsi: true,
        macd: false,
        volume: true,
        adx: false,
        squeeze: false,
        vumanchu: false,
      },
      hidden: {
        rsi: false,
        macd: false,
        volume: false,
        adx: false,
        squeeze: false,
        vumanchu: false,
      },
      config: { ...DEFAULT_CONFIG },
      userEMAs: [
        { id: randomId(), period: 20, color: EMA_PALETTE[0], lineWidth: 1, hidden: false },
        { id: randomId(), period: 50, color: EMA_PALETTE[1], lineWidth: 1, hidden: false },
      ],
      squeezeStyle: { ...DEFAULT_SQUEEZE_STYLE },
      logScale: false,
      visibleBars: 150,
      indicatorOverlays: {},
      toolDefaults: {},
      ...initialWatchlists(),
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
      addUserEMA: () =>
        set((s) => {
          const usedColors = new Set(s.userEMAs.map((e) => e.color));
          const nextColor =
            EMA_PALETTE.find((c) => !usedColors.has(c)) ??
            EMA_PALETTE[s.userEMAs.length % EMA_PALETTE.length];
          // Suggest a longer period than any existing EMA, or 9 if none
          const maxPeriod = s.userEMAs.reduce((m, e) => Math.max(m, e.period), 0);
          const suggested = maxPeriod > 0 ? Math.min(maxPeriod * 2, 500) : 9;
          return {
            userEMAs: [
              ...s.userEMAs,
              {
                id: randomId(),
                period: suggested,
                color: nextColor,
                lineWidth: 1,
                hidden: false,
              },
            ],
          };
        }),
      removeUserEMA: (id) =>
        set((s) => ({ userEMAs: s.userEMAs.filter((e) => e.id !== id) })),
      updateUserEMA: (id, patch) =>
        set((s) => ({
          userEMAs: s.userEMAs.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      toggleUserEMAHidden: (id) =>
        set((s) => ({
          userEMAs: s.userEMAs.map((e) =>
            e.id === id ? { ...e, hidden: !e.hidden } : e,
          ),
        })),
      setSqueezeStyle: (patch) =>
        set((s) => ({ squeezeStyle: { ...s.squeezeStyle, ...patch } })),
      setLogScale: (logScale) => set({ logScale }),
      setVisibleBars: (visibleBars) => set({ visibleBars }),
      setIndicatorOverlay: (key, target) =>
        set((s) => ({
          indicatorOverlays: { ...s.indicatorOverlays, [key]: target },
        })),
      setToolDefault: (kind, patch) =>
        set((s) => ({
          toolDefaults: {
            ...s.toolDefaults,
            [kind]: { ...(s.toolDefaults[kind] ?? {}), ...patch },
          },
        })),
      createWatchlist: (name) => {
        const id = randomId();
        set((state) => ({
          watchlists: [...state.watchlists, { id, name, items: [] }],
          activeWatchlistId: id,
        }));
        return id;
      },
      renameWatchlist: (id, name) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) =>
            w.id === id ? { ...w, name } : w,
          ),
        })),
      deleteWatchlist: (id) =>
        set((state) => {
          if (state.watchlists.length <= 1) return state;
          const next = state.watchlists.filter((w) => w.id !== id);
          return {
            watchlists: next,
            activeWatchlistId:
              state.activeWatchlistId === id
                ? next[0].id
                : state.activeWatchlistId,
          };
        }),
      setActiveWatchlist: (id) => set({ activeWatchlistId: id }),
      addSymbolToWatchlist: (watchlistId, symbol) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) => {
            if (w.id !== watchlistId) return w;
            if (w.items.some((i) => i.type === "symbol" && i.value === symbol)) {
              return w;
            }
            return {
              ...w,
              items: [
                ...w.items,
                { id: randomId(), type: "symbol", value: symbol },
              ],
            };
          }),
        })),
      addLabelToWatchlist: (watchlistId, label, beforeId) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) => {
            if (w.id !== watchlistId) return w;
            const newItem: WatchlistItem = {
              id: randomId(),
              type: "label",
              value: label,
            };
            if (!beforeId) {
              return { ...w, items: [...w.items, newItem] };
            }
            const idx = w.items.findIndex((i) => i.id === beforeId);
            if (idx === -1) return { ...w, items: [...w.items, newItem] };
            return {
              ...w,
              items: [...w.items.slice(0, idx), newItem, ...w.items.slice(idx)],
            };
          }),
        })),
      removeWatchlistItem: (watchlistId, itemId) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) =>
            w.id === watchlistId
              ? { ...w, items: w.items.filter((i) => i.id !== itemId) }
              : w,
          ),
        })),
      moveWatchlistItem: (watchlistId, itemId, delta) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) => {
            if (w.id !== watchlistId) return w;
            const idx = w.items.findIndex((i) => i.id === itemId);
            if (idx === -1) return w;
            const target = idx + delta;
            if (target < 0 || target >= w.items.length) return w;
            const next = [...w.items];
            [next[idx], next[target]] = [next[target], next[idx]];
            return { ...w, items: next };
          }),
        })),
      renameWatchlistItem: (watchlistId, itemId, value) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) =>
            w.id === watchlistId
              ? {
                  ...w,
                  items: w.items.map((i) =>
                    i.id === itemId ? { ...i, value } : i,
                  ),
                }
              : w,
          ),
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
      version: 3,
      migrate: (persisted, fromVersion) => {
        const p = persisted as Record<string, unknown>;
        if (fromVersion < 3 && Array.isArray(p.watchlist)) {
          const id = randomId();
          p.watchlists = [
            {
              id,
              name: "Default",
              items: (p.watchlist as string[]).map((sym) => ({
                id: randomId(),
                type: "symbol",
                value: sym,
              })),
            },
          ];
          p.activeWatchlistId = id;
          delete p.watchlist;
        }
        return p;
      },
      partialize: (s) => ({
        symbol: s.symbol,
        timeframe: s.timeframe,
        indicators: s.indicators,
        hidden: s.hidden,
        config: s.config,
        userEMAs: s.userEMAs,
        squeezeStyle: s.squeezeStyle,
        logScale: s.logScale,
        visibleBars: s.visibleBars,
        indicatorOverlays: s.indicatorOverlays,
        toolDefaults: s.toolDefaults,
        watchlists: s.watchlists,
        activeWatchlistId: s.activeWatchlistId,
        chartColors: s.chartColors,
      }),
    },
  ),
);
