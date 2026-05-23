"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";
import { unifiedHistory, isApplyingHistory, withoutHistory } from "@/lib/history";
import type { ChartStateSnapshot } from "@/lib/history";

export type IndicatorKey =
  | "rsi"
  | "macd"
  | "volume"
  | "adx"
  | "squeeze"
  | "vumanchu"
  | "obv"
  | "keylevels";

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
  adxDiLen: number;
  adxKeyLevel: number;
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
  adxDiLen: 14,
  adxKeyLevel: 23,
  squeezeBB: 20,
  squeezeBBMult: 2,
  squeezeKC: 20,
  squeezeKCMult: 1.5,
  vumanchuChannelLen: 9,
  vumanchuAvgLen: 12,
  vumanchuMaLen: 3,
  vumanchuMfiPeriod: 60,
};

export interface KeyLevelsConfig {
  distance: number;          // bars to extend lines to the right
  textSize: "Small" | "Medium" | "Large";
  lineWidth: "Small" | "Medium" | "Large";
  alwaysShow: boolean;

  daily:     { open: boolean; prevOpen: boolean; prevHL: boolean; prevMid: boolean; color: string };
  monday:    { range: boolean; mid: boolean; color: string };
  weekly:    { open: boolean; prevOpen: boolean; prevHL: boolean; prevMid: boolean; color: string };
  monthly:   { open: boolean; prevOpen: boolean; prevHL: boolean; prevMid: boolean; color: string };
  quarterly: { open: boolean; prevOpen: boolean; prevHL: boolean; prevMid: boolean; color: string };
  yearly:    { open: boolean; prevOpen: boolean; currHL: boolean; currMid: boolean; color: string };
  fourHour:  { open: boolean; prevHL: boolean; prevMid: boolean; color: string };
}

export const DEFAULT_KEY_LEVELS: KeyLevelsConfig = {
  distance: 20,
  textSize: "Medium",
  lineWidth: "Small",
  alwaysShow: false,
  daily:     { open: true,  prevOpen: false, prevHL: false, prevMid: false, color: "#08bcd4" },
  monday:    { range: true,  mid: true,                                     color: "#ffffff" },
  weekly:    { open: true,  prevOpen: true,  prevHL: true,  prevMid: true,  color: "#ffeb3b" },
  monthly:   { open: true,  prevOpen: true,  prevHL: true,  prevMid: true,  color: "#26a69a" },
  quarterly: { open: true,  prevOpen: false, prevHL: false, prevMid: false, color: "#ffa726" },
  yearly:    { open: true,  prevOpen: false, currHL: false, currMid: false, color: "#ef5350" },
  fourHour:  { open: false,                  prevHL: false, prevMid: false, color: "#ab47bc" },
};

export interface AdxStyle {
  adxColor: string;
  plusDiColor: string;
  minusDiColor: string;
  keyLevelColor: string;
  showAdx: boolean;
  showPlusDi: boolean;
  showMinusDi: boolean;
  showKeyLevel: boolean;
}

export const DEFAULT_ADX_STYLE: AdxStyle = {
  adxColor: "#787b86",
  plusDiColor: "#26a69a",
  minusDiColor: "#ef5350",
  keyLevelColor: "#787b86",
  showAdx: true,
  showPlusDi: true,
  showMinusDi: true,
  showKeyLevel: true,
};

export const INDICATOR_COLORS: Record<IndicatorKey, string> = {
  rsi: "#ab47bc",
  macd: "#2962ff",
  volume: "#787b86",
  adx: "#ffb74d",
  squeeze: "#2962ff",
  vumanchu: "#4994ec",
  obv: "#ffb74d",
  keylevels: "#08bcd4",
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
  // Pine-exact colors from the Rolgui Squeeze indicator:
  //   color.rgb(46, 245, 39)   → lime  (val>0 and val>prev)
  //   color.rgb(16, 120, 13)   → green (val>0 and val<=prev)
  //   color.rgb(217, 6, 6)     → red   (val<0 and val<prev)
  //   color.rgb(98, 0, 0)      → maroon(val<0 and val>=prev)
  momentumIncPos: "#2ef527",
  momentumDecPos: "#10780d",
  momentumIncNeg: "#620000",
  momentumDecNeg: "#d90606",
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
  /** ADX indicator style overrides */
  adxStyle: AdxStyle;
  keyLevels: KeyLevelsConfig;
  /** Squeeze indicator style overrides */
  squeezeStyle: SqueezeStyle;
  /** Logarithmic price scale (main pane only) */
  logScale: boolean;
  /** Per-indicator log scale toggle (sub-panes) */
  indicatorLogScale: Partial<Record<IndicatorKey, boolean>>;
  /** How many recent bars to show when (re)loading a chart */
  visibleBars: number;
  /** Whether the indicator pill list on the main pane is collapsed */
  pillsCollapsed: boolean;
  /** When true, all sub-pane indicators (RSI/MACD/ADX/Squeeze/VuManChu/OBV) are hidden. */
  subPanesHidden: boolean;
  /**
   * Maps an indicator to the indicator whose pane it shares ("own" = its own
   * pane). E.g. { adx: "squeeze" } overlays ADX on the Squeeze pane.
   */
  indicatorOverlays: Partial<Record<IndicatorKey, IndicatorKey | "own">>;
  /**
   * Per-pane visual render order. Key = the pane host's IndicatorKey.
   * Value = array of all indicator keys in that pane ordered bottom-to-top
   * (last element renders on top). Unset = default [host, ...guests].
   */
  paneZOrder: Partial<Record<IndicatorKey, IndicatorKey[]>>;
  /** Timeframes shown in the quick-access bar. User-configurable. */
  pinnedTimeframes: Timeframe[];

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
  setAdxStyle: (patch: Partial<AdxStyle>) => void;
  setKeyLevels: (patch: Partial<KeyLevelsConfig>) => void;
  setSqueezeStyle: (patch: Partial<SqueezeStyle>) => void;
  setLogScale: (v: boolean) => void;
  setIndicatorLogScale: (key: IndicatorKey, v: boolean) => void;
  setVisibleBars: (n: number) => void;
  setPillsCollapsed: (v: boolean) => void;
  setSubPanesHidden: (v: boolean) => void;
  toggleSubPanesHidden: () => void;
  setIndicatorOverlay: (key: IndicatorKey, target: IndicatorKey | "own") => void;
  setPaneZOrder: (host: IndicatorKey, order: IndicatorKey[]) => void;
  setPinnedTimeframes: (tfs: Timeframe[]) => void;
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
  reorderWatchlistItems: (watchlistId: string, fromId: string, toId: string) => void;
  renameWatchlistItem: (watchlistId: string, itemId: string, value: string) => void;
  setTool: (t: DrawingTool) => void;
  setSymbolDialogOpen: (v: boolean) => void;
  setSettingsTarget: (k: SettingsTarget | null) => void;
  setChartSettingsOpen: (v: boolean) => void;
  /** Apply a partial snapshot from undo/redo — does NOT push to history */
  applySnapshot: (snap: ChartStateSnapshot) => void;
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
    (set, get) => ({
      symbol: "BTCUSDT",
      timeframe: "15m" as Timeframe,
      indicators: {
        rsi: true,
        macd: false,
        volume: true,
        adx: false,
        squeeze: false,
        vumanchu: false,
        obv: false,
        keylevels: false,
      },
      hidden: {
        rsi: false,
        macd: false,
        volume: false,
        adx: false,
        squeeze: false,
        vumanchu: false,
        obv: false,
        keylevels: false,
      },
      config: { ...DEFAULT_CONFIG },
      userEMAs: [
        { id: randomId(), period: 20, color: EMA_PALETTE[0], lineWidth: 1, hidden: false },
        { id: randomId(), period: 50, color: EMA_PALETTE[1], lineWidth: 1, hidden: false },
      ],
      adxStyle: { ...DEFAULT_ADX_STYLE },
      keyLevels: { ...DEFAULT_KEY_LEVELS },
      squeezeStyle: { ...DEFAULT_SQUEEZE_STYLE },
      logScale: false,
      indicatorLogScale: {},
      visibleBars: 150,
      pillsCollapsed: false,
      subPanesHidden: false,
      indicatorOverlays: {},
      paneZOrder: {},
      pinnedTimeframes: ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"] as Timeframe[],
      toolDefaults: {},
      ...initialWatchlists(),
      chartColors: { ...DEFAULT_CHART_COLORS },
      tool: "cursor",
      symbolDialogOpen: false,
      settingsTarget: null,
      chartSettingsOpen: false,

      setSymbol: (symbol) => set({ symbol }),
      setTimeframe: (timeframe) => set({ timeframe }),

      toggleIndicator: (key) => {
        if (!isApplyingHistory) {
          const s = get();
          const before: ChartStateSnapshot = { indicators: { ...s.indicators }, hidden: { ...s.hidden } };
          set((st) => ({
            indicators: { ...st.indicators, [key]: !st.indicators[key] },
            hidden: !st.indicators[key] ? { ...st.hidden, [key]: false } : st.hidden,
          }));
          const after = get();
          unifiedHistory.push({ kind: "chartState", before, after: { indicators: { ...after.indicators }, hidden: { ...after.hidden } } });
        } else {
          set((st) => ({
            indicators: { ...st.indicators, [key]: !st.indicators[key] },
            hidden: !st.indicators[key] ? { ...st.hidden, [key]: false } : st.hidden,
          }));
        }
      },

      removeIndicator: (key) => {
        if (!isApplyingHistory) {
          const s = get();
          // Snapshot includes style fields so ONE undo restores the indicator + all its settings.
          const before: ChartStateSnapshot = {
            indicators: { ...s.indicators },
            hidden: { ...s.hidden },
            config: { ...s.config },
            adxStyle: { ...s.adxStyle },
            squeezeStyle: { ...s.squeezeStyle },
            indicatorOverlays: { ...s.indicatorOverlays },
          };
          set((st) => ({ indicators: { ...st.indicators, [key]: false }, hidden: { ...st.hidden, [key]: false } }));
          const after = get();
          unifiedHistory.push({
            kind: "chartState",
            before,
            after: { indicators: { ...after.indicators }, hidden: { ...after.hidden } },
          });
        } else {
          set((st) => ({ indicators: { ...st.indicators, [key]: false }, hidden: { ...st.hidden, [key]: false } }));
        }
      },

      toggleHidden: (key) => {
        if (!isApplyingHistory) {
          const s = get();
          const before: ChartStateSnapshot = { hidden: { ...s.hidden } };
          set((st) => ({ hidden: { ...st.hidden, [key]: !st.hidden[key] } }));
          const after = get();
          unifiedHistory.push({ kind: "chartState", before, after: { hidden: { ...after.hidden } } });
        } else {
          set((st) => ({ hidden: { ...st.hidden, [key]: !st.hidden[key] } }));
        }
      },

      setConfig: (patch) => {
        if (!isApplyingHistory) {
          const s = get();
          const before: ChartStateSnapshot = { config: { ...s.config } };
          set((st) => ({ config: { ...st.config, ...patch } }));
          const after = get();
          unifiedHistory.push({ kind: "chartState", before, after: { config: { ...after.config } } });
        } else {
          set((st) => ({ config: { ...st.config, ...patch } }));
        }
      },

      addUserEMA: () => {
        const s = get();
        const before: ChartStateSnapshot = { userEMAs: [...s.userEMAs] };
        set((st) => {
          const usedColors = new Set(st.userEMAs.map((e) => e.color));
          const nextColor = EMA_PALETTE.find((c) => !usedColors.has(c)) ?? EMA_PALETTE[st.userEMAs.length % EMA_PALETTE.length];
          const maxPeriod = st.userEMAs.reduce((m, e) => Math.max(m, e.period), 0);
          const suggested = maxPeriod > 0 ? Math.min(maxPeriod * 2, 500) : 9;
          return { userEMAs: [...st.userEMAs, { id: randomId(), period: suggested, color: nextColor, lineWidth: 1, hidden: false }] };
        });
        if (!isApplyingHistory) {
          const after = get();
          unifiedHistory.push({ kind: "chartState", before, after: { userEMAs: [...after.userEMAs] } });
        }
      },

      removeUserEMA: (id) => {
        if (!isApplyingHistory) {
          const s = get();
          const before: ChartStateSnapshot = { userEMAs: [...s.userEMAs] };
          set((st) => ({ userEMAs: st.userEMAs.filter((e) => e.id !== id) }));
          const after = get();
          unifiedHistory.push({ kind: "chartState", before, after: { userEMAs: [...after.userEMAs] } });
        } else {
          set((st) => ({ userEMAs: st.userEMAs.filter((e) => e.id !== id) }));
        }
      },

      updateUserEMA: (id, patch) => {
        if (!isApplyingHistory) {
          const s = get();
          const before: ChartStateSnapshot = { userEMAs: [...s.userEMAs] };
          set((st) => ({ userEMAs: st.userEMAs.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
          const after = get();
          unifiedHistory.push({ kind: "chartState", before, after: { userEMAs: [...after.userEMAs] } });
        } else {
          set((st) => ({ userEMAs: st.userEMAs.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
        }
      },

      toggleUserEMAHidden: (id) => {
        if (!isApplyingHistory) {
          const s = get();
          const before: ChartStateSnapshot = { userEMAs: [...s.userEMAs] };
          set((st) => ({ userEMAs: st.userEMAs.map((e) => (e.id === id ? { ...e, hidden: !e.hidden } : e)) }));
          const after = get();
          unifiedHistory.push({ kind: "chartState", before, after: { userEMAs: [...after.userEMAs] } });
        } else {
          set((st) => ({ userEMAs: st.userEMAs.map((e) => (e.id === id ? { ...e, hidden: !e.hidden } : e)) }));
        }
      },

      setAdxStyle: (patch) => {
        if (!isApplyingHistory) {
          const s = get();
          const before: ChartStateSnapshot = { adxStyle: { ...s.adxStyle } };
          set((st) => ({ adxStyle: { ...st.adxStyle, ...patch } }));
          const after = get();
          unifiedHistory.push({ kind: "chartState", before, after: { adxStyle: { ...after.adxStyle } } });
        } else {
          set((st) => ({ adxStyle: { ...st.adxStyle, ...patch } }));
        }
      },

      setKeyLevels: (patch) => set((st) => ({
        keyLevels: {
          ...st.keyLevels,
          ...patch,
          daily:     { ...st.keyLevels.daily,     ...(patch.daily     ?? {}) },
          monday:    { ...st.keyLevels.monday,    ...(patch.monday    ?? {}) },
          weekly:    { ...st.keyLevels.weekly,    ...(patch.weekly    ?? {}) },
          monthly:   { ...st.keyLevels.monthly,   ...(patch.monthly   ?? {}) },
          quarterly: { ...st.keyLevels.quarterly, ...(patch.quarterly ?? {}) },
          yearly:    { ...st.keyLevels.yearly,    ...(patch.yearly    ?? {}) },
          fourHour:  { ...st.keyLevels.fourHour,  ...(patch.fourHour  ?? {}) },
        },
      })),

      setSqueezeStyle: (patch) => {
        if (!isApplyingHistory) {
          const s = get();
          const before: ChartStateSnapshot = { squeezeStyle: { ...s.squeezeStyle } };
          set((st) => ({ squeezeStyle: { ...st.squeezeStyle, ...patch } }));
          const after = get();
          unifiedHistory.push({ kind: "chartState", before, after: { squeezeStyle: { ...after.squeezeStyle } } });
        } else {
          set((st) => ({ squeezeStyle: { ...st.squeezeStyle, ...patch } }));
        }
      },

      setLogScale: (logScale) => {
        if (!isApplyingHistory) {
          const before: ChartStateSnapshot = { logScale: get().logScale };
          set({ logScale });
          unifiedHistory.push({ kind: "chartState", before, after: { logScale } });
        } else {
          set({ logScale });
        }
      },

      setIndicatorLogScale: (key, v) => {
        if (!isApplyingHistory) {
          const s = get();
          const before: ChartStateSnapshot = { indicatorLogScale: { ...s.indicatorLogScale } };
          set((st) => ({ indicatorLogScale: { ...st.indicatorLogScale, [key]: v } }));
          const after = get();
          unifiedHistory.push({ kind: "chartState", before, after: { indicatorLogScale: { ...after.indicatorLogScale } } });
        } else {
          set((st) => ({ indicatorLogScale: { ...st.indicatorLogScale, [key]: v } }));
        }
      },

      setVisibleBars: (visibleBars) => set({ visibleBars }),
      setPillsCollapsed: (pillsCollapsed) => set({ pillsCollapsed }),
      setSubPanesHidden: (subPanesHidden) => set({ subPanesHidden }),
      toggleSubPanesHidden: () => set((s) => ({ subPanesHidden: !s.subPanesHidden })),

      setIndicatorOverlay: (key, target) => {
        if (!isApplyingHistory) {
          const s = get();
          const before: ChartStateSnapshot = { indicatorOverlays: { ...s.indicatorOverlays } };
          set((st) => ({ indicatorOverlays: { ...st.indicatorOverlays, [key]: target } }));
          const after = get();
          unifiedHistory.push({ kind: "chartState", before, after: { indicatorOverlays: { ...after.indicatorOverlays } } });
        } else {
          set((st) => ({ indicatorOverlays: { ...st.indicatorOverlays, [key]: target } }));
        }
      },

      setPaneZOrder: (host, order) =>
        set((st) => ({ paneZOrder: { ...st.paneZOrder, [host]: order } })),

      setPinnedTimeframes: (pinnedTimeframes) => set({ pinnedTimeframes }),

      applySnapshot: (snap) => {
        withoutHistory(() => {
          const patch: Partial<ChartState> = {};
          if (snap.indicators !== undefined) patch.indicators = snap.indicators;
          if (snap.hidden !== undefined) patch.hidden = snap.hidden;
          if (snap.config !== undefined) patch.config = snap.config;
          if (snap.userEMAs !== undefined) patch.userEMAs = snap.userEMAs;
          if (snap.adxStyle !== undefined) patch.adxStyle = snap.adxStyle;
          if (snap.squeezeStyle !== undefined) patch.squeezeStyle = snap.squeezeStyle;
          if (snap.logScale !== undefined) patch.logScale = snap.logScale;
          if (snap.indicatorLogScale !== undefined) patch.indicatorLogScale = snap.indicatorLogScale;
          if (snap.indicatorOverlays !== undefined) patch.indicatorOverlays = snap.indicatorOverlays;
          set(patch as Partial<ChartState>);
        });
      },
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
      reorderWatchlistItems: (watchlistId, fromId, toId) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) => {
            if (w.id !== watchlistId) return w;
            const from = w.items.findIndex((i) => i.id === fromId);
            const to = w.items.findIndex((i) => i.id === toId);
            if (from === -1 || to === -1 || from === to) return w;
            const next = [...w.items];
            const [moved] = next.splice(from, 1);
            next.splice(from < to ? to : to, 0, moved);
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
        adxStyle: s.adxStyle,
        keyLevels: s.keyLevels,
        squeezeStyle: s.squeezeStyle,
        logScale: s.logScale,
        indicatorLogScale: s.indicatorLogScale,
        visibleBars: s.visibleBars,
        pillsCollapsed: s.pillsCollapsed,
        subPanesHidden: s.subPanesHidden,
        indicatorOverlays: s.indicatorOverlays,
        paneZOrder: s.paneZOrder,
        pinnedTimeframes: s.pinnedTimeframes,
        toolDefaults: s.toolDefaults,
        watchlists: s.watchlists,
        activeWatchlistId: s.activeWatchlistId,
        chartColors: s.chartColors,
      }),
    },
  ),
);
