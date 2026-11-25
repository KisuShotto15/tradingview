"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  BaselineSeries,
  HistogramSeries,
  AreaSeries,
  CrosshairMode,
  PriceScaleMode,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
  type MouseEventParams,
} from "lightweight-charts";
import { getBinanceWS } from "@/lib/binance/ws";
import { getBybitWS } from "@/lib/bybit/ws";
import {
  extractSymbols,
  evaluateCandleAt,
} from "@/lib/binance/synthetic";
import { fetchCandles } from "@/lib/data/fetch";
import { resolveSource } from "@/lib/symbols/source";
import { getSymbolInfo } from "@/lib/trading/symbol-info";
import { ema, rsi, macd, obv } from "@/lib/indicators";
import { stochRsi } from "@/lib/indicators/stochrsi";
import { useIsMobile } from "@/hooks/useIsMobile";
import { barCloseTime } from "@/lib/chart/countdown";
import {
  markChartTick,
  resetChartTick,
  chartTickAgeMs,
  CHART_TICK_STALE_MS,
} from "@/lib/feed-status";
import { adx as adxCalc } from "@/lib/indicators/adx";
import { squeezeMomentum } from "@/lib/indicators/squeeze";
import { vwapBands } from "@/lib/indicators/vwap";
import { SqueezeOverlay } from "./SqueezeOverlay";
import { vumanchu as vumanchuCalc } from "@/lib/indicators/vumanchu";
import type { Candle, Timeframe } from "@/lib/binance/types";
import {
  INDICATOR_COLORS,
  useChartStore,
  type IndicatorKey,
  DEFAULT_CHART_COLORS,
} from "@/lib/store/chart-store";
import { formatPrice, formatVolume, priceFormatFor } from "@/lib/format";
import { ArrowUpDown, Bell, ChevronUp, Maximize2, Settings2 } from "lucide-react";
import { IndicatorPill } from "./IndicatorPill";
import { MeasureOverlay } from "./MeasureOverlay";
import { DrawingsLayer } from "./drawings/DrawingsLayer";
import { PlacementPreview, MagnetIndicator } from "./PlacementPreview";
import { OrderLinesLayer } from "@/components/trading/OrderLinesLayer";
import { BuySellOverlay } from "@/components/trading/BuySellOverlay";
import { FloatingContextToolbar } from "./FloatingContextToolbar";
import { BarCountdown } from "./BarCountdown";
import { KeyLevelsOverlay } from "./KeyLevelsOverlay";
import { computeKeyLevels } from "@/lib/indicators/keylevels";
import type { SqueezePoint } from "@/lib/indicators/squeeze";
import { xToTime, timeToX, timeframeToSeconds, timeframeLabel } from "@/lib/chart/coords";
import { getTvColors } from "@/lib/chart/theme";
import { useReplayStore } from "@/lib/replay/replay-store";
import { ReplayToolbar } from "./ReplayToolbar";
import { candlesRef as globalCandlesRef } from "@/lib/chart/candles-ref";
import { magnetSnap } from "@/lib/chart/magnet";
import { useDrawings } from "@/lib/supabase/use-drawings";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { unifiedHistory, registerViewportApplier, isApplyingHistory } from "@/lib/history";
import { registerPricePerPixel } from "@/lib/chart/nudge";
import { registerChartCapture, composeChartPng } from "@/lib/chart/snapshot";
import { generateId, FIB_LEVELS_DEFAULT } from "@/lib/drawings/types";
import { FIB_EXT_RATIOS_DEFAULT } from "@/lib/drawings/fib";
import { useAlertMonitor } from "@/hooks/useAlertMonitor";

interface MeasurePoint {
  time: number;
  price: number;
}
interface MeasureState {
  phase: "idle" | "placing" | "done";
  a: MeasurePoint | null;
  b: MeasurePoint | null;
}
const INITIAL_MEASURE: MeasureState = { phase: "idle", a: null, b: null };

function durationLabel(aTime: number, bTime: number): string {
  const diff = Math.abs(bTime - aTime);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

interface Props {
  symbol: string;
  timeframe: Timeframe;
}

// Palette lives in globals.css (`--color-tv-*`); read it once so the chart
// canvas stays in sync with the CSS/Tailwind theme. See src/lib/chart/theme.ts.
const TV_COLORS = getTvColors();

// Tools whose second point snaps to a horizontal/vertical axis while Shift is held.
const AXIS_CONSTRAIN_TOOLS = new Set<string>(["trendline", "ray", "arrow"]);

/**
 * With Shift held, snap `cur` to a horizontal or vertical line relative to
 * `first` — whichever the drag is closer to, measured in screen pixels (so the
 * decision isn't skewed by price/time having wildly different scales).
 */
function constrainToAxis(
  chart: IChartApi,
  candleSeries: ISeriesApi<"Candlestick">,
  candles: Candle[],
  intervalSec: number,
  first: { time: number; price: number },
  cur: { time: number; price: number },
): { time: number; price: number } {
  const fx = timeToX(chart, first.time, candles, intervalSec);
  const fy = candleSeries.priceToCoordinate(first.price);
  const cx = timeToX(chart, cur.time, candles, intervalSec);
  const cy = candleSeries.priceToCoordinate(cur.price);
  if (fx === null || fy === null || cx === null || cy === null) return cur;
  return Math.abs(cx - fx) >= Math.abs(cy - fy)
    ? { time: cur.time, price: first.price } // horizontal
    : { time: first.time, price: cur.price }; // vertical
}

// Shared row style for the chart right-click context menu.
const MENU_ITEM_CLS =
  "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs text-tv-text hover:bg-tv-panel-hover";

interface HoverInfo {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  time: number;
  pct: number;
}

interface LastValues {
  rsi?: number;
  stochRsiK?: number;
  stochRsiD?: number;
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
  volume?: number;
}

/**
 * RSI pane palette.
 *
 * The pane is built entirely out of `BaselineSeries` rather than a custom SVG
 * overlay: a baseline series fills between its data and a `baseValue` with a
 * gradient, which is exactly the two things this design needs — a soft fill
 * where the line pushes past 70/30, and flat rectangles for the static bands
 * (fed a constant series, so the "fill" is a plain rectangle). Doing it with
 * series means the library handles pan, zoom and rescale; an overlay would
 * have to recompute geometry on every one of those.
 *
 * Reds and greens are the same ones the VWAP bands use, so the two studies
 * don't disagree about what "overbought" looks like.
 */
/**
 * How long past a bar's close the chart may go without its successor before
 * the data is treated as stale. Generous enough not to fire on a slow tick at
 * a bar boundary; short enough that a frozen chart repairs itself in seconds.
 */
const STALE_BAR_GRACE_SEC = 30;
const STALE_BAR_CHECK_MS = 5_000;
/** Floor between forced resubscriptions, so a stream that stays quiet for a
 *  real reason (a genuinely dead market, a blocked host) can't turn into a
 *  reconnect loop. */
const RESUBSCRIBE_MIN_GAP_MS = 60_000;

const RSI_LINE_COLOR = "#ffffff";
const RSI_MA_COLOR = "#e3a33d";
/** Tint over the 30..70 middle, where the RSI is saying nothing in particular. */
const RSI_BAND_FILL = "rgba(124, 92, 214, 0.13)";
/** Flat rectangles for the extreme zones. */
const RSI_ZONE_UP_FILL = "rgba(229, 72, 77, 0.26)";
const RSI_ZONE_DOWN_FILL = "rgba(47, 168, 79, 0.26)";
/** Gradient where the line itself leaves the 30..70 band: strong at the
 *  excursion's tip, fading to nothing at the level it crossed. */
const RSI_SPIKE_UP_STRONG = "rgba(229, 72, 77, 0.95)";
const RSI_SPIKE_UP_FADE = "rgba(229, 72, 77, 0.00)";
const RSI_SPIKE_DOWN_STRONG = "rgba(47, 168, 79, 0.95)";
const RSI_SPIKE_DOWN_FADE = "rgba(47, 168, 79, 0.00)";
/** SMA over an already-computed indicator series. The primitives in
 *  `@/lib/indicators` all read `.close` off candles, so they can't smooth the
 *  RSI's own output. */
function smaOf(
  src: { time: number; value: number }[],
  period: number,
): { time: number; value: number }[] {
  if (period <= 1) return src;
  const out: { time: number; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i].value;
    if (i >= period) sum -= src[i - period].value;
    if (i >= period - 1) out.push({ time: src[i].time, value: sum / period });
  }
  return out;
}

const RSI_RAIL_COLOR = "rgba(180, 176, 200, 0.45)";

/**
 * Stochastic RSI pane constants.
 *
 * K/D use TradingView's own built-in colours rather than `INDICATOR_COLORS`,
 * which holds one colour per indicator and cannot express a two-line study.
 * The 20/80 rails are the conventional levels for this oscillator — not the
 * RSI's 30/70, because Stoch RSI spends most of its life pinned at the
 * extremes and 30/70 would flag almost every bar.
 */
const STOCH_RSI_K_COLOR = "#2962ff";
const STOCH_RSI_D_COLOR = "#ff6d00";
const STOCH_RSI_OVERSOLD = 20;
const STOCH_RSI_OVERBOUGHT = 80;

interface PaneOffset {
  top: number;
  height: number;
}

export function PriceChart({ symbol, timeframe }: Props) {
  const isMobile = useIsMobile();
  /**
   * How much taller the price pane is than one sub-pane.
   *
   * 3 leaves the price pane at 60% with two studies open, which is fine on a
   * desktop plot and cramped on a phone; 5 puts it at ~71%, which is the
   * share a mobile charting app gives the candles. Derived from the reactive
   * hook rather than a module-level `window.innerWidth`, so rotating the
   * phone re-applies it.
   */
  const mainPaneStretch = isMobile ? 5 : 3;
  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  /** Per-user EMA instance: id → series */
  const emaSeriesMapRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochRsiKRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochRsiDRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochRsi20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const stochRsi80Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi30Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi70Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiMaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiBandRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const rsiZoneUpRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const rsiZoneDownRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const rsiSpikeUpRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const rsiSpikeDownRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const macdRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  // ADX pane
  const adxRef = useRef<ISeriesApi<"Line"> | null>(null);
  const adxPlusDIRef = useRef<ISeriesApi<"Line"> | null>(null);
  const adxMinusDIRef = useRef<ISeriesApi<"Line"> | null>(null);
  const adxKeyLevelRef = useRef<ISeriesApi<"Line"> | null>(null);
  // Squeeze Momentum pane
  const squeezeHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const squeezeDotsRef = useRef<ISeriesApi<"Line"> | null>(null);
  const squeezeDotsMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  // VuManChu pane
  const vmcWt1Ref = useRef<ISeriesApi<"Area"> | null>(null);
  const vmcWt2Ref = useRef<ISeriesApi<"Area"> | null>(null);
  const vmcVwapRef = useRef<ISeriesApi<"Area"> | null>(null);
  const vmcMfiRef = useRef<ISeriesApi<"Area"> | null>(null);
  const vmcRsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const vmcObRef = useRef<ISeriesApi<"Line"> | null>(null);
  const vmcOsRef = useRef<ISeriesApi<"Line"> | null>(null);
  const vmcZeroRef = useRef<ISeriesApi<"Line"> | null>(null);
  const vmcMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  // OBV pane
  const obvRef = useRef<ISeriesApi<"Line"> | null>(null);
  /** Anchored VWAP: the mean line, plus an [upper, lower] pair per sigma band. */
  const vwapRef = useRef<{
    mean: ISeriesApi<"Line">;
    bands: [ISeriesApi<"Line">, ISeriesApi<"Line">][];
  } | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  // Shape of the current view (bar span + offset from the last bar), kept fresh
  // as the user pans/zooms so it survives a symbol change and can be reapplied
  // to keep the same zoom + scroll position on the next symbol.
  const viewShapeRef = useRef<{ span: number; rightOffset: number } | null>(null);
  // Full candle array snapshot captured when bar replay starts (candlesRef holds
  // the truncated slice while replay is active).
  const replayFullRef = useRef<Candle[]>([]);
  const savedPaneHeightsRef = useRef<number[]>([]);
  /** Previous `subPanesHidden`, so the collapse effect can tell a real
   *  transition from a re-run caused by an indicator being toggled. */
  const prevSubPanesHiddenRef = useRef(false);
  const firstPointRef = useRef<{ time: number; price: number } | null>(null);
  const placementPointsRef = useRef<Array<{ time: number; price: number }>>([]);
  // Last unconstrained cursor (time/price) — lets Shift snap the preview the
  // instant it's pressed, without needing a mouse move.
  const lastCursorRef = useRef<{ time: number; price: number } | null>(null);
  // Tracked Shift state — the chart's crosshair events don't reliably carry the
  // modifier while moving, so we key the axis-constrain off our own ref.
  const shiftHeldRef = useRef(false);
  const chartColorsRef = useRef(DEFAULT_CHART_COLORS);

  const indicators = useChartStore((s) => s.indicators);
  const hidden = useChartStore((s) => s.hidden);
  const config = useChartStore((s) => s.config);
  const userEMAs = useChartStore((s) => s.userEMAs);
  const removeUserEMA = useChartStore((s) => s.removeUserEMA);
  const toggleUserEMAHidden = useChartStore((s) => s.toggleUserEMAHidden);
  const adxStyle = useChartStore((s) => s.adxStyle);
  const squeezeStyle = useChartStore((s) => s.squeezeStyle);
  const indicatorOverlays = useChartStore((s) => s.indicatorOverlays);
  const paneZOrder = useChartStore((s) => s.paneZOrder);
  const setPaneZOrder = useChartStore((s) => s.setPaneZOrder);
  const mainPaneOrder = useChartStore((s) => s.mainPaneOrder);
  const setMainPaneOrder = useChartStore((s) => s.setMainPaneOrder);
  const logScale = useChartStore((s) => s.logScale);
  const indicatorLogScale = useChartStore((s) => s.indicatorLogScale);
  const mainPriceScaleMode = useChartStore((s) => s.mainPriceScaleMode);
  const mainPriceScaleInverted = useChartStore((s) => s.mainPriceScaleInverted);
  const pillsCollapsed = useChartStore((s) => s.pillsCollapsed);
  const subPanesHidden = useChartStore((s) => s.subPanesHidden);
  const showBarCountdown = useChartStore((s) => s.showBarCountdown);
  const vwapStyle = useChartStore((s) => s.vwapStyle);
  const keyLevelsCfg = useChartStore((s) => s.keyLevels);
  const chartColors = useChartStore((s) => s.chartColors);
  chartColorsRef.current = chartColors;
  const chartType = useChartStore((s) => s.chartType);
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const toggleHidden = useChartStore((s) => s.toggleHidden);
  const setSettingsTarget = useChartStore((s) => s.setSettingsTarget);
  const setIndicatorOverlay = useChartStore((s) => s.setIndicatorOverlay);
  const openAlertDialog = useChartStore((s) => s.openAlertDialog);
  const setCurrentLivePrice = useChartStore((s) => s.setCurrentLivePrice);

  // Bar replay state (drives the truncated candle feed below).
  const replayActive = useReplayStore((s) => s.active);
  const replayPicking = useReplayStore((s) => s.picking);
  const replayPlaying = useReplayStore((s) => s.playing);
  const replaySpeed = useReplayStore((s) => s.speed);
  // NOTE: cursorIndex is intentionally NOT subscribed as a selector — it changes
  // up to ~60×/s, and re-rendering this large component per tick crashes the
  // renderer. The feed reads it imperatively and coalesces to one frame (below).
  const drawingsApi = useDrawings();
  // Note: useAlertMonitor relies on lastPrice (state); see below where it's invoked.

  // Refs to avoid recreating subscribeClick on every tool change
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const drawingsApiRef = useRef(drawingsApi);
  drawingsApiRef.current = drawingsApi;
  const setToolRef = useRef(setTool);
  setToolRef.current = setTool;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const configRef = useRef(config);
  configRef.current = config;

  const [chartContextMenu, setChartContextMenu] = useState<{ x: number; y: number; price: number; region: "chart" | "scale" } | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [lastPrice, setLastPrice] = useState<{ value: number; pct: number } | null>(null);
  const [lastValues, setLastValues] = useState<LastValues>({});
  const [paneOffsets, setPaneOffsets] = useState<PaneOffset[]>([]);
  // Whether each pane's price scale is currently in auto-scale mode, so the
  // "A" button can highlight like "L" does — keyed the same as those buttons
  // ("main" | IndicatorKey). Undefined reads as true (the library's default).
  // Re-synced after any mouseup, since dragging the price scale flips this
  // off internally with no public change event to subscribe to.
  const [autoScaleOn, setAutoScaleOn] = useState<Record<string, boolean>>({});
  const [measure, setMeasure] = useState<MeasureState>(INITIAL_MEASURE);
  /** Bumping this tears down and rebuilds the live subscription. Used when
   *  the socket looks healthy but this symbol's stream has gone quiet. */
  const [feedNonce, setFeedNonce] = useState(0);
  const lastResubAtRef = useRef(0);
  const [dragKey, setDragKey] = useState<IndicatorKey | null>(null);
  const pointerDragRef = useRef<{ key: IndicatorKey } | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [previewState, setPreviewState] = useState<{
    first: { time: number; price: number } | null;
    extra: Array<{ time: number; price: number }>;
    cursor: { time: number; price: number } | null;
  } | null>(null);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [magnetTarget, setMagnetTarget] = useState<{ time: number; price: number } | null>(null);
  const [squeezePts, setSqueezePts] = useState<SqueezePoint[]>([]);
  const measureRef = useRef(measure);
  measureRef.current = measure;
  const latestCrosshairParamRef = useRef<MouseEventParams<Time> | null>(null);
  const paneOffsetsRef = useRef(paneOffsets);
  paneOffsetsRef.current = paneOffsets;
  const indicatorPaneIdxRef = useRef<Record<"rsi" | "stochrsi" | "macd" | "adx" | "squeeze" | "vumanchu", number>>(
    { rsi: 1, stochrsi: 2, macd: 3, adx: 4, squeeze: 5, vumanchu: 6 },
  );

  // Drive alerts off the live price tick
  useAlertMonitor(symbol, lastPrice?.value ?? null);

  // Helper — compute pane top offsets from chart layout
  function recomputePaneOffsets() {
    if (!chartRef.current) return;
    const panes = chartRef.current.panes();
    let top = 0;
    const offsets: PaneOffset[] = panes.map((p) => {
      const h = p.getHeight();
      const o = { top, height: h };
      top += h;
      return o;
    });
    setPaneOffsets(offsets);
  }

  // Re-read each pane's actual autoScale flag off its series, so the "A"
  // button's highlight reflects reality after a price-scale drag (which
  // flips it off internally) without a public event to react to instead.
  function resyncAutoScaleStates() {
    const next: Record<string, boolean> = {};
    const bySeries: Record<string, ISeriesApi<SeriesType> | null> = {
      main: candleSeriesRef.current,
      rsi: rsiRef.current,
      stochrsi: stochRsiKRef.current,
      macd: macdRef.current,
      adx: adxRef.current,
      squeeze: squeezeHistRef.current,
      vumanchu: vmcWt2Ref.current,
    };
    for (const [key, s] of Object.entries(bySeries)) {
      if (s) next[key] = s.priceScale().options().autoScale;
    }
    setAutoScaleOn(next);
  }

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const initColors = chartColorsRef.current;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: initColors.bg },
        textColor: TV_COLORS.text,
        fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
        fontSize: 12,
        panes: { separatorColor: TV_COLORS.border, separatorHoverColor: TV_COLORS.border },
      },
      grid: {
        vertLines: { color: initColors.gridLines },
        horzLines: { color: initColors.gridLines },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: TV_COLORS.textMuted, width: 1, style: 3, labelBackgroundColor: TV_COLORS.panel },
        horzLine: { color: TV_COLORS.textMuted, width: 1, style: 3, labelBackgroundColor: TV_COLORS.panel },
      },
      rightPriceScale: {
        borderColor: TV_COLORS.border,
        textColor: TV_COLORS.textMuted,
        // Less headroom above the highest bar (default top is ~0.2, which on a
        // log scale squeezes the candles). Bottom leaves room for the volume overlay.
        scaleMargins: { top: 0.06, bottom: 0.08 },
      },
      timeScale: {
        borderColor: TV_COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
      },
      autoSize: true,
    });

    // PANE 0 — Candles + EMAs
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: initColors.bodyUp,
      downColor: initColors.bodyDown,
      borderUpColor: initColors.borderUp,
      borderDownColor: initColors.borderDown,
      wickUpColor: initColors.wickUp,
      wickDownColor: initColors.wickDown,
      priceLineColor: TV_COLORS.textMuted,
      priceLineStyle: 2,
    });

    const initChartType = useChartStore.getState().chartType;
    lineSeriesRef.current = chart.addSeries(LineSeries, {
      color: "#2962ff",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: initChartType === "line",
    });
    areaSeriesRef.current = chart.addSeries(AreaSeries, {
      lineColor: "#2962ff",
      topColor: "rgba(41,98,255,0.4)",
      bottomColor: "rgba(41,98,255,0.0)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: initChartType === "area",
    });
    if (initChartType !== "candles") {
      candleSeriesRef.current.applyOptions({ visible: false });
    }

    chartRef.current = chart;

    // Click handler — drawing tools
    chart.subscribeClick((param) => {
      if (!param.point || !candleSeriesRef.current) return;
      const rawPrice = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (rawPrice === null || !isFinite(rawPrice as number)) return;
      let price: number = rawPrice as number;

      // Resolve cursor time — extrapolate past last candle if needed
      const intervalSec = timeframeToSeconds(
        useChartStore.getState().timeframe,
      );
      let resolvedTime: number | null = param.time ? Number(param.time) : null;
      if (resolvedTime === null) {
        resolvedTime = xToTime(
          chart,
          param.point.x,
          candlesRef.current,
          intervalSec,
        );
      }

      // Bar-replay start picker: a click chooses the bar to begin replay from.
      if (useReplayStore.getState().picking) {
        const arr = replayFullRef.current.length ? replayFullRef.current : candlesRef.current;
        if (resolvedTime !== null && arr.length) {
          let idx = arr.findIndex((c) => c.time >= resolvedTime!);
          if (idx === -1) idx = arr.length - 1;
          useReplayStore.getState().setTotal(arr.length);
          useReplayStore.getState().setStart(idx);
          // Deliberately do NOT move the viewport: the later candles just vanish
          // in place, leaving room to the right for replay to reveal them.
        }
        return;
      }

      // Magnet: Ctrl held, or the persistent magnet-mode toggle → snap price
      // to the nearest candle OHLC or other drawing's level
      if (
        (param.sourceEvent?.ctrlKey || useChartStore.getState().magnetMode) &&
        resolvedTime !== null
      ) {
        const snapped = magnetSnap(price, resolvedTime, candlesRef.current);
        if (snapped !== null) price = snapped;
      }

      // Measure dismiss: any non-shift click in "done" phase clears it
      // (Shift+click is handled by capture-phase listener on outerRef)
      if (measureRef.current.phase === "done" && !param.sourceEvent?.shiftKey) {
        setMeasure(INITIAL_MEASURE);
      }

      // Cursor click on empty chart area → deselect any selected drawing
      if (toolRef.current === "cursor") {
        useDrawingsStore.getState().setSelected(null);
        return;
      }

      if (toolRef.current === "hline") {
        void drawingsApiRef.current.add({
          id: generateId(),
          kind: "hline",
          symbol: symbolRef.current,
          price,
          ...(useChartStore.getState().toolDefaults["hline"] ?? {}),
        });
        setToolRef.current("cursor");
        return;
      }

      if (toolRef.current === "vline") {
        if (resolvedTime === null) return;
        void drawingsApiRef.current.add({
          id: generateId(),
          kind: "vline",
          symbol: symbolRef.current,
          time: resolvedTime,
          ...(useChartStore.getState().toolDefaults["vline"] ?? {}),
        });
        setToolRef.current("cursor");
        return;
      }

      if (toolRef.current === "hray") {
        if (resolvedTime === null) return;
        void drawingsApiRef.current.add({
          id: generateId(),
          kind: "hray",
          symbol: symbolRef.current,
          anchor: { time: resolvedTime, price },
          ...(useChartStore.getState().toolDefaults["hray"] ?? {}),
        });
        setToolRef.current("cursor");
        return;
      }

      if (toolRef.current === "text") {
        if (resolvedTime === null) return;
        void drawingsApiRef.current.add({
          id: generateId(),
          kind: "text",
          symbol: symbolRef.current,
          anchor: { time: resolvedTime, price },
          text: "",
          ...(useChartStore.getState().toolDefaults["text"] ?? {}),
        } as Parameters<typeof drawingsApiRef.current.add>[0]);
        setToolRef.current("cursor");
        return;
      }

      // Callout: click 1 = the point it marks, click 2 = the text-box position.
      if (toolRef.current === "callout") {
        if (resolvedTime === null) return;
        const time = resolvedTime;
        const first = firstPointRef.current;
        if (!first) {
          firstPointRef.current = { time, price };
          setPreviewState({ first: { time, price }, extra: [], cursor: { time, price } });
        } else {
          void drawingsApiRef.current.add({
            id: generateId(),
            kind: "callout",
            symbol: symbolRef.current,
            anchor: first,
            target: { time, price },
            text: "",
            ...(useChartStore.getState().toolDefaults["callout"] ?? {}),
          } as Parameters<typeof drawingsApiRef.current.add>[0]);
          firstPointRef.current = null;
          setPreviewState(null);
          setToolRef.current("cursor");
        }
        return;
      }

      // XABCD harmonic: five clicks (X, A, B, C, D).
      if (toolRef.current === "xabcd") {
        if (resolvedTime === null) return;
        const time = resolvedTime;
        placementPointsRef.current.push({ time, price });
        if (placementPointsRef.current.length >= 5) {
          void drawingsApiRef.current.add({
            id: generateId(),
            kind: "xabcd",
            symbol: symbolRef.current,
            points: [...placementPointsRef.current],
            ...(useChartStore.getState().toolDefaults["xabcd"] ?? {}),
          } as Parameters<typeof drawingsApiRef.current.add>[0]);
          placementPointsRef.current = [];
          setPreviewState(null);
          setToolRef.current("cursor");
        } else {
          const pts = placementPointsRef.current;
          setPreviewState({ first: pts[0] ?? null, extra: pts.slice(1), cursor: { time, price } });
        }
        return;
      }

      if (
        toolRef.current === "trendline" ||
        toolRef.current === "ray" ||
        toolRef.current === "arrow"
      ) {
        if (resolvedTime === null) return;
        const time = resolvedTime;
        const first = firstPointRef.current;
        const kind = toolRef.current;
        if (!first) {
          firstPointRef.current = { time, price };
          setPreviewState({ first: { time, price }, extra: [], cursor: { time, price } });
        } else {
          let b = { time, price };
          if ((shiftHeldRef.current || param.sourceEvent?.shiftKey) && candleSeriesRef.current) {
            b = constrainToAxis(chart, candleSeriesRef.current, candlesRef.current, intervalSec, first, b);
          }
          void drawingsApiRef.current.add({
            id: generateId(),
            kind,
            symbol: symbolRef.current,
            a: first,
            b,
            ...(useChartStore.getState().toolDefaults[kind] ?? {}),
          } as Parameters<typeof drawingsApiRef.current.add>[0]);
          firstPointRef.current = null;
          setPreviewState(null);
          setToolRef.current("cursor");
        }
        return;
      }

      if (toolRef.current === "long" || toolRef.current === "short") {
        if (resolvedTime === null) return;
        const time = resolvedTime;
        const kind = toolRef.current;
        const entry = price;
        // Default distance: ~8% of visible price range so the box is proportional on screen
        const mainPaneH = paneOffsetsRef.current[0]?.height ?? 400;
        const priceTop = candleSeriesRef.current?.coordinateToPrice(10) ?? null;
        const priceBot = candleSeriesRef.current?.coordinateToPrice(mainPaneH - 10) ?? null;
        const visibleRange =
          priceTop !== null && priceBot !== null
            ? Math.abs((priceTop as number) - (priceBot as number))
            : null;
        const dist = visibleRange ? visibleRange * 0.16 : Math.abs(entry) * 0.01 || 1;
        const target = kind === "long" ? entry + dist : entry - dist;
        const stop = kind === "long" ? entry - dist : entry + dist;
        const intervalSec = timeframeToSeconds(
          useChartStore.getState().timeframe,
        );
        // Default width: fixed pixel target so the box looks the same regardless of zoom/timeframe
        const tsOpts = chart.timeScale().options() as { barSpacing?: number };
        const barSpacing = tsOpts.barSpacing ?? 8;
        const widthBars = Math.max(3, Math.round(144 / barSpacing));
        const timeB = time + widthBars * intervalSec;
        const defaults = useChartStore.getState().toolDefaults[kind] ?? {};
        void drawingsApiRef.current.add({
          id: generateId(),
          kind,
          symbol: symbolRef.current,
          entry,
          stop,
          target,
          timeA: time,
          timeB,
          ...defaults,
        } as Parameters<typeof drawingsApiRef.current.add>[0]);
        firstPointRef.current = null;
        setPreviewState(null);
        setToolRef.current("cursor");
        return;
      }

      if (toolRef.current === "price-range") {
        if (resolvedTime === null) return;
        const time = resolvedTime;
        const first = firstPointRef.current;
        if (!first) {
          firstPointRef.current = { time, price };
          setPreviewState({ first: { time, price }, extra: [], cursor: { time, price } });
        } else {
          void drawingsApiRef.current.add({
            id: generateId(),
            kind: "price-range",
            symbol: symbolRef.current,
            priceA: first.price,
            priceB: price,
            timeA: first.time,
            timeB: time,
            ...(useChartStore.getState().toolDefaults["price-range"] ?? {}),
          });
          firstPointRef.current = null;
          setPreviewState(null);
          setToolRef.current("cursor");
        }
        return;
      }

      if (toolRef.current === "rectangle") {
        if (resolvedTime === null) return;
        const time = resolvedTime;
        const first = firstPointRef.current;
        if (!first) {
          firstPointRef.current = { time, price };
          setPreviewState({ first: { time, price }, extra: [], cursor: { time, price } });
        } else {
          void drawingsApiRef.current.add({
            id: generateId(),
            kind: "rectangle",
            symbol: symbolRef.current,
            a: { time: first.time, price: first.price },
            b: { time, price },
            ...(useChartStore.getState().toolDefaults["rectangle"] ?? {}),
          });
          firstPointRef.current = null;
          setPreviewState(null);
          setToolRef.current("cursor");
        }
        return;
      }

      if (toolRef.current === "date-range") {
        if (resolvedTime === null) return;
        const time = resolvedTime;
        const first = firstPointRef.current;
        if (!first) {
          firstPointRef.current = { time, price };
          setPreviewState({ first: { time, price }, extra: [], cursor: { time, price } });
        } else {
          void drawingsApiRef.current.add({
            id: generateId(),
            kind: "date-range",
            symbol: symbolRef.current,
            timeA: first.time,
            timeB: time,
            ...(useChartStore.getState().toolDefaults["date-range"] ?? {}),
          });
          firstPointRef.current = null;
          setPreviewState(null);
          setToolRef.current("cursor");
        }
        return;
      }

      if (toolRef.current === "fib-retracement") {
        if (resolvedTime === null) return;
        const time = resolvedTime;
        const first = firstPointRef.current;
        if (!first) {
          firstPointRef.current = { time, price };
          setPreviewState({ first: { time, price }, extra: [], cursor: { time, price } });
        } else {
          void drawingsApiRef.current.add({
            id: generateId(),
            kind: "fib-retracement",
            symbol: symbolRef.current,
            a: first,
            b: { time, price },
            levels: [...FIB_LEVELS_DEFAULT],
            ...(useChartStore.getState().toolDefaults["fib-retracement"] ?? {}),
          });
          firstPointRef.current = null;
          setPreviewState(null);
          setToolRef.current("cursor");
        }
        return;
      }

      if (
        toolRef.current === "parallel-channel" ||
        toolRef.current === "fib-extension" ||
        toolRef.current === "pitchfork"
      ) {
        if (resolvedTime === null) return;
        const time = resolvedTime;
        const kind = toolRef.current;
        placementPointsRef.current.push({ time, price });
        if (placementPointsRef.current.length >= 3) {
          const [a, b, c] = placementPointsRef.current;
          void drawingsApiRef.current.add({
            id: generateId(),
            kind,
            symbol: symbolRef.current,
            a,
            b,
            c,
            ...(kind === "fib-extension" ? { levels: FIB_EXT_RATIOS_DEFAULT } : {}),
            ...(useChartStore.getState().toolDefaults[kind] ?? {}),
          } as Parameters<typeof drawingsApiRef.current.add>[0]);
          placementPointsRef.current = [];
          setPreviewState(null);
          setToolRef.current("cursor");
        } else {
          // Update preview with the new accumulated point
          const pts = placementPointsRef.current;
          setPreviewState({
            first: pts[0] ?? null,
            extra: pts.slice(1),
            cursor: { time, price },
          });
        }
        return;
      }

      if (toolRef.current === "measure") {
        if (resolvedTime === null) return;
        const time = resolvedTime;
        const current = measureRef.current;
        if (current.phase === "idle") {
          setMeasure({
            phase: "placing",
            a: { time, price },
            b: { time, price },
          });
        } else if (current.phase === "placing") {
          setMeasure({
            phase: "done",
            a: current.a,
            b: { time, price },
          });
        } else {
          setMeasure({
            phase: "placing",
            a: { time, price },
            b: { time, price },
          });
        }
      }
    });

    // Crosshair handler
    chart.subscribeCrosshairMove((param) => {
      latestCrosshairParamRef.current = param;
      // Compute the cursor's (time, price) — used by placement preview + magnet
      let cursorTime: number | null = null;
      let cursorPrice: number | null = null;
      if (param.point && candleSeriesRef.current) {
        const p = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (p !== null && isFinite(p as number)) {
          cursorPrice = p as number;
          if (param.time) {
            cursorTime = Number(param.time);
          } else {
            // Past last candle / before first — extrapolate
            const intervalSec = timeframeToSeconds(
              useChartStore.getState().timeframe,
            );
            cursorTime = xToTime(
              chart,
              param.point.x,
              candlesRef.current,
              intervalSec,
            );
          }
        }
      }

      // Magnet target: when Ctrl is held (or magnet mode is on) + tool active
      // + cursor over chart
      const t = toolRef.current;
      const tracksMagnet =
        t !== "cursor" &&
        t !== "eraser" &&
        cursorTime !== null &&
        cursorPrice !== null;
      const magnetActive = param.sourceEvent?.ctrlKey || useChartStore.getState().magnetMode;
      if (magnetActive && tracksMagnet) {
        const snapped = magnetSnap(cursorPrice!, cursorTime!, candlesRef.current);
        setMagnetTarget({ time: cursorTime!, price: snapped ?? cursorPrice! });
      } else {
        setMagnetTarget((prev) => (prev === null ? prev : null));
      }

      // Measure preview — works for both the measure tool and Shift+Click shortcut
      if (
        (toolRef.current === "measure" || measureRef.current.phase === "placing") &&
        measureRef.current.phase === "placing" &&
        cursorTime !== null &&
        cursorPrice !== null
      ) {
        setMeasure((prev) =>
          prev.phase === "placing"
            ? { ...prev, b: { time: cursorTime!, price: cursorPrice! } }
            : prev,
        );
      }

      // Drawing-tool placement preview (follow cursor between clicks)
      if (cursorTime !== null && cursorPrice !== null) {
        lastCursorRef.current = { time: cursorTime, price: cursorPrice };
        // Apply snap to preview cursor if Ctrl held
        let pc: { time: number; price: number } = { time: cursorTime, price: cursorPrice };
        if (magnetActive) {
          const snapped = magnetSnap(cursorPrice, cursorTime, candlesRef.current);
          if (snapped !== null) pc = { time: cursorTime, price: snapped };
        }
        // Shift held → constrain the preview to horizontal/vertical for line tools.
        // Uses our tracked ref because the chart's move events don't reliably
        // carry the modifier state.
        if (
          shiftHeldRef.current &&
          firstPointRef.current &&
          AXIS_CONSTRAIN_TOOLS.has(toolRef.current) &&
          candleSeriesRef.current
        ) {
          const intervalSec = timeframeToSeconds(useChartStore.getState().timeframe);
          pc = constrainToAxis(chart, candleSeriesRef.current, candlesRef.current, intervalSec, firstPointRef.current, pc);
        }
        setPreviewState((prev) => (prev ? { ...prev, cursor: pc } : prev));
      }

      if (!param.time || !candleSeriesRef.current) {
        setHover(null);
        return;
      }
      const data = param.seriesData.get(candleSeriesRef.current);
      const vol = volumeSeriesRef.current
        ? param.seriesData.get(volumeSeriesRef.current)
        : null;
      if (data && "open" in data) {
        const o = data.open as number;
        const c = data.close as number;
        setHover({
          o,
          h: data.high as number,
          l: data.low as number,
          c,
          v: vol && "value" in vol ? (vol.value as number) : 0,
          time: Number(param.time),
          pct: o === 0 ? 0 : ((c - o) / o) * 100,
        });
      }
    });

    // Re-render the SVG overlays (drawings, order lines, measure) on pan / zoom
    // so their pixel coords stay in sync with the chart's own canvas. A plain
    // setState here lags visibly behind the chart during a drag: the canvas
    // repaints synchronously/immediately as lightweight-charts handles the
    // pointer event, while a normal React state update is flushed on a later
    // tick. flushSync forces the overlay's re-render (and DOM commit) to
    // happen in the same tick as the chart's own update, eliminating the lag.
    const bumpRenderTick = () => flushSync(() => setRenderTick((t) => t + 1));
    const tsRangeHandler = () => bumpRenderTick();
    chart.timeScale().subscribeVisibleTimeRangeChange(tsRangeHandler);
    // Register viewport applier so undo/redo can restore pan/zoom
    registerViewportApplier((range) => {
      chart.timeScale().setVisibleLogicalRange({ from: range.from, to: range.to });
    });

    // Expose a snapshot capture that composites the chart canvas with the SVG
    // overlays, so UI elsewhere (the header button) can grab the annotated view.
    registerChartCapture(async () => {
      const root = outerRef.current;
      if (!root) return null;
      return composeChartPng(chart, root);
    });

    // Expose the vertical scale so keyboard nudging can move a drawing by whole
    // pixels regardless of the symbol's price magnitude.
    registerPricePerPixel(() => {
      const series = candleSeriesRef.current;
      if (!series) return null;
      const top = series.coordinateToPrice(100);
      const bottom = series.coordinateToPrice(200);
      if (top === null || bottom === null) return null;
      const perPixel = Math.abs((top as number) - (bottom as number)) / 100;
      return perPixel > 0 ? perPixel : null;
    });

    let zoomSaveTimer: ReturnType<typeof setTimeout> | null = null;
    let lastViewport: { from: number; to: number } | null = null;
    const logicalRangeHandler = () => {
      bumpRenderTick();
      // Keep the view shape fresh (span + right offset) while there is real data,
      // so a later symbol change can reproduce the same zoom + scroll position.
      const liveRange = chart.timeScale().getVisibleLogicalRange();
      if (liveRange && liveRange.to > liveRange.from && candlesRef.current.length > 0) {
        viewShapeRef.current = {
          span: liveRange.to - liveRange.from,
          rightOffset: liveRange.to - (candlesRef.current.length - 1),
        };
      }
      if (zoomSaveTimer) clearTimeout(zoomSaveTimer);
      zoomSaveTimer = setTimeout(() => {
        const range = chart.timeScale().getVisibleLogicalRange();
        if (!range || range.to <= range.from) return;
        const bars = Math.round(range.to - range.from);
        if (bars >= 5 && bars <= 5000) {
          useChartStore.getState().setVisibleBars(bars);
        }
        // Push viewport op to unified history (skip during undo/redo application)
        if (!isApplyingHistory) {
          const before = lastViewport ?? { from: range.from, to: range.to };
          const after = { from: range.from, to: range.to };
          if (Math.abs(before.from - after.from) > 0.5 || Math.abs(before.to - after.to) > 0.5) {
            unifiedHistory.push({ kind: "viewport", before, after });
          }
        }
        lastViewport = { from: range.from, to: range.to };
      }, 600);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(logicalRangeHandler);

    // ResizeObserver — recompute pane offsets when chart container resizes
    const ro = new ResizeObserver((entries) => {
      requestAnimationFrame(() => recomputePaneOffsets());
      const cr = entries[0]?.contentRect;
      if (cr) setContainerSize({ width: cr.width, height: cr.height });
    });
    ro.observe(containerRef.current);
    // mouseup on the chart container catches pane-separator drag-resizes
    // (ResizeObserver only fires on container resize, not internal pane layout changes)
    const onPaneMouseUp = () =>
      requestAnimationFrame(() => {
        recomputePaneOffsets();
        resyncAutoScaleStates();
      });
    containerRef.current.addEventListener("mouseup", onPaneMouseUp);

    // Right-click context menu — "Add alert at [price]"
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (!candleSeriesRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const price = candleSeriesRef.current.coordinateToPrice(y);
      if (price === null || isNaN(price as number)) return;
      // Right of the time-scale width = over the price scale (different menu).
      const region: "chart" | "scale" = x > chart.timeScale().width() ? "scale" : "chart";
      setChartContextMenu({ x, y, price: price as number, region });
    };
    containerRef.current.addEventListener("contextmenu", onContextMenu);

    recomputePaneOffsets();
    const initRect = containerRef.current.getBoundingClientRect();
    setContainerSize({ width: initRect.width, height: initRect.height });

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(tsRangeHandler);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(logicalRangeHandler);
      ro.disconnect();
      containerRef.current?.removeEventListener("mouseup", onPaneMouseUp);
      containerRef.current?.removeEventListener("contextmenu", onContextMenu);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      lineSeriesRef.current = null;
      areaSeriesRef.current = null;
      volumeSeriesRef.current = null;
      emaSeriesMapRef.current.clear();
      // The chart owns these series; dropping the handles keeps a remount from
      // reusing ones that belong to a chart that no longer exists.
      vwapRef.current = null;
      rsiRef.current = null;
      rsi30Ref.current = null;
      rsi70Ref.current = null;
      macdRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
    };
  }, []);

  // Switch chart display type (candles / line / area)
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    candleSeriesRef.current.applyOptions({ visible: chartType === "candles" });
    lineSeriesRef.current?.applyOptions({ visible: chartType === "line" });
    areaSeriesRef.current?.applyOptions({ visible: chartType === "area" });
  }, [chartType]);

  // Double-click to open indicator settings
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onDblClick(e: MouseEvent) {
      if (toolRef.current !== "cursor") return;
      const rect = el!.getBoundingClientRect();
      const relY = e.clientY - rect.top;

      const offsets = paneOffsetsRef.current;
      let clickedPane = 0;
      for (let i = 0; i < offsets.length; i++) {
        if (relY >= offsets[i].top && relY < offsets[i].top + offsets[i].height) {
          clickedPane = i;
          break;
        }
      }

      const state = useChartStore.getState();

      if (clickedPane === 0) {
        // Main pane: open EMA settings if click is near a line (within 10px)
        const param = latestCrosshairParamRef.current;
        if (param) {
          for (const [id, series] of emaSeriesMapRef.current) {
            const data = param.seriesData.get(series);
            if (data && "value" in data) {
              const yCoord = series.priceToCoordinate(data.value as number);
              if (yCoord !== null && Math.abs(yCoord - relY) <= 10) {
                state.setSettingsTarget({ kind: "ema", id });
                return;
              }
            }
          }
        }
        // Open Key Levels settings if click is near a key level line (within 8px)
        if (state.indicators.keylevels && !state.hidden.keylevels && candleSeriesRef.current) {
          const levels = computeKeyLevels(candlesRef.current, state.keyLevels);
          for (const lvl of levels) {
            const yCoord = candleSeriesRef.current.priceToCoordinate(lvl.price);
            if (yCoord !== null && Math.abs((yCoord as number) - relY) <= 8) {
              state.setSettingsTarget("keylevels");
              return;
            }
          }
        }
        // Double-click on empty background → collapse/restore the indicator
        // sub-panes, the way TradingView maximizes the price pane.
        //
        // Only when nothing is selected and no placement is in flight: a
        // dblclick that lands while a drawing is selected (or mid-draw) is
        // someone deselecting or finishing a shape, and silently hiding every
        // RSI/MACD pane there would feel like a glitch. The drawing layer
        // clears the selection on its own click, so by the time a *second*
        // click arrives on empty background the selection is already null —
        // hence reading it here rather than trusting the first click.
        //
        // Restricted to the plot area: lightweight-charts owns double-click on
        // the price scale (it resets autoscale there), and hijacking it to
        // collapse every pane instead would be the wrong response entirely.
        const plotWidth = chartRef.current?.timeScale().width() ?? rect.width;
        if (e.clientX - rect.left > plotWidth) return;

        const d = useDrawingsStore.getState();
        if (d.selectedId === null && d.placement.draft === null) {
          state.toggleSubPanesHidden();
        }
        return;
      }

      // Sub-pane: find host indicator
      const idxMap = indicatorPaneIdxRef.current;
      let hostKey: IndicatorKey | null = null;
      for (const k of ["rsi", "stochrsi", "macd", "adx", "squeeze", "vumanchu"] as const) {
        if (idxMap[k] === clickedPane && state.indicators[k]) {
          const target = state.indicatorOverlays[k];
          if (!target || target === "own" || !state.indicators[target as IndicatorKey]) {
            hostKey = k;
            break;
          }
        }
      }
      if (!hostKey) return;

      // If ADX is in this pane (possibly as guest), check proximity to its line
      if (idxMap.adx === clickedPane && state.indicators.adx && adxRef.current) {
        const param = latestCrosshairParamRef.current;
        if (param) {
          const data = param.seriesData.get(adxRef.current);
          if (data && "value" in data) {
            const yCoord = adxRef.current.priceToCoordinate(data.value as number);
            if (yCoord !== null && Math.abs(yCoord - relY) <= 10) {
              state.setSettingsTarget("adx");
              return;
            }
          }
        }
      }

      state.setSettingsTarget(hostKey);
    }

    el.addEventListener("dblclick", onDblClick);
    return () => el.removeEventListener("dblclick", onDblClick);
  }, []);

  // Collapse/expand sub-panes (dblclick on empty chart background).
  // setHeight() is clamped to MIN_PANE_HEIGHT=30 inside lightweight-charts.
  // setStretchFactor(0) bypasses that limit → pane renders at the 2px layout minimum.
  // The main pane auto-expands to fill the freed space. No container resize needed.
  //
  // Also re-runs when `indicators` changes, because adding a study while
  // collapsed creates a fresh pane at its default stretch factor — without
  // this it would pop open on its own, contradicting the collapsed state.
  useEffect(() => {
    if (!chartRef.current) return;
    const panes = chartRef.current.panes();
    const wasHidden = prevSubPanesHiddenRef.current;
    prevSubPanesHiddenRef.current = subPanesHidden;

    if (subPanesHidden) {
      panes.forEach((p, i) => {
        if (i === 0) return;
        // Capture only real heights: re-running this while already collapsed
        // would otherwise overwrite every saved factor with 0 and lose them.
        const factor = p.getStretchFactor();
        if (factor > 0) savedPaneHeightsRef.current[i] = factor;
        p.setStretchFactor(0);
      });
    } else if (wasHidden) {
      // Restore only on the collapsed→expanded transition: doing it on every
      // `indicators` change would reset pane heights the user had dragged.
      panes.forEach((p, i) => {
        if (i === 0) return;
        const saved = savedPaneHeightsRef.current[i];
        // Fall back to 1 — the factor the pane-creation code assigns a fresh
        // sub-pane. A pane with nothing saved (collapsed state restored from
        // localStorage, or the study added while collapsed) would otherwise
        // stay at 0 forever: permanently invisible, with no way back.
        p.setStretchFactor(saved && saved > 0 ? saved : 1);
      });
    } else {
      return; // Expanded and staying expanded — leave pane heights alone.
    }
    requestAnimationFrame(() => recomputePaneOffsets());
  }, [subPanesHidden, indicators]);

  // Manage volume — overlay at the bottom of the main pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.volume && !volumeSeriesRef.current) {
      const v = chartRef.current.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
          color: TV_COLORS.textMuted,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        0,
      );
      v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volumeSeriesRef.current = v;
      const data = candlesRef.current.map((k) => ({
        time: k.time as UTCTimestamp,
        value: k.volume,
        color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
      }));
      v.setData(data);
    } else if (!indicators.volume && volumeSeriesRef.current && chartRef.current) {
      chartRef.current.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
  }, [indicators.volume]);

  // RSI pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.rsi && !rsiRef.current) {
      const paneIndex = 1;
      ensurePane(paneIndex);
      const chart = chartRef.current;
      // Creation order is z-order: backdrops, then rails, then the fills, then
      // the lines on top.
      const flatBand = (fill: string) => ({
        baseValue: { type: "price" as const, price: 0 },
        topFillColor1: fill,
        topFillColor2: fill,
        bottomFillColor1: "rgba(0,0,0,0)",
        bottomFillColor2: "rgba(0,0,0,0)",
        topLineColor: "rgba(0,0,0,0)",
        bottomLineColor: "rgba(0,0,0,0)",
        lineWidth: 1 as const,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      // 30..70 tint, and the two solid extreme zones. Each is a constant
      // series filled down to a baseValue, which renders as a rectangle.
      rsiBandRef.current = chart.addSeries(BaselineSeries, flatBand(RSI_BAND_FILL), paneIndex);
      rsiZoneUpRef.current = chart.addSeries(BaselineSeries, flatBand(RSI_ZONE_UP_FILL), paneIndex);
      // The lower zone fills *downwards* from its baseline, so it uses the
      // bottom pair instead.
      rsiZoneDownRef.current = chart.addSeries(
        BaselineSeries,
        {
          ...flatBand("rgba(0,0,0,0)"),
          bottomFillColor1: RSI_ZONE_DOWN_FILL,
          bottomFillColor2: RSI_ZONE_DOWN_FILL,
        },
        paneIndex,
      );

      const rail = {
        color: RSI_RAIL_COLOR,
        lineWidth: 1 as const,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      };
      const r30 = chart.addSeries(LineSeries, rail, paneIndex);
      const r50 = chart.addSeries(LineSeries, rail, paneIndex);
      const r70 = chart.addSeries(LineSeries, rail, paneIndex);

      // The two gradient fills follow the RSI itself. `relativeGradient` ties
      // the gradient to the base value rather than to the pane's edges, so the
      // fade always starts exactly at the level that was crossed.
      rsiSpikeUpRef.current = chart.addSeries(
        BaselineSeries,
        {
          baseValue: { type: "price", price: 70 },
          relativeGradient: true,
          topFillColor1: RSI_SPIKE_UP_STRONG,
          topFillColor2: RSI_SPIKE_UP_FADE,
          bottomFillColor1: "rgba(0,0,0,0)",
          bottomFillColor2: "rgba(0,0,0,0)",
          // The visible line is drawn once, by `rsiRef` below; these two would
          // otherwise paint it three times over, each a different colour.
          topLineColor: "rgba(0,0,0,0)",
          bottomLineColor: "rgba(0,0,0,0)",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        paneIndex,
      );
      rsiSpikeDownRef.current = chart.addSeries(
        BaselineSeries,
        {
          baseValue: { type: "price", price: 30 },
          relativeGradient: true,
          topFillColor1: "rgba(0,0,0,0)",
          topFillColor2: "rgba(0,0,0,0)",
          bottomFillColor1: RSI_SPIKE_DOWN_FADE,
          bottomFillColor2: RSI_SPIKE_DOWN_STRONG,
          topLineColor: "rgba(0,0,0,0)",
          bottomLineColor: "rgba(0,0,0,0)",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        paneIndex,
      );

      rsiMaRef.current = chart.addSeries(
        LineSeries,
        {
          color: RSI_MA_COLOR,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          // No dot under the crosshair: with two lines plus three fills in one
          // short pane, the markers sit on top of the levels being read.
          crosshairMarkerVisible: false,
        },
        paneIndex,
      );
      const r = chart.addSeries(
        LineSeries,
        {
          color: RSI_LINE_COLOR,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        paneIndex,
      );

      rsiRef.current = r;
      rsi30Ref.current = r30;
      rsi50Ref.current = r50;
      rsi70Ref.current = r70;
      try {
        chart.panes()[1]?.setStretchFactor(1);
        chart.panes()[0]?.setStretchFactor(mainPaneStretch);
      } catch {}
      updateRSI();
    } else if (!indicators.rsi && rsiRef.current && chartRef.current) {
      for (const ref of [
        rsiRef, rsi30Ref, rsi50Ref, rsi70Ref, rsiMaRef,
        rsiBandRef, rsiZoneUpRef, rsiZoneDownRef, rsiSpikeUpRef, rsiSpikeDownRef,
      ]) {
        if (ref.current) {
          try { chartRef.current.removeSeries(ref.current); } catch {}
          ref.current = null;
        }
      }
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.rsi]);

  // MACD pane
  useEffect(() => {
    if (!chartRef.current) return;
    // Teardown first, like every other sub-pane: `addSeries` cannot move a
    // series between panes, and another study toggling on or off shifts this
    // one's computed index. The old `if (on && !ref) create` shape silently
    // did nothing on those re-runs, leaving MACD drawn in a pane that now
    // belongs to something else.
    for (const ref of [macdRef, macdSignalRef, macdHistRef]) {
      if (ref.current) {
        try { chartRef.current.removeSeries(ref.current); } catch {}
        ref.current = null;
      }
    }
    if (indicators.macd) {
      const paneIndex = panelIndexFor("macd");
      ensurePane(paneIndex);
      const m = chartRef.current.addSeries(
        LineSeries,
        {
          color: INDICATOR_COLORS.macd,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const s = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.yellow,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const h = chartRef.current.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      macdRef.current = m;
      macdSignalRef.current = s;
      macdHistRef.current = h;
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(mainPaneStretch);
      } catch {}
      updateMACD();
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.macd, indicators.rsi, indicators.stochrsi, indicators.adx, indicators.squeeze, indicators.vumanchu, indicatorOverlays]);

  /**
   * Compute pane index for a sub-chart indicator. Fixed display order:
   *   1: RSI, 2: MACD, 3: ADX, 4: Squeeze, 5: VuManChu
   * Each indicator falls into the next available index based on which higher-priority ones are enabled.
   */
  /**
   * Make sure `index` exists as a pane before a series is added to it.
   *
   * `addSeries(..., paneIndex)` does not create intermediate panes: an index
   * beyond the last existing pane is clamped to the next free one. That bit
   * hard when Stoch RSI was inserted into the ordering — MACD asked for pane
   * 3 while only 0..1 existed, so its *first* series was clamped into pane 2
   * (creating it) and the other two then landed in 3. The result was the MACD
   * line drawn inside the Stoch RSI pane, with that pane's scale blown out to
   * MACD's range, while the histogram sat correctly one pane below.
   *
   * Every sub-pane effect calls this first, so the requested index is always
   * the index actually used, no matter which study mounts first.
   */
  function ensurePane(index: number) {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      while (chart.panes().length <= index) chart.addPane();
    } catch {
      // Older builds without addPane: fall back to the clamping behaviour.
    }
  }

  function panelIndexFor(key: "rsi" | "stochrsi" | "macd" | "adx" | "squeeze" | "vumanchu" | "obv"): number {
    const order: Array<typeof key> = ["rsi", "stochrsi", "macd", "adx", "squeeze", "vumanchu", "obv"];
    const assigned: Record<string, number> = {};
    let idx = 1;
    for (const k of order) {
      const target = indicatorOverlays[k];
      if (target && target !== "own" && indicators[target]) {
        // Share target's pane. If target not yet computed (comes later in order),
        // fall back to current idx — the target will land on the same idx.
        assigned[k] = assigned[target] ?? idx;
      } else {
        assigned[k] = idx;
        if (indicators[k]) idx++;
      }
    }
    return assigned[key];
  }

  // ── ADX pane ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return;
    // Always teardown first so changes to pane assignment (overlays) take effect
    if (adxRef.current) {
      try { chartRef.current.removeSeries(adxRef.current); } catch {}
      adxRef.current = null;
    }
    if (adxPlusDIRef.current) {
      try { chartRef.current.removeSeries(adxPlusDIRef.current); } catch {}
      adxPlusDIRef.current = null;
    }
    if (adxMinusDIRef.current) {
      try { chartRef.current.removeSeries(adxMinusDIRef.current); } catch {}
      adxMinusDIRef.current = null;
    }
    if (adxKeyLevelRef.current) {
      try { chartRef.current.removeSeries(adxKeyLevelRef.current); } catch {}
      adxKeyLevelRef.current = null;
    }
    if (indicators.adx) {
      const paneIndex = panelIndexFor("adx");
      ensurePane(paneIndex);
      const style = useChartStore.getState().adxStyle;
      // When ADX shares a pane with another indicator, give it its own overlay
      // price scale so it auto-scales independently (ADX: 0-100 vs Squeeze: ±3
      // would leave ADX completely off-screen on a shared scale).
      const adxOverlayTarget = indicatorOverlays.adx;
      const adxIsGuest = !!(adxOverlayTarget && adxOverlayTarget !== "own" && indicators[adxOverlayTarget as IndicatorKey]);
      const adxScaleId = adxIsGuest ? "adx-overlay" : "right";
      adxRef.current = chartRef.current.addSeries(
        LineSeries,
        { color: style.adxColor, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, priceScaleId: adxScaleId },
        paneIndex,
      );
      adxPlusDIRef.current = chartRef.current.addSeries(
        LineSeries,
        { color: style.plusDiColor, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, priceScaleId: adxScaleId },
        paneIndex,
      );
      adxMinusDIRef.current = chartRef.current.addSeries(
        LineSeries,
        { color: style.minusDiColor, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, priceScaleId: adxScaleId },
        paneIndex,
      );
      // Key level: constant horizontal line that must not affect price scale auto-fit.
      // autoscaleInfoProvider: () => null excludes it from the auto-scale calculation
      // so the ADX line is not compressed by the constant-value series.
      adxKeyLevelRef.current = chartRef.current.addSeries(
        LineSeries,
        {
          color: style.keyLevelColor,
          lineWidth: 1,
          lineStyle: 0,
          priceLineVisible: false,
          lastValueVisible: false,
          priceScaleId: adxScaleId,
          autoscaleInfoProvider: () => null,
        },
        paneIndex,
      );
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(mainPaneStretch);
      } catch {}
      updateADX();
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.adx, indicators.rsi, indicators.stochrsi, indicators.macd, indicatorOverlays]);

  // ── Squeeze Momentum pane ────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return;
    // Always teardown first so changes in pane assignment (overlays added /
    // removed, RSI/MACD/ADX toggled) move the series to the correct pane.
    if (squeezeHistRef.current) {
      try { chartRef.current.removeSeries(squeezeHistRef.current); } catch {}
      squeezeHistRef.current = null;
    }
    if (squeezeDotsRef.current) {
      try { chartRef.current.removeSeries(squeezeDotsRef.current); } catch {}
      squeezeDotsRef.current = null;
    }
    squeezeDotsMarkersRef.current = null;
    if (indicators.squeeze) {
      const paneIndex = panelIndexFor("squeeze");
      ensurePane(paneIndex);
      const sqStyle = useChartStore.getState().squeezeStyle;
      // HistogramSeries with per-bar 4 colors (Pine logic) for both modes —
      // the visible result is the colored fill from baseline (0) to value.
      squeezeHistRef.current = chartRef.current.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      squeezeDotsRef.current = chartRef.current.addSeries(
        LineSeries,
        {
          color: "transparent",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      squeezeDotsMarkersRef.current = createSeriesMarkers(squeezeDotsRef.current);
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(mainPaneStretch);
      } catch {}
      updateSqueeze();
      // When ADX and Squeeze share a pane, enforce the configured visual z-order.
      // Default: ADX (guest) on top. Controlled via paneZOrder[hostKey].
      if (indicators.adx && panelIndexFor("adx") === paneIndex) {
        const hostKey: IndicatorKey = indicatorOverlays.squeeze === "adx" ? "adx" : "squeeze";
        const zOrder = paneZOrder[hostKey];
        // Default: ADX on top (index > squeeze). Explicit order overrides when both keys present.
        const adxShouldBeOnTop =
          !zOrder || !zOrder.includes("adx") || !zOrder.includes("squeeze")
            ? true
            : zOrder.indexOf("adx") > zOrder.indexOf("squeeze");
        if (adxShouldBeOnTop) {
          const adxSt = useChartStore.getState().adxStyle;
          const adxScaleId = "adx-overlay";
          if (adxRef.current) { try { chartRef.current.removeSeries(adxRef.current); } catch {} adxRef.current = null; }
          if (adxPlusDIRef.current) { try { chartRef.current.removeSeries(adxPlusDIRef.current); } catch {} adxPlusDIRef.current = null; }
          if (adxMinusDIRef.current) { try { chartRef.current.removeSeries(adxMinusDIRef.current); } catch {} adxMinusDIRef.current = null; }
          if (adxKeyLevelRef.current) { try { chartRef.current.removeSeries(adxKeyLevelRef.current); } catch {} adxKeyLevelRef.current = null; }
          adxRef.current = chartRef.current.addSeries(LineSeries, { color: adxSt.adxColor, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, priceScaleId: adxScaleId }, paneIndex);
          adxPlusDIRef.current = chartRef.current.addSeries(LineSeries, { color: adxSt.plusDiColor, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, priceScaleId: adxScaleId }, paneIndex);
          adxMinusDIRef.current = chartRef.current.addSeries(LineSeries, { color: adxSt.minusDiColor, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, priceScaleId: adxScaleId }, paneIndex);
          adxKeyLevelRef.current = chartRef.current.addSeries(LineSeries, { color: adxSt.keyLevelColor, lineWidth: 1, lineStyle: 0, priceLineVisible: false, lastValueVisible: false, priceScaleId: adxScaleId, autoscaleInfoProvider: () => null }, paneIndex);
          updateADX();
        }
        // If !adxShouldBeOnTop: Squeeze was added last in this effect → Squeeze already on top
      }
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.squeeze, indicators.rsi, indicators.stochrsi, indicators.macd, indicators.adx, indicatorOverlays, paneZOrder]);

  // ── VuManChu Cipher B pane ───────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return;
    // Always teardown VuManChu series first to handle overlay/pane changes
    {
      const vmcRefs = [vmcWt1Ref, vmcWt2Ref, vmcVwapRef, vmcMfiRef, vmcRsiRef, vmcObRef, vmcOsRef, vmcZeroRef];
      for (const r of vmcRefs) {
        if (r.current) {
          try { chartRef.current.removeSeries(r.current); } catch {}
          r.current = null;
        }
      }
      vmcMarkersRef.current = null;
    }
    if (indicators.vumanchu) {
      const paneIndex = panelIndexFor("vumanchu");
      ensurePane(paneIndex);
      // WT1 (light blue area)
      vmcWt1Ref.current = chartRef.current.addSeries(
        AreaSeries,
        {
          lineColor: "#90caf9",
          topColor: "rgba(144, 202, 249, 0.6)",
          bottomColor: "rgba(144, 202, 249, 0.1)",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      // WT2 (deeper indigo area)
      vmcWt2Ref.current = chartRef.current.addSeries(
        AreaSeries,
        {
          lineColor: "#5b62e5",
          topColor: "rgba(91, 98, 229, 0.5)",
          bottomColor: "rgba(91, 98, 229, 0.08)",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      // VWAP (wt1 - wt2) — white wash
      vmcVwapRef.current = chartRef.current.addSeries(
        AreaSeries,
        {
          lineColor: "rgba(255, 255, 255, 0.7)",
          topColor: "rgba(255, 255, 255, 0.25)",
          bottomColor: "rgba(255, 255, 255, 0.03)",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      // MFI area (green for positive, faded for negative)
      vmcMfiRef.current = chartRef.current.addSeries(
        AreaSeries,
        {
          lineColor: "rgba(62, 225, 69, 0.8)",
          topColor: "rgba(62, 225, 69, 0.55)",
          bottomColor: "rgba(239, 83, 80, 0.4)",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      // RSI line (vivid purple)
      vmcRsiRef.current = chartRef.current.addSeries(
        LineSeries,
        {
          color: "#e040fb",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      // OB/OS reference levels
      vmcObRef.current = chartRef.current.addSeries(
        LineSeries,
        {
          color: "rgba(255, 255, 255, 0.25)",
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      vmcOsRef.current = chartRef.current.addSeries(
        LineSeries,
        {
          color: "rgba(255, 255, 255, 0.25)",
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      vmcZeroRef.current = chartRef.current.addSeries(
        LineSeries,
        {
          color: "rgba(255, 255, 255, 0.4)",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      if (vmcWt2Ref.current) {
        vmcMarkersRef.current = createSeriesMarkers(vmcWt2Ref.current);
      }
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1.4);
        chartRef.current.panes()[0]?.setStretchFactor(mainPaneStretch);
      } catch {}
      updateVumanchu();
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.vumanchu, indicators.rsi, indicators.stochrsi, indicators.macd, indicators.adx, indicators.squeeze, indicatorOverlays]);

  // ── Stochastic RSI pane ──────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return;
    // Teardown first, like the other sub-panes: a change to the overlay target
    // moves the series to a different pane index, which addSeries cannot do.
    for (const ref of [stochRsiKRef, stochRsiDRef, stochRsi20Ref, stochRsi80Ref]) {
      if (ref.current) {
        try { chartRef.current.removeSeries(ref.current); } catch {}
        ref.current = null;
      }
    }
    if (indicators.stochrsi) {
      const paneIndex = panelIndexFor("stochrsi");
      ensurePane(paneIndex);
      const band = {
        color: TV_COLORS.textMuted,
        lineWidth: 1 as const,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        // These two deliberately DO feed autoscale (no `autoscaleInfoProvider:
        // () => null` here, unlike ADX's key level): they are what keeps the
        // pane showing at least 20..80 when K and D are pinned at an extreme,
        // which is most of the time for this oscillator.
      };
      stochRsiKRef.current = chartRef.current.addSeries(
        LineSeries,
        { color: STOCH_RSI_K_COLOR, lineWidth: 2, priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      stochRsiDRef.current = chartRef.current.addSeries(
        LineSeries,
        { color: STOCH_RSI_D_COLOR, lineWidth: 2, priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      stochRsi20Ref.current = chartRef.current.addSeries(LineSeries, band, paneIndex);
      stochRsi80Ref.current = chartRef.current.addSeries(LineSeries, band, paneIndex);
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(mainPaneStretch);
      } catch {}
      updateStochRsi();
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.stochrsi, indicators.rsi, indicators.macd, indicators.adx, indicators.squeeze, indicators.vumanchu, indicatorOverlays]);

  // ── OBV pane ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return;
    if (obvRef.current) {
      try { chartRef.current.removeSeries(obvRef.current); } catch {}
      obvRef.current = null;
    }
    if (indicators.obv) {
      const paneIndex = panelIndexFor("obv");
      ensurePane(paneIndex);
      obvRef.current = chartRef.current.addSeries(
        LineSeries,
        {
          color: INDICATOR_COLORS.obv,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(mainPaneStretch);
      } catch {}
      updateOBV();
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.obv, indicators.rsi, indicators.stochrsi, indicators.macd, indicators.adx, indicators.squeeze, indicators.vumanchu, indicatorOverlays]);

  // Visibility — eye toggle (hidden state) + enabled state combined.
  // Sub-pane series are also hidden when subPanesHidden (so their legend headers vanish).
  useEffect(() => {
    const isSubPane = (key: IndicatorKey) =>
      key === "rsi" || key === "stochrsi" || key === "macd" || key === "adx" || key === "squeeze" || key === "vumanchu" || key === "obv";
    const v = (key: IndicatorKey) =>
      indicators[key] && !hidden[key] && !(isSubPane(key) && subPanesHidden);
    // EMAs visibility is driven by per-instance `hidden` flag in the sync effect
    if (rsiRef.current) rsiRef.current.applyOptions({ visible: v("rsi") });
    if (rsi30Ref.current) rsi30Ref.current.applyOptions({ visible: v("rsi") });
    if (rsi50Ref.current) rsi50Ref.current.applyOptions({ visible: v("rsi") });
    if (rsi70Ref.current) rsi70Ref.current.applyOptions({ visible: v("rsi") });
    if (rsiMaRef.current) rsiMaRef.current.applyOptions({ visible: v("rsi") });
    for (const ref of [rsiBandRef, rsiZoneUpRef, rsiZoneDownRef, rsiSpikeUpRef, rsiSpikeDownRef]) {
      ref.current?.applyOptions({ visible: v("rsi") });
    }
    if (stochRsiKRef.current) stochRsiKRef.current.applyOptions({ visible: v("stochrsi") });
    if (stochRsiDRef.current) stochRsiDRef.current.applyOptions({ visible: v("stochrsi") });
    if (stochRsi20Ref.current) stochRsi20Ref.current.applyOptions({ visible: v("stochrsi") });
    if (stochRsi80Ref.current) stochRsi80Ref.current.applyOptions({ visible: v("stochrsi") });
    if (macdRef.current) macdRef.current.applyOptions({ visible: v("macd") });
    if (macdSignalRef.current) macdSignalRef.current.applyOptions({ visible: v("macd") });
    if (macdHistRef.current) macdHistRef.current.applyOptions({ visible: v("macd") });
    if (volumeSeriesRef.current) volumeSeriesRef.current.applyOptions({ visible: v("volume") });
    // ADX pane — respect per-line visibility from adxStyle
    const adxSt = useChartStore.getState().adxStyle;
    if (adxRef.current) adxRef.current.applyOptions({ visible: v("adx") && adxSt.showAdx });
    if (adxPlusDIRef.current) adxPlusDIRef.current.applyOptions({ visible: v("adx") && adxSt.showPlusDi });
    if (adxMinusDIRef.current) adxMinusDIRef.current.applyOptions({ visible: v("adx") && adxSt.showMinusDi });
    if (adxKeyLevelRef.current) adxKeyLevelRef.current.applyOptions({ visible: v("adx") && (adxSt.showKeyLevel ?? true) });
    // Squeeze pane — the histogram provides the price-scale anchor for the SVG
    // overlay; always keep it visible so priceToCoordinate(0) never returns null.
    // The actual show/hide of the histogram colours is handled by the SVG overlay.
    if (squeezeHistRef.current) squeezeHistRef.current.applyOptions({ visible: v("squeeze") });
    if (squeezeDotsRef.current) squeezeDotsRef.current.applyOptions({ visible: v("squeeze") });
    // VuManChu pane
    if (obvRef.current) obvRef.current.applyOptions({ visible: v("obv") });
    if (vmcWt1Ref.current) vmcWt1Ref.current.applyOptions({ visible: v("vumanchu") });
    if (vmcWt2Ref.current) vmcWt2Ref.current.applyOptions({ visible: v("vumanchu") });
    if (vmcVwapRef.current) vmcVwapRef.current.applyOptions({ visible: v("vumanchu") });
    if (vmcMfiRef.current) vmcMfiRef.current.applyOptions({ visible: v("vumanchu") });
    if (vmcRsiRef.current) vmcRsiRef.current.applyOptions({ visible: v("vumanchu") });
    if (vmcObRef.current) vmcObRef.current.applyOptions({ visible: v("vumanchu") });
    if (vmcOsRef.current) vmcOsRef.current.applyOptions({ visible: v("vumanchu") });
    if (vmcZeroRef.current) vmcZeroRef.current.applyOptions({ visible: v("vumanchu") });
  }, [indicators, hidden, subPanesHidden]);

  // Apply price scale mode/inversion — main candle pane ONLY (uses the
  // candle series's own price scale so sub-pane indicators are unaffected).
  // Log and percentage/indexed-to-100 are mutually exclusive in the library.
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const mode =
      mainPriceScaleMode === "percentage"
        ? PriceScaleMode.Percentage
        : mainPriceScaleMode === "indexed100"
          ? PriceScaleMode.IndexedTo100
          : logScale
            ? PriceScaleMode.Logarithmic
            : PriceScaleMode.Normal;
    candleSeriesRef.current.priceScale().applyOptions({
      mode,
      invertScale: mainPriceScaleInverted,
    });
  }, [logScale, mainPriceScaleMode, mainPriceScaleInverted]);

  // Per-indicator log scale — applies to that indicator's pane price scale
  useEffect(() => {
    const apply = (
      seriesRef: React.RefObject<ISeriesApi<"Line" | "Area" | "Histogram" | "Candlestick"> | null>,
      enabled: boolean,
    ) => {
      if (!seriesRef.current) return;
      seriesRef.current.priceScale().applyOptions({
        mode: enabled ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      });
    };
    apply(
      rsiRef as unknown as React.RefObject<ISeriesApi<"Line"> | null>,
      !!indicatorLogScale.rsi,
    );
    apply(
      stochRsiKRef as unknown as React.RefObject<ISeriesApi<"Line"> | null>,
      !!indicatorLogScale.stochrsi,
    );
    apply(
      macdRef as unknown as React.RefObject<ISeriesApi<"Line"> | null>,
      !!indicatorLogScale.macd,
    );
    apply(
      adxRef as unknown as React.RefObject<ISeriesApi<"Line"> | null>,
      !!indicatorLogScale.adx,
    );
    apply(
      squeezeHistRef as unknown as React.RefObject<ISeriesApi<"Histogram"> | null>,
      !!indicatorLogScale.squeeze,
    );
    apply(
      vmcWt2Ref as unknown as React.RefObject<ISeriesApi<"Area"> | null>,
      !!indicatorLogScale.vumanchu,
    );
  }, [indicatorLogScale, indicators]);

  // Apply chart color customization
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({
      layout: { background: { color: chartColors.bg } },
      grid: {
        vertLines: { color: chartColors.gridLines },
        horzLines: { color: chartColors.gridLines },
      },
    });
    if (candleSeriesRef.current) {
      candleSeriesRef.current.applyOptions({
        upColor: chartColors.bodyUp,
        downColor: chartColors.bodyDown,
        borderUpColor: chartColors.borderUp,
        borderDownColor: chartColors.borderDown,
        wickUpColor: chartColors.wickUp,
        wickDownColor: chartColors.wickDown,
      });
    }
  }, [chartColors]);

  // Sync user EMAs: create/remove series, update color/lineWidth, refresh data
  useEffect(() => {
    if (!chartRef.current) return;
    const map = emaSeriesMapRef.current;
    const wantedIds = new Set(userEMAs.map((e) => e.id));
    // Remove series no longer in the list
    for (const [id, series] of Array.from(map.entries())) {
      if (!wantedIds.has(id)) {
        try {
          chartRef.current.removeSeries(series);
        } catch {}
        map.delete(id);
      }
    }
    // Add or update series for current instances
    for (const e of userEMAs) {
      let series = map.get(e.id);
      if (!series) {
        series = chartRef.current.addSeries(LineSeries, {
          color: e.color,
          lineWidth: (e.lineWidth as 1 | 2 | 3 | 4) ?? 1,
          priceLineVisible: false,
          lastValueVisible: false,
          visible: !e.hidden,
        });
        map.set(e.id, series);
      } else {
        series.applyOptions({
          color: e.color,
          lineWidth: (e.lineWidth as 1 | 2 | 3 | 4) ?? 1,
          visible: !e.hidden,
        });
      }
    }
    updateEMAs();
  }, [userEMAs]);

  // Anchored VWAP: create or drop the seven main-pane lines, keep their style
  // in sync, then refill. Series live only while the study is on, so a chart
  // without it pays nothing.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (!indicators.vwap) {
      if (vwapRef.current) {
        const { mean, bands } = vwapRef.current;
        for (const sx of [mean, ...bands.flat()]) {
          try {
            chart.removeSeries(sx);
          } catch {}
        }
        vwapRef.current = null;
      }
      return;
    }

    if (!vwapRef.current) {
      const mk = (color: string) =>
        chart.addSeries(LineSeries, {
          color,
          lineWidth: vwapStyle.lineWidth,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
      vwapRef.current = {
        mean: mk(vwapStyle.color),
        bands: [0, 1, 2].map((i) => [
          mk(vwapStyle.bandColors[i]),
          mk(vwapStyle.bandColors[i]),
        ]) as [ISeriesApi<"Line">, ISeriesApi<"Line">][],
      };
    }

    const v = vwapRef.current;
    const visible = !hidden.vwap;
    v.mean.applyOptions({
      color: vwapStyle.color,
      lineWidth: vwapStyle.lineWidth,
      visible,
    });
    v.bands.forEach(([up, dn], i) => {
      const opts = {
        color: vwapStyle.bandColors[i],
        lineWidth: vwapStyle.lineWidth,
        visible: visible && vwapStyle.showBands[i],
      };
      up.applyOptions(opts);
      dn.applyOptions(opts);
    });
    updateVWAP();
    // `updateVWAP` reads everything it needs off refs and the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.vwap, hidden.vwap, vwapStyle]);

  useEffect(() => {
    updateRSI();
  }, [config.rsi, config.rsiMaLength, config.rsiUpperZone, config.rsiLowerZone]);

  useEffect(() => {
    updateStochRsi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.stochRsiLength,
    config.stochRsiStochLength,
    config.stochRsiK,
    config.stochRsiD,
  ]);

  useEffect(() => {
    updateMACD();
  }, [config.macdFast, config.macdSlow, config.macdSignal]);

  useEffect(() => {
    updateADX();
  }, [config.adx, config.adxDiLen, config.adxKeyLevel, adxStyle]);

  useEffect(() => {
    updateSqueeze();
  }, [config.squeezeBB, config.squeezeBBMult, config.squeezeKC, config.squeezeKCMult, squeezeStyle]);

  useEffect(() => {
    updateVumanchu();
  }, [
    config.vumanchuChannelLen,
    config.vumanchuAvgLen,
    config.vumanchuMaLen,
    config.vumanchuMfiPeriod,
  ]);

  // Reset selection when symbol changes
  useEffect(() => {
    useDrawingsStore.getState().setSelected(null);
  }, [symbol]);

  // Cursor style when drawing tools are active + reset measure on tool change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.cursor =
        tool === "brush" || tool === "highlighter" ? "crosshair"
        : tool !== "cursor" && tool !== "eraser" ? "crosshair" : "";
    }
    if (tool !== "measure") setMeasure(INITIAL_MEASURE);
    // Reset multi-click placement when switching tools
    firstPointRef.current = null;
    placementPointsRef.current = [];
    setPreviewState(null);
  }, [tool]);

  // Brush / Highlighter — freehand drawing via pointer capture
  useEffect(() => {
    if (tool !== "brush" && tool !== "highlighter") return;
    const container = containerRef.current;
    if (!container) return;

    const isHighlighter = tool === "highlighter";
    let active = false;
    // Raw pixel positions (relative to container) — no time conversion yet
    const rawPx: { x: number; y: number }[] = [];
    let lastX = 0;
    let lastY = 0;

    // Live preview path element injected above the drawings SVG
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:15;overflow:visible");
    const pathEl = document.createElementNS(ns, "path");
    pathEl.setAttribute("fill", "none");
    pathEl.setAttribute("stroke", isHighlighter ? "#ffeb3b" : "#ffffff");
    pathEl.setAttribute("stroke-width", isHighlighter ? "14" : "2");
    pathEl.setAttribute("stroke-linecap", "round");
    pathEl.setAttribute("stroke-linejoin", "round");
    pathEl.setAttribute("opacity", isHighlighter ? "0.35" : "1");
    svg.appendChild(pathEl);
    container.parentElement?.appendChild(svg);

    // Chaikin corner-cutting smoothing — applied on pixel arrays.
    // Each iteration replaces each segment AB with two new points:
    //   Q = 0.75·A + 0.25·B  and  R = 0.25·A + 0.75·B
    // Result after a few iterations: smooth curve through the point cloud.
    function chaikin(pts: { x: number; y: number }[], iters = 3) {
      let r = pts;
      for (let n = 0; n < iters; n++) {
        if (r.length < 3) break;
        const next: { x: number; y: number }[] = [r[0]];
        for (let i = 0; i < r.length - 1; i++) {
          const a = r[i], b = r[i + 1];
          next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
          next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
        }
        next.push(r[r.length - 1]);
        r = next;
      }
      return r;
    }

    // SVG polyline string from pixel array (L commands — smoothing already applied)
    function ptsToD(pixels: { x: number; y: number }[]) {
      if (pixels.length < 2) return "";
      return "M " + pixels[0].x.toFixed(1) + " " + pixels[0].y.toFixed(1) +
        pixels.slice(1).map(p => ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");
    }

    function updatePreview() {
      const smoothed = rawPx.length >= 3 ? chaikin(rawPx, 2) : rawPx;
      pathEl.setAttribute("d", ptsToD(smoothed));
    }

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      active = true;
      rawPx.length = 0;
      const rect = container!.getBoundingClientRect();
      lastX = e.clientX - rect.left;
      lastY = e.clientY - rect.top;
      rawPx.push({ x: lastX, y: lastY });
      (container as HTMLElement).setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: PointerEvent) {
      if (!active) return;
      e.preventDefault();
      const rect = container!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const dx = x - lastX, dy = y - lastY;
      if (dx * dx + dy * dy < 1) return;
      lastX = x; lastY = y;
      rawPx.push({ x, y });
      updatePreview();
    }

    function onPointerUp(e: PointerEvent) {
      if (!active) return;
      active = false;
      e.preventDefault();
      pathEl.setAttribute("d", "");
      if (rawPx.length < 2 || !chartRef.current || !candleSeriesRef.current) return;

      // Apply full Chaikin smoothing on the raw pixel cloud
      const smoothed = rawPx.length >= 3 ? chaikin(rawPx, 3) : rawPx;

      // Convert smoothed pixels → {time, price, logical} — logical for lossless render
      const intervalSec = timeframeToSeconds(useChartStore.getState().timeframe);
      const points: { time: number; price: number }[] = [];
      const logicals: number[] = [];

      // Compute the pixels-per-bar ratio from two known integer bar positions.
      // This avoids using containerWidth (which includes the price scale and would
      // produce a systematic left-shift because chartAreaWidth < containerWidth).
      const visibleRange = chartRef.current!.timeScale().getVisibleLogicalRange();
      const refLog = Math.round((visibleRange?.from ?? 0) + (visibleRange ? (visibleRange.to - visibleRange.from) / 2 : 0));
      const refX0 = chartRef.current!.timeScale().logicalToCoordinate(refLog as never) as number;
      const refX1 = chartRef.current!.timeScale().logicalToCoordinate((refLog + 1) as never) as number;
      const pxPerBar = (refX1 ?? refX0 + 8) - (refX0 ?? 0);

      for (const { x, y } of smoothed) {
        const price = candleSeriesRef.current!.coordinateToPrice(y);
        if (price === null) continue;
        const time = xToTime(chartRef.current!, x, candlesRef.current, intervalSec);
        if (time === null) continue;
        points.push({ time, price: price as number });
        // Float logical computed from actual bar spacing — no containerWidth dependency
        const logical = refLog + (x - (refX0 ?? 0)) / pxPerBar;
        logicals.push(logical);
      }

      if (points.length >= 2) {
        void drawingsApiRef.current.add({
          id: generateId(),
          kind: tool as "brush" | "highlighter",
          symbol: symbolRef.current,
          points,
          logicals,
          color: isHighlighter ? "#ffeb3b" : "#ffffff",
          lineWidth: isHighlighter ? 14 : 2,
        });
      }
    }

    container.addEventListener("pointerdown", onPointerDown, { capture: true });
    container.addEventListener("pointermove", onPointerMove, { capture: true });
    container.addEventListener("pointerup", onPointerUp, { capture: true });

    return () => {
      container.removeEventListener("pointerdown", onPointerDown, { capture: true });
      container.removeEventListener("pointermove", onPointerMove, { capture: true });
      container.removeEventListener("pointerup", onPointerUp, { capture: true });
      svg.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // Track Ctrl key globally for magnet visual + apply snap to preview
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Control" || e.key === "Meta") {
        setCtrlHeld(e.type === "keydown");
        if (e.type === "keyup") {
          setMagnetTarget(null);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  // Window-level mousemove drives the placement preview. We listen on the
  // window (not the container) so that lightweight-charts' internal
  // stopPropagation calls can't suppress our updates.
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const container = containerRef.current;
      if (!container || !chartRef.current || !candleSeriesRef.current) return;
      // Only do work when there's an active placement
      if (!firstPointRef.current && placementPointsRef.current.length === 0) return;
      const rect = container.getBoundingClientRect();
      // Skip when cursor is outside the chart
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        return;
      }
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const rawPrice = candleSeriesRef.current.coordinateToPrice(y);
      if (rawPrice === null || !isFinite(rawPrice as number)) return;
      const intervalSec = timeframeToSeconds(
        useChartStore.getState().timeframe,
      );
      const t = xToTime(chartRef.current, x, candlesRef.current, intervalSec);
      if (t === null) return;
      let price = rawPrice as number;
      const time = t;
      if (e.ctrlKey || e.metaKey || useChartStore.getState().magnetMode) {
        const snapped = magnetSnap(price, time, candlesRef.current);
        if (snapped !== null) price = snapped;
        setMagnetTarget({ time, price });
      }
      lastCursorRef.current = { time, price };
      // Shift → keep the line horizontal/vertical while moving (line tools).
      let cur = { time, price };
      if (
        (shiftHeldRef.current || e.shiftKey) &&
        firstPointRef.current &&
        AXIS_CONSTRAIN_TOOLS.has(toolRef.current)
      ) {
        cur = constrainToAxis(
          chartRef.current,
          candleSeriesRef.current,
          candlesRef.current,
          intervalSec,
          firstPointRef.current,
          cur,
        );
      }
      setPreviewState((prev) => (prev ? { ...prev, cursor: cur } : prev));
    }
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  function updateEMAs() {
    const c = candlesRef.current;
    if (c.length === 0) return;
    const emas = useChartStore.getState().userEMAs;
    for (const e of emas) {
      const series = emaSeriesMapRef.current.get(e.id);
      if (!series) continue;
      const data = ema(c, e.period);
      series.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
    }
    const lastVol = c.at(-1)?.volume;
    setLastValues((prev) => ({ ...prev, volume: lastVol }));
  }

  function updateVWAP() {
    const c = candlesRef.current;
    const v = vwapRef.current;
    if (!v || c.length === 0) return;
    const st = useChartStore.getState().vwapStyle;
    const pts = vwapBands(c, st.anchor);

    // A point's colour paints the segment running to the *next* point, so the
    // last bar of a session is drawn transparent. Without this the chart draws
    // a long diagonal from where one session ended to where the next one
    // starts — the reset would read as a real price move.
    const line = (value: (p: (typeof pts)[number]) => number) =>
      pts.map((p, i) => {
        const d: { time: UTCTimestamp; value: number; color?: string } = {
          time: p.time as UTCTimestamp,
          value: value(p),
        };
        if (i + 1 < pts.length && pts[i + 1].anchor !== p.anchor) {
          d.color = "transparent";
        }
        return d;
      });

    v.mean.setData(line((p) => p.vwap));
    v.bands.forEach(([up, dn], j) => {
      const n = j + 1;
      up.setData(line((p) => p.vwap + n * p.sd));
      dn.setData(line((p) => p.vwap - n * p.sd));
    });
  }

  function updateOBV() {
    const c = candlesRef.current;
    if (c.length === 0 || !obvRef.current) return;
    const data = obv(c).map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.value,
    }));
    obvRef.current.setData(data);
  }

  function updateRSI() {
    const c = candlesRef.current;
    if (c.length === 0 || !rsiRef.current) return;
    const cfg = configRef.current;
    const pts = rsi(c, cfg.rsi);
    const data = pts.map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.value,
    }));
    rsiRef.current.setData(data);
    // Both gradient fills plot the same series; only their base value and
    // which half is coloured differ.
    rsiSpikeUpRef.current?.setData(data);
    rsiSpikeDownRef.current?.setData(data);
    rsiMaRef.current?.setData(
      smaOf(pts, cfg.rsiMaLength).map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.value,
      })),
    );

    if (data.length > 0) {
      const first = data[0].time;
      const last = data[data.length - 1].time;
      const rail = (series: ISeriesApi<"Line"> | null, value: number) =>
        series?.setData([
          { time: first, value },
          { time: last, value },
        ]);
      rail(rsi30Ref.current, 30);
      rail(rsi50Ref.current, 50);
      rail(rsi70Ref.current, 70);

      // Flat backdrops. Each is a two-point constant series filled to its
      // baseline, which draws as a rectangle spanning the pane.
      const slab = (
        series: ISeriesApi<"Baseline"> | null,
        value: number,
        base: number,
      ) => {
        series?.applyOptions({ baseValue: { type: "price", price: base } });
        series?.setData([
          { time: first, value },
          { time: last, value },
        ]);
      };
      slab(rsiBandRef.current, 70, 30);
      slab(rsiZoneUpRef.current, 100, cfg.rsiUpperZone);
      slab(rsiZoneDownRef.current, 0, cfg.rsiLowerZone);
    }
    setLastValues((prev) => ({ ...prev, rsi: data.at(-1)?.value }));
  }

  function updateStochRsi() {
    const c = candlesRef.current;
    if (c.length === 0 || !stochRsiKRef.current || !stochRsiDRef.current) return;
    const cfg = configRef.current;
    const pts = stochRsi(
      c,
      cfg.stochRsiLength,
      cfg.stochRsiStochLength,
      cfg.stochRsiK,
      cfg.stochRsiD,
    );
    stochRsiKRef.current.setData(
      pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.k })),
    );
    stochRsiDRef.current.setData(
      pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.d })),
    );
    if (pts.length > 0) {
      const first = pts[0].time as UTCTimestamp;
      const last = pts[pts.length - 1].time as UTCTimestamp;
      stochRsi20Ref.current?.setData([
        { time: first, value: STOCH_RSI_OVERSOLD },
        { time: last, value: STOCH_RSI_OVERSOLD },
      ]);
      stochRsi80Ref.current?.setData([
        { time: first, value: STOCH_RSI_OVERBOUGHT },
        { time: last, value: STOCH_RSI_OVERBOUGHT },
      ]);
    }
    const last = pts.at(-1);
    setLastValues((prev) => ({
      ...prev,
      stochRsiK: last?.k,
      stochRsiD: last?.d,
    }));
  }

  function updateMACD() {
    const c = candlesRef.current;
    if (c.length === 0 || !macdRef.current) return;
    const cfg = configRef.current;
    const m = macd(c, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
    macdRef.current.setData(
      m.map((p) => ({ time: p.time as UTCTimestamp, value: p.macd })),
    );
    macdSignalRef.current?.setData(
      m.map((p) => ({ time: p.time as UTCTimestamp, value: p.signal })),
    );
    macdHistRef.current?.setData(
      m.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.histogram,
        color: p.histogram >= 0 ? `${TV_COLORS.green}80` : `${TV_COLORS.red}80`,
      })),
    );
    const last = m.at(-1);
    setLastValues((prev) => ({
      ...prev,
      macd: last?.macd,
      macdSignal: last?.signal,
      macdHist: last?.histogram,
    }));
  }

  function updateADX() {
    const c = candlesRef.current;
    if (c.length === 0 || !adxRef.current) return;
    const cfg = configRef.current;
    const style = useChartStore.getState().adxStyle;
    const data = adxCalc(c, { diLen: cfg.adxDiLen, adxLen: cfg.adx });
    adxRef.current.setData(data.map((p) => ({ time: p.time as UTCTimestamp, value: p.adx })));
    const adxEnabled = indicators.adx && !hidden.adx;
    adxRef.current.applyOptions({ color: style.adxColor, lineWidth: style.adxLineWidth ?? 2, visible: style.showAdx && adxEnabled });
    adxPlusDIRef.current?.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.plusDI })),
    );
    adxPlusDIRef.current?.applyOptions({ color: style.plusDiColor, lineWidth: style.diLineWidth ?? 1, visible: style.showPlusDi && adxEnabled });
    adxMinusDIRef.current?.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.minusDI })),
    );
    adxMinusDIRef.current?.applyOptions({ color: style.minusDiColor, lineWidth: style.diLineWidth ?? 1, visible: style.showMinusDi && adxEnabled });
    if (adxKeyLevelRef.current && data.length > 0) {
      const keyLevelValue = cfg.adxKeyLevel ?? 23;
      adxKeyLevelRef.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: keyLevelValue })),
      );
      adxKeyLevelRef.current.applyOptions({ color: style.keyLevelColor, lineWidth: style.keyLevelLineWidth ?? 1, visible: (style.showKeyLevel ?? true) && adxEnabled });
    }
  }

  function updateSqueeze() {
    const c = candlesRef.current;
    if (c.length === 0 || !squeezeHistRef.current) return;
    const cfg = configRef.current;
    const style = useChartStore.getState().squeezeStyle;
    const pts = squeezeMomentum(c, {
      bbLength: cfg.squeezeBB,
      bbMult: cfg.squeezeBBMult,
      kcLength: cfg.squeezeKC,
      kcMult: cfg.squeezeKCMult,
    });
    const COLORS: Record<string, string> = {
      lime: style.momentumIncPos,
      green: style.momentumDecPos,
      red: style.momentumDecNeg,
      maroon: style.momentumIncNeg,
    };
    // Histogram series stays in place (provides the price-scale anchor and
    // coordinate-to-price mapping for the SVG overlay) but its bars are
    // transparent — the visible rendering happens in <SqueezeOverlay/>,
    // which draws Pine plot.style_area exactly: linear segments between
    // bars, filled to baseline, colors per bar from bcolor logic.
    squeezeHistRef.current.setData(
      pts.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.momentum,
        color: "rgba(0,0,0,0)",
      })),
    );
    // Keep the histogram visible so its price scale stays valid for priceToCoordinate.
    // The SVG overlay controls what's actually shown to the user.
    squeezeHistRef.current.applyOptions({ visible: true });
    setSqueezePts(pts);
    void COLORS;
    // Zero-line dots: invisible line at 0 + colored markers for squeeze state
    squeezeDotsRef.current?.setData(
      pts.map((p) => ({ time: p.time as UTCTimestamp, value: 0 })),
    );
    if (squeezeDotsMarkersRef.current) {
      const markers: SeriesMarker<Time>[] = !style.showSqueezeDots ? [] : pts.map((p) => ({
        time: p.time as UTCTimestamp,
        position: "inBar",
        shape: "circle",
        size: 0.5,
        color:
          p.state === "on"
            ? style.squeezeOn
            : p.state === "off"
              ? style.squeezeOff
              : style.noSqueeze,
      }));
      squeezeDotsMarkersRef.current.setMarkers(markers);
    }
  }

  function updateVumanchu() {
    const c = candlesRef.current;
    if (c.length === 0 || !vmcWt2Ref.current) return;
    const cfg = configRef.current;
    const pts = vumanchuCalc(c, {
      wtChannelLen: cfg.vumanchuChannelLen,
      wtAverageLen: cfg.vumanchuAvgLen,
      wtMALen: cfg.vumanchuMaLen,
      mfiPeriod: cfg.vumanchuMfiPeriod,
    });
    if (pts.length === 0) return;
    const t0 = pts[0].time as UTCTimestamp;
    const tN = pts[pts.length - 1].time as UTCTimestamp;
    vmcWt1Ref.current?.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.wt1 })));
    vmcWt2Ref.current.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.wt2 })));
    vmcVwapRef.current?.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.vwap })));
    vmcMfiRef.current?.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.mfi })));
    vmcRsiRef.current?.setData(
      pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.rsi - 50 })),
    );
    // Reference levels stretched across the visible range
    vmcObRef.current?.setData([
      { time: t0, value: 60 },
      { time: tN, value: 60 },
    ]);
    vmcOsRef.current?.setData([
      { time: t0, value: -60 },
      { time: tN, value: -60 },
    ]);
    vmcZeroRef.current?.setData([
      { time: t0, value: 0 },
      { time: tN, value: 0 },
    ]);
    // Markers on wt2: crosses, buy/sell, gold, divergences
    if (vmcMarkersRef.current) {
      const markers: SeriesMarker<Time>[] = [];
      for (const p of pts) {
        // Regular cross (small dot)
        if (p.cross && !p.buySignal && !p.sellSignal && !p.goldBuy) {
          markers.push({
            time: p.time as UTCTimestamp,
            position: "inBar",
            shape: "circle",
            size: 0.7,
            color: p.crossUp ? "#00e676" : "#ff5252",
          });
        }
        // Buy / Sell signals (bigger circle)
        if (p.buySignal) {
          markers.push({
            time: p.time as UTCTimestamp,
            position: "belowBar",
            shape: "circle",
            size: 1.4,
            color: "#3fff00",
            text: "B",
          });
        }
        if (p.sellSignal) {
          markers.push({
            time: p.time as UTCTimestamp,
            position: "aboveBar",
            shape: "circle",
            size: 1.4,
            color: "#ff0000",
            text: "S",
          });
        }
        // Gold buy
        if (p.goldBuy) {
          markers.push({
            time: p.time as UTCTimestamp,
            position: "belowBar",
            shape: "circle",
            size: 1.6,
            color: "#e2a400",
            text: "G",
          });
        }
        // Divergences (purple triangles)
        if (p.wtBullDiv || p.rsiBullDiv) {
          markers.push({
            time: p.time as UTCTimestamp,
            position: "belowBar",
            shape: "arrowUp",
            size: 1,
            color: "#00e676",
          });
        }
        if (p.wtBearDiv || p.rsiBearDiv) {
          markers.push({
            time: p.time as UTCTimestamp,
            position: "aboveBar",
            shape: "arrowDown",
            size: 1,
            color: "#e60000",
          });
        }
      }
      vmcMarkersRef.current.setMarkers(markers);
    }
  }

  // Load historical data + subscribe live
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    async function load() {
      try {
        // The current view shape (span + right offset) is tracked continuously in
        // viewShapeRef, so it survives the data wipe below and lets us keep the
        // same zoom + scroll position on the new symbol.
        const shape = viewShapeRef.current;

        // Immediately wipe previous symbol's data so stale candles never linger.
        candlesRef.current = [];
        globalCandlesRef.current = [];
        candleSeriesRef.current?.setData([]);
        lineSeriesRef.current?.setData([]);
        areaSeriesRef.current?.setData([]);
        volumeSeriesRef.current?.setData([]);
        setLastPrice(null);

        const source = resolveSource(symbol);
        const synthetic = source.kind === "synthetic";
        const klines = await fetchCandles(symbol, timeframe, 1000);
        if (cancelled) return;
        candlesRef.current = klines;
        globalCandlesRef.current = klines;
        if (candleSeriesRef.current) {
          candleSeriesRef.current.setData(
            klines.map((k) => ({
              time: k.time as UTCTimestamp,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
            })),
          );
        }
        // Scale the price scale's decimal places to this symbol's price —
        // start from the magnitude-based guess so a sub-cent altcoin doesn't
        // flatten to "0.00" under the library's flat 2-decimal default while
        // the real precision loads, then refine to the exchange's actual
        // tick size once known. That's what makes decimals match TradingView
        // per symbol (e.g. BTC at 1 decimal, ETH at 2, NEAR/AVAX at 3)
        // instead of every symbol ≥$1 flattening to the same 2 decimals.
        if (klines.length > 0) {
          const lastClose = klines[klines.length - 1].close;
          const applyPrecision = (precision: number, minMove: number) => {
            const priceFormat = { type: "price" as const, precision, minMove };
            candleSeriesRef.current?.applyOptions({ priceFormat });
            lineSeriesRef.current?.applyOptions({ priceFormat });
            areaSeriesRef.current?.applyOptions({ priceFormat });
          };
          const guess = priceFormatFor(lastClose);
          applyPrecision(guess.precision, guess.minMove);
          if (source.kind === "binance" || source.kind === "bybit") {
            try {
              const info = await getSymbolInfo(symbol, false, source.kind);
              if (!cancelled && info.tickSize > 0) {
                applyPrecision(info.pricePrecision, info.tickSize);
              }
            } catch {
              // keep the magnitude-based guess
            }
          }
        }
        const closeData = klines.map((k) => ({ time: k.time as UTCTimestamp, value: k.close }));
        lineSeriesRef.current?.setData(closeData);
        areaSeriesRef.current?.setData(closeData);
        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.setData(
            klines.map((k) => ({
              time: k.time as UTCTimestamp,
              value: k.volume,
              color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
            })),
          );
        }
        updateEMAs();
        updateVWAP();
        updateRSI();
        updateStochRsi();
        updateMACD();
        updateADX();
        updateSqueeze();
        updateVumanchu();
        updateOBV();
        if (chartRef.current && klines.length > 0) {
          const lastIdx = klines.length - 1;
          if (shape) {
            // Preserve the previous zoom (span) and right-edge offset so the new
            // symbol shows at the same scale/position the user was looking at.
            const to = lastIdx + shape.rightOffset;
            chartRef.current.timeScale().setVisibleLogicalRange({ from: to - shape.span, to });
          } else {
            // First load: show the user's preferred number of recent bars.
            // Bypasses lightweight-charts' default "fit all" which zooms out too far.
            const bars = useChartStore.getState().visibleBars;
            chartRef.current.timeScale().setVisibleLogicalRange({
              from: Math.max(0, lastIdx - bars + 1),
              to: lastIdx + 4,
            });
          }
        }
        // Recompute pane offsets in multiple frames: lightweight-charts needs
        // at least two render cycles after setData() to settle pane heights.
        // The setTimeout backup catches cases where the first frames are still early.
        requestAnimationFrame(() => {
          recomputePaneOffsets();
          requestAnimationFrame(() => recomputePaneOffsets());
        });
        setTimeout(() => recomputePaneOffsets(), 200);

        if (klines.length > 0) {
          const last = klines[klines.length - 1];
          const prev = klines[klines.length - 2] ?? last;
          const lp = {
            value: last.close,
            pct: prev.close === 0 ? 0 : ((last.close - prev.close) / prev.close) * 100,
          };
          setLastPrice(lp);
          setCurrentLivePrice(lp.value);
        }

        // Non-Binance sources: poll for fresh data periodically.
        if (source.kind === "yahoo" || source.kind === "fred" || source.kind === "coingecko") {
          const intervalMs =
            source.kind === "yahoo" ? 5000
            : source.kind === "coingecko" ? 60_000
            : 3_600_000; // FRED updates at most daily
          const poll = async () => {
            try {
              const fresh = await fetchCandles(symbol, timeframe, 1000);
              if (cancelled || !candleSeriesRef.current || fresh.length === 0) return;
              candlesRef.current = fresh;
              globalCandlesRef.current = fresh;
              candleSeriesRef.current.setData(
                fresh.map((k) => ({
                  time: k.time as UTCTimestamp,
                  open: k.open,
                  high: k.high,
                  low: k.low,
                  close: k.close,
                })),
              );
              const freshClose = fresh.map((k) => ({ time: k.time as UTCTimestamp, value: k.close }));
              lineSeriesRef.current?.setData(freshClose);
              areaSeriesRef.current?.setData(freshClose);
              if (volumeSeriesRef.current) {
                volumeSeriesRef.current.setData(
                  fresh.map((k) => ({
                    time: k.time as UTCTimestamp,
                    value: k.volume,
                    color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
                  })),
                );
              }
              updateEMAs();
              updateVWAP();
              updateRSI();
              updateStochRsi();
              updateMACD();
              updateADX();
              updateSqueeze();
              updateVumanchu();
              updateOBV();
              const last = fresh[fresh.length - 1];
              const prev = fresh[fresh.length - 2] ?? last;
              const lp2 = {
                value: last.close,
                pct: prev.close === 0 ? 0 : ((last.close - prev.close) / prev.close) * 100,
              };
              setLastPrice(lp2);
              setCurrentLivePrice(lp2.value);
            } catch (e) {
              console.error("Polling refresh failed:", e);
            }
          };
          // These sources go through our own /api/* proxies (real Vercel
          // Functions), so keep the timer off while the tab is backgrounded
          // and catch up with one immediate poll on the way back — same
          // treatment as the account poll in useTradingSync.
          let timer: ReturnType<typeof setInterval> | null = null;
          const startPoll = () => {
            if (timer === null) timer = setInterval(() => void poll(), intervalMs);
          };
          const stopPoll = () => {
            if (timer !== null) { clearInterval(timer); timer = null; }
          };
          const onVisibility = () => {
            if (document.hidden) stopPoll();
            else { void poll(); startPoll(); }
          };
          if (!document.hidden) startPoll();
          document.addEventListener("visibilitychange", onVisibility);
          unsub = () => {
            stopPoll();
            document.removeEventListener("visibilitychange", onVisibility);
          };
          return;
        }

        const ws = source.kind === "bybit" ? getBybitWS() : getBinanceWS();
        if (synthetic) {
          // Subscribe to each component, recompute synthetic candle on update
          const symbols = extractSymbols(symbol);
          const lastBySym = new Map<string, Candle>();
          const unsubs = symbols.map((s) =>
            ws.subscribeKline({
              symbol: s,
              interval: timeframe,
              onCandle: (k) => {
                if (useReplayStore.getState().active) return; // frozen during replay
                markChartTick();
                lastBySym.set(s, k);
                if (lastBySym.size !== symbols.length) return;
                const synth = evaluateCandleAt(symbol, lastBySym);
                if (!synth) return;
                if (!candleSeriesRef.current) return;
                const arr = candlesRef.current;
                const lastCandle = arr[arr.length - 1];
                if (lastCandle && lastCandle.time === synth.time) {
                  arr[arr.length - 1] = synth;
                } else if (!lastCandle || synth.time > lastCandle.time) {
                  arr.push(synth);
                  if (arr.length > 2000) arr.shift();
                } else {
                  return;
                }
                candleSeriesRef.current.update({
                  time: synth.time as UTCTimestamp,
                  open: synth.open,
                  high: synth.high,
                  low: synth.low,
                  close: synth.close,
                });
                lineSeriesRef.current?.update({ time: synth.time as UTCTimestamp, value: synth.close });
                areaSeriesRef.current?.update({ time: synth.time as UTCTimestamp, value: synth.close });
                if (volumeSeriesRef.current) {
                  volumeSeriesRef.current.update({
                    time: synth.time as UTCTimestamp,
                    value: synth.volume,
                    color:
                      synth.close >= synth.open
                        ? `${TV_COLORS.green}66`
                        : `${TV_COLORS.red}66`,
                  });
                }
                updateEMAs();
                updateVWAP();
                updateRSI();
                updateStochRsi();
                updateMACD();
                updateADX();
                updateSqueeze();
                updateVumanchu();
              updateOBV();
                const prev = arr[arr.length - 2] ?? lastCandle;
                const lp3 = {
                  value: synth.close,
                  pct:
                    prev && prev.close !== 0
                      ? ((synth.close - prev.close) / prev.close) * 100
                      : 0,
                };
                setLastPrice(lp3);
                setCurrentLivePrice(lp3.value);
              },
            }),
          );
          unsub = () => unsubs.forEach((u) => u());
          return;
        }
        unsub = ws.subscribeKline({
          symbol,
          interval: timeframe,
          onCandle: (k) => {
            if (useReplayStore.getState().active) return; // frozen during replay
            markChartTick();
            if (!candleSeriesRef.current) return;
            const arr = candlesRef.current;
            const lastCandle = arr[arr.length - 1];
            if (lastCandle && lastCandle.time === k.time) {
              arr[arr.length - 1] = k;
            } else if (!lastCandle || k.time > lastCandle.time) {
              arr.push(k);
              if (arr.length > 2000) arr.shift();
            } else {
              return;
            }
            candleSeriesRef.current.update({
              time: k.time as UTCTimestamp,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
            });
            lineSeriesRef.current?.update({ time: k.time as UTCTimestamp, value: k.close });
            areaSeriesRef.current?.update({ time: k.time as UTCTimestamp, value: k.close });
            if (volumeSeriesRef.current) {
              volumeSeriesRef.current.update({
                time: k.time as UTCTimestamp,
                value: k.volume,
                color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
              });
            }
            updateEMAs();
            updateVWAP();
            updateRSI();
            updateStochRsi();
            updateMACD();
            updateADX();
            updateSqueeze();
            updateVumanchu();
            updateOBV();
            const prev = arr[arr.length - 2] ?? lastCandle;
            const lp4 = {
              value: k.close,
              pct: prev && prev.close !== 0 ? ((k.close - prev.close) / prev.close) * 100 : 0,
            };
            setLastPrice(lp4);
            setCurrentLivePrice(lp4.value);
          },
        });
      } catch (e) {
        console.error("Failed to load chart data:", e);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
    // `feedNonce` is not data — bumping it rebuilds the subscription when the
    // socket looks healthy but this symbol's stream has gone quiet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, feedNonce]);

  // ── Bar replay ─────────────────────────────────────────────────────────────
  // Push a candle slice through every series + indicator. Indicators read
  // candlesRef, so pointing it at the slice truncates them for free.
  /**
   * Splice a short tail of freshly fetched bars into the live array.
   *
   * Used by the REST fallback below, which runs when the socket is open but
   * delivering nothing. Deliberately not `applyReplayCandles`: that re-sets
   * every series from a 1000-bar array, which is far too much to repeat every
   * few seconds just to move the last candle.
   */
  function mergeLiveCandles(tail: Candle[]) {
    if (tail.length === 0 || !candleSeriesRef.current) return;
    const arr = candlesRef.current;
    for (const k of tail) {
      const last = arr[arr.length - 1];
      if (last && last.time === k.time) arr[arr.length - 1] = k;
      else if (!last || k.time > last.time) {
        arr.push(k);
        if (arr.length > 2000) arr.shift();
      } else continue;
      const t = k.time as UTCTimestamp;
      candleSeriesRef.current.update({ time: t, open: k.open, high: k.high, low: k.low, close: k.close });
      lineSeriesRef.current?.update({ time: t, value: k.close });
      areaSeriesRef.current?.update({ time: t, value: k.close });
      volumeSeriesRef.current?.update({
        time: t,
        value: k.volume,
        color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
      });
    }
    updateEMAs();
    updateVWAP();
    updateRSI();
    updateStochRsi();
    updateMACD();
    updateADX();
    updateSqueeze();
    updateVumanchu();
    updateOBV();
    const last = arr[arr.length - 1];
    const prev = arr[arr.length - 2] ?? last;
    if (last) {
      const lp = {
        value: last.close,
        pct: prev.close === 0 ? 0 : ((last.close - prev.close) / prev.close) * 100,
      };
      setLastPrice(lp);
      setCurrentLivePrice(lp.value);
    }
  }

  function applyReplayCandles(arr: Candle[]) {
    candlesRef.current = arr;
    globalCandlesRef.current = arr;
    if (candleSeriesRef.current) {
      candleSeriesRef.current.setData(
        arr.map((k) => ({ time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close })),
      );
    }
    const closeData = arr.map((k) => ({ time: k.time as UTCTimestamp, value: k.close }));
    lineSeriesRef.current?.setData(closeData);
    areaSeriesRef.current?.setData(closeData);
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.setData(
        arr.map((k) => ({
          time: k.time as UTCTimestamp,
          value: k.volume,
          color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
        })),
      );
    }
    updateEMAs();
    updateVWAP();
    updateRSI();
    updateStochRsi();
    updateMACD();
    updateADX();
    updateSqueeze();
    updateVumanchu();
    updateOBV();
    if (arr.length) {
      const last = arr[arr.length - 1];
      const prev = arr[arr.length - 2] ?? last;
      setLastPrice({ value: last.close, pct: prev.close === 0 ? 0 : ((last.close - prev.close) / prev.close) * 100 });
      setCurrentLivePrice(last.close);
    }
  }

  // Re-apply the price pane's share whenever it changes.
  //
  // The sub-pane effects set it when they create their pane, but `useIsMobile`
  // is false on the first render by design (it is SSR-safe and only learns the
  // real width after mount), so those effects had already run with the desktop
  // value. Without this the phone layout silently kept the 3:1:1 split.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      chart.panes()[0]?.setStretchFactor(mainPaneStretch);
    } catch {
      // Pane 0 always exists once the chart is built; ignore a teardown race.
    }
  }, [mainPaneStretch, indicators]);

  // A new symbol or timeframe starts with no tick of its own.
  useEffect(() => {
    resetChartTick();
  }, [symbol, timeframe]);

  // Repair stale data, whatever caused it.
  //
  // The socket watchdog in the WS clients catches a feed that has gone silent,
  // and the status-transition effect below refetches once it comes back. Both
  // reason about the *connection*. This one reasons about the **data**, which
  // is what the user actually sees: if the newest bar's close time is already
  // in the past and no successor has arrived, the chart is frozen — and it
  // does not matter whether that was a half-open socket, a laptop waking from
  // sleep, a dropped subscription, a reconnect that raced, or something not
  // thought of yet. Checking the symptom covers every cause at once, so this
  // is the backstop that makes "the chart is stuck" self-healing rather than
  // something to diagnose.
  //
  // Restricted to the streaming sources on purpose: a REST-poll series (FRED
  // updates at most daily) is *legitimately* older than its last bar's close,
  // and would refetch forever.
  useEffect(() => {
    const kind = resolveSource(symbol).kind;
    if (kind !== "binance" && kind !== "bybit") return;

    let cancelled = false;
    let inFlight = false;
    const startedAt = Date.now();

    const isStale = () => {
      const arr = candlesRef.current;
      const last = arr[arr.length - 1];
      if (!last) return false;
      return Date.now() / 1000 > barCloseTime(last.time, timeframe) + STALE_BAR_GRACE_SEC;
    };

    const repair = async () => {
      if (cancelled || inFlight || document.hidden) return;
      if (useReplayStore.getState().active) return;

      // Two different silences, with two different repairs.
      //
      // A quiet *stream* means this symbol stopped delivering while the socket
      // is otherwise fine — the shared Binance connection also carries the
      // watchlist's miniTickers, so it keeps looking alive and its own
      // watchdog never fires. Refetching would paper over that until the next
      // bar; what it needs is the subscription rebuilt.
      // Two different questions, and conflating them breaks one or the other.
      //
      // "Is the stream quiet?" must count from mount when no tick has *ever*
      // arrived — a socket that opens and never delivers is the whole reason
      // the REST fallback exists, and keying it on tick age alone (Infinity
      // forever) silently disabled the fallback in exactly that case.
      //
      // "May I rebuild the subscription?" is stricter: before the first tick
      // the initial fetch may still be in flight and the subscription may not
      // exist yet, so tearing it down cancels the load. Give it a fair chance
      // first.
      const tickAge = chartTickAgeMs();
      const quietFor = tickAge === Infinity ? Date.now() - startedAt : tickAge;
      const streamQuiet = quietFor > CHART_TICK_STALE_MS;
      const mayResubscribe =
        tickAge !== Infinity || Date.now() - startedAt > RESUBSCRIBE_MIN_GAP_MS;
      const barsStale = isStale();
      if (!streamQuiet && !barsStale) return;

      if (
        streamQuiet &&
        mayResubscribe &&
        Date.now() - lastResubAtRef.current > RESUBSCRIBE_MIN_GAP_MS
      ) {
        lastResubAtRef.current = Date.now();
        setFeedNonce((n) => n + 1);
        // The rebuild refetches on its own; don't also pull here.
        return;
      }

      inFlight = true;
      try {
        if (barsStale) {
          // A hole where closed bars should be: only a full refetch fills it.
          const fresh = await fetchCandles(symbol, timeframe, 1000);
          if (cancelled || useReplayStore.getState().active || fresh.length === 0) return;
          applyReplayCandles(fresh);
        } else {
          // Socket open but mute, and the bars are still current: keep the
          // chart live over REST instead of standing still until the bar
          // rolls. A short tail is all that can have changed.
          const tail = await fetchCandles(symbol, timeframe, 3);
          if (cancelled || useReplayStore.getState().active) return;
          mergeLiveCandles(tail);
        }
      } catch (e) {
        console.error("Feed fallback fetch failed:", e);
      } finally {
        inFlight = false;
      }
    };

    const id = setInterval(() => void repair(), STALE_BAR_CHECK_MS);
    // Coming back to the tab is the single most likely moment to be stale —
    // a sleeping machine delivers no WS frames and fires no timers.
    const onWake = () => void repair();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe]);

  // Recover the bars missed while the socket was gone.
  //
  // A kline stream only sends updates from the moment of subscription, so a
  // reconnect resumes the live bar but leaves a hole where every bar that
  // closed during the outage should be: the chart looks current while the last
  // few minutes are quietly missing, and the bar-close countdown counts down
  // against a stale bar. Refetching on the way back up is the only way to
  // close that gap.
  useEffect(() => {
    const src = resolveSource(symbol);
    if (src.kind !== "binance" && src.kind !== "bybit") return;
    const emitter =
      src.kind === "bybit" ? getBybitWS().status : getBinanceWS().statusFor(symbol);

    // Read before subscribing: `subscribe` replays the current value, and an
    // already-live feed must not be mistaken for a recovery.
    //
    // `seenFirst` covers the other end of the same mistake: on a cold load the
    // emitter starts at "down" and the socket's first connect flips it to
    // "live", which is not a recovery from anything — treating it as one made
    // every page load fetch 1000 bars twice.
    let wasLive = emitter.get() === "live";
    let seenFirst = false;
    let cancelled = false;
    const unsub = emitter.subscribe((st) => {
      const live = st === "live";
      const recovered = live && !wasLive && seenFirst;
      wasLive = live;
      seenFirst = true;
      // Only on the way back up, and never before the initial fetch has put
      // something on the chart — that path already loads fresh data itself.
      if (!recovered || candlesRef.current.length === 0) return;
      if (useReplayStore.getState().active) return;
      void (async () => {
        try {
          const fresh = await fetchCandles(symbol, timeframe, 1000);
          if (cancelled || useReplayStore.getState().active || fresh.length === 0) return;
          applyReplayCandles(fresh);
        } catch (e) {
          console.error("Reconnect refetch failed:", e);
        }
      })();
    });
    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe]);

  // Enter: snapshot the full array. Exit: refetch fresh (also catches bars that
  // closed while replay was frozen) and let the live WS resume.
  useEffect(() => {
    if (replayActive) {
      const full = candlesRef.current.slice();
      replayFullRef.current = full;
      useReplayStore.getState().setTotal(full.length);
    } else if (replayFullRef.current.length) {
      replayFullRef.current = [];
      let cancelled = false;
      (async () => {
        try {
          const fresh = await fetchCandles(symbol, timeframe, 1000);
          if (cancelled || useReplayStore.getState().active) return;
          applyReplayCandles(fresh);
        } catch (e) {
          console.error("Replay exit refetch failed:", e);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayActive]);

  // Render the truncated slice as the playhead moves. We subscribe to the replay
  // store imperatively and coalesce work to a single animation frame: holding the
  // step key (or a fast play speed) advances the cursor faster than the chart can
  // redraw, so we always render only the LATEST cursor once per frame — bounding
  // the work regardless of input rate (fixes the renderer OOM crash).
  useEffect(() => {
    if (!replayActive) return;
    let raf = 0;
    let lastRendered = -1;

    const apply = () => {
      raf = 0;
      const { cursorIndex, picking, active } = useReplayStore.getState();
      if (!active || picking) return;
      const full = replayFullRef.current;
      if (!full.length || cursorIndex === lastRendered) return;
      const isFirst = lastRendered === -1; // the initial placement render
      lastRendered = cursorIndex;
      applyReplayCandles(full.slice(0, Math.min(cursorIndex + 1, full.length)));
      // Never move the viewport on the initial pick — later candles just vanish
      // in place. Once advancing, follow the right edge only when the cursor
      // scrolls off (so panning back to inspect stays free).
      if (isFirst) return;
      const ts = chartRef.current?.timeScale();
      const vr = ts?.getVisibleLogicalRange();
      if (ts && vr && cursorIndex > vr.to - 1) {
        const width = vr.to - vr.from;
        ts.setVisibleLogicalRange({ from: cursorIndex - width + 4, to: cursorIndex + 4 });
      }
    };

    const schedule = () => {
      if (raf) return; // one apply per frame — coalesce rapid ticks
      raf = requestAnimationFrame(apply);
    };

    schedule(); // render the starting slice
    const unsub = useReplayStore.subscribe(schedule);
    return () => {
      unsub();
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayActive]);

  // Auto-advance while playing (speed = bars per second).
  useEffect(() => {
    if (!replayActive || replayPicking || !replayPlaying) return;
    const id = setInterval(
      () => useReplayStore.getState().stepForward(),
      Math.max(50, Math.round(1000 / replaySpeed)),
    );
    return () => clearInterval(id);
  }, [replayActive, replayPicking, replayPlaying, replaySpeed]);

  // Changing symbol/timeframe cancels replay (the load effect reloads fresh data).
  useEffect(() => {
    if (useReplayStore.getState().active) useReplayStore.getState().exit();
  }, [symbol, timeframe]);

  const greenOrRed = (n: number) =>
    n >= 0 ? "text-tv-green" : "text-tv-red";

  // Helpers for pill rendering
  const isShown = (key: IndicatorKey) =>
    indicators[key] && (key === "volume" || true); // always renderable if enabled
  void isShown;

  // Determine which pane each indicator lives in (based on current layout)
  // Order: RSI > MACD > ADX > Squeeze > VuManChu. Overlaid indicators reuse
  // the target's index instead of taking their own.
  const indicatorPaneIdx: Record<
    "rsi" | "stochrsi" | "macd" | "adx" | "squeeze" | "vumanchu",
    number
  > = (() => {
    const order: Array<"rsi" | "stochrsi" | "macd" | "adx" | "squeeze" | "vumanchu"> = [
      "rsi",
      "stochrsi",
      "macd",
      "adx",
      "squeeze",
      "vumanchu",
    ];
    const out: Record<string, number> = {};
    let idx = 1;
    for (const k of order) {
      const target = indicatorOverlays[k];
      if (target && target !== "own" && indicators[target]) {
        // Shares the target's pane (computed earlier in the loop)
        out[k] = out[target] ?? idx;
      } else {
        out[k] = idx;
        if (indicators[k]) idx++;
      }
    }
    return out as Record<"rsi" | "stochrsi" | "macd" | "adx" | "squeeze" | "vumanchu", number>;
  })();
  indicatorPaneIdxRef.current = indicatorPaneIdx;
  const rsiPaneIdx = indicatorPaneIdx.rsi;
  const stochRsiPaneIdx = indicatorPaneIdx.stochrsi;
  const macdPaneIdx = indicatorPaneIdx.macd;
  const adxPaneIdx = indicatorPaneIdx.adx;
  const squeezePaneIdx = indicatorPaneIdx.squeeze;
  const vumanchuPaneIdx = indicatorPaneIdx.vumanchu;

  // ── Overlay drag state — computed at component scope so pointer drag effect can read it ──
  type PaneEntry = { key: IndicatorKey; paneIdx: number; name: string; value?: string };
  const subPaneEntries: PaneEntry[] = (
    [
      { key: "rsi" as IndicatorKey, paneIdx: rsiPaneIdx, name: `RSI ${config.rsi}`, value: lastValues.rsi !== undefined ? lastValues.rsi.toFixed(2) : undefined },
      {
        key: "stochrsi" as IndicatorKey,
        paneIdx: stochRsiPaneIdx,
        name: `Stoch RSI ${config.stochRsiK}, ${config.stochRsiD}, ${config.stochRsiStochLength}, ${config.stochRsiLength}`,
        value:
          lastValues.stochRsiK !== undefined
            ? `${lastValues.stochRsiK.toFixed(2)} / ${(lastValues.stochRsiD ?? 0).toFixed(2)}`
            : undefined,
      },
      { key: "macd" as IndicatorKey, paneIdx: macdPaneIdx, name: `MACD ${config.macdFast}, ${config.macdSlow}, ${config.macdSignal}`, value: lastValues.macd !== undefined ? `${lastValues.macd.toFixed(2)} / ${(lastValues.macdSignal ?? 0).toFixed(2)}` : undefined },
      { key: "adx" as IndicatorKey, paneIdx: adxPaneIdx, name: `ADX ${config.adx}` },
      { key: "squeeze" as IndicatorKey, paneIdx: squeezePaneIdx, name: "Squeeze Momentum" },
      { key: "vumanchu" as IndicatorKey, paneIdx: vumanchuPaneIdx, name: "VuManChu Cipher B" },
    ] as PaneEntry[]
  ).filter((p) => indicators[p.key]);

  const subPaneActiveKeys = new Set(subPaneEntries.map((p) => p.key));
  const ownedSubPanes = subPaneEntries.filter((p) => {
    const target = indicatorOverlays[p.key];
    if (!target || target === "own") return true;
    if (!subPaneActiveKeys.has(target as IndicatorKey)) return true;
    if (indicatorOverlays[target as IndicatorKey] === p.key) return true;
    return false;
  });
  const ownedSubPaneKeySet = new Set(ownedSubPanes.map((p) => p.key));

  // Main-pane pill row (EMAs, Volume, Key Levels) — ordered by mainPaneOrder,
  // with new/unlisted pills appended at the end in their natural order.
  const mainPaneEntries: { key: string; node: React.ReactNode }[] = [
    ...userEMAs.map((e) => ({
      key: `ema:${e.id}`,
      node: (
        <IndicatorPill
          name={`EMA ${e.period}`}
          color={e.color}
          hidden={e.hidden}
          onToggleHide={() => toggleUserEMAHidden(e.id)}
          onSettings={() => setSettingsTarget({ kind: "ema", id: e.id })}
          onRemove={() => removeUserEMA(e.id)}
        />
      ),
    })),
    ...(indicators.volume
      ? [
          {
            key: "volume",
            node: (
              <IndicatorPill
                name="Vol"
                value={lastValues.volume !== undefined ? formatVolume(lastValues.volume) : undefined}
                color={INDICATOR_COLORS.volume}
                hidden={hidden.volume}
                onToggleHide={() => toggleHidden("volume")}
                onSettings={() => setSettingsTarget("volume")}
                onRemove={() => removeIndicator("volume")}
              />
            ),
          },
        ]
      : []),
    ...(indicators.vwap
      ? [
          {
            key: "vwap",
            node: (
              <IndicatorPill
                name={`VWAP ${vwapStyle.anchor.toUpperCase()}`}
                color={vwapStyle.color}
                hidden={hidden.vwap}
                onToggleHide={() => toggleHidden("vwap")}
                onSettings={() => setSettingsTarget("vwap")}
                onRemove={() => removeIndicator("vwap")}
              />
            ),
          },
        ]
      : []),
    ...(indicators.keylevels
      ? [
          {
            key: "keylevels",
            node: (
              <IndicatorPill
                name="Key Levels"
                color={INDICATOR_COLORS.keylevels}
                hidden={hidden.keylevels}
                onToggleHide={() => toggleHidden("keylevels")}
                onSettings={() => setSettingsTarget("keylevels")}
                onRemove={() => removeIndicator("keylevels")}
              />
            ),
          },
        ]
      : []),
  ].sort((a, b) => {
    const ia = mainPaneOrder.indexOf(a.key);
    const ib = mainPaneOrder.indexOf(b.key);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  // Pointer-based drag — more reliable than HTML5 DnD which breaks on React re-renders
  useEffect(() => {
    if (!dragKey) return;
    function onPointerUp(e: PointerEvent) {
      const dk = pointerDragRef.current?.key;
      if (!dk) { setDragKey(null); return; }
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        const relY = e.clientY - containerRect.top;
        for (const p of ownedSubPanes) {
          const offset = paneOffsets[p.paneIdx];
          if (!offset) continue;
          if (relY >= offset.top && relY <= offset.top + offset.height) {
            if (dk !== p.key) {
              if (indicatorOverlays[p.key] === dk) setIndicatorOverlay(p.key, "own");
              setIndicatorOverlay(dk, p.key);
            } else if (indicatorOverlays[dk] && indicatorOverlays[dk] !== "own") {
              setIndicatorOverlay(dk, "own");
            }
            break;
          }
        }
      }
      pointerDragRef.current = null;
      setDragKey(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        pointerDragRef.current = null;
        setDragKey(null);
        setMeasure(INITIAL_MEASURE);
      }
    }
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragKey]);

  // Capture-phase mousedown: handles shift+click for measure regardless of SVG overlay
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    function onShiftCapture(e: MouseEvent) {
      const isPlacing = measureRef.current.phase === "placing";
      if (!e.shiftKey && !isPlacing) return;
      // Don't hijack shift+click while a drawing tool is active — there Shift
      // means "constrain the line to horizontal/vertical", handled by the chart
      // click handler. The quick-measure shortcut only applies from the cursor.
      if (!isPlacing && toolRef.current !== "cursor") return;
      if (!containerRef.current || !chartRef.current || !candleSeriesRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const rawPrice = candleSeriesRef.current.coordinateToPrice(y);
      if (rawPrice === null || !isFinite(rawPrice as number)) return;
      const price = rawPrice as number;
      const intervalSec = timeframeToSeconds(useChartStore.getState().timeframe);
      const time = xToTime(chartRef.current, x, candlesRef.current, intervalSec);
      if (time === null) return;
      if (isPlacing) {
        setMeasure({ phase: "done", a: measureRef.current.a, b: { time, price } });
      } else {
        setMeasure({ phase: "placing", a: { time, price }, b: { time, price } });
      }
      e.stopPropagation();
    }
    outer.addEventListener("mousedown", onShiftCapture, { capture: true });
    return () => outer.removeEventListener("mousedown", onShiftCapture, { capture: true });
  }, []);

  // OHLC/Vol legend + native crosshair fallback: chart.subscribeCrosshairMove
  // (and the crosshair lines it drives) only fire for mousemoves whose real
  // DOM target lands on the chart's own canvas, but drawing overlays are a
  // sibling that paints on top and becomes the actual target whenever the
  // cursor is over one (e.g. inside a Long/Rectangle/Fib box) — so hovering a
  // candle "under" a drawing would otherwise show neither the legend nor the
  // dotted crosshair. This computes/positions both independently, deferring
  // to the native path (skipping) whenever the canvas itself got the event.
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    function onHoverCapture(e: MouseEvent) {
      if (!containerRef.current || !chartRef.current || !candleSeriesRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return; // native path handles it
      const rect = containerRef.current.getBoundingClientRect();
      if (
        e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom
      ) {
        return;
      }
      const y = e.clientY - rect.top;
      const rawPrice = candleSeriesRef.current.coordinateToPrice(y);
      if (rawPrice === null) return;
      const intervalSec = timeframeToSeconds(useChartStore.getState().timeframe);
      const x = e.clientX - rect.left;
      const time = xToTime(chartRef.current, x, candlesRef.current, intervalSec);
      const candles = candlesRef.current;
      if (time === null || candles.length === 0) return;
      const candle = candles.reduce((best, c) =>
        Math.abs(c.time - time) < Math.abs(best.time - time) ? c : best,
      );
      setHover({
        o: candle.open,
        h: candle.high,
        l: candle.low,
        c: candle.close,
        v: candle.volume,
        time: candle.time,
        pct: candle.open === 0 ? 0 : ((candle.close - candle.open) / candle.open) * 100,
      });
      // Draws the dotted guide lines + axis labels via the library's own
      // public API, since we can't dispatch a real DOM event onto its canvas.
      // Uses the exact extrapolated cursor time (not the snapped `candle`
      // used for the legend above) — CrosshairMode.Normal follows the cursor
      // exactly rather than snapping to bars, and snapping here pinned the
      // crosshair to the last candle whenever the cursor was past it (e.g.
      // over a drawing that extends into the right-offset margin).
      chartRef.current.setCrosshairPosition(
        rawPrice as number,
        time as UTCTimestamp,
        candleSeriesRef.current,
      );
    }
    function onLeave() {
      setHover(null);
      chartRef.current?.clearCrosshairPosition();
    }
    outer.addEventListener("mousemove", onHoverCapture, { capture: true });
    outer.addEventListener("mouseleave", onLeave);
    return () => {
      outer.removeEventListener("mousemove", onHoverCapture, { capture: true });
      outer.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  // Pressing/releasing Shift snaps the placement preview to horizontal/vertical
  // instantly (no mouse move needed), matching TradingView.
  useEffect(() => {
    function onShiftToggle(e: KeyboardEvent) {
      if (e.key !== "Shift") return;
      shiftHeldRef.current = e.shiftKey; // keydown → true, keyup → false
      const first = firstPointRef.current;
      const last = lastCursorRef.current;
      if (
        !first ||
        !last ||
        !AXIS_CONSTRAIN_TOOLS.has(toolRef.current) ||
        !chartRef.current ||
        !candleSeriesRef.current
      ) {
        return;
      }
      const intervalSec = timeframeToSeconds(useChartStore.getState().timeframe);
      const pc = e.shiftKey
        ? constrainToAxis(chartRef.current, candleSeriesRef.current, candlesRef.current, intervalSec, first, last)
        : last;
      setPreviewState((prev) => (prev ? { ...prev, cursor: pc } : prev));
    }
    window.addEventListener("keydown", onShiftToggle);
    window.addEventListener("keyup", onShiftToggle);
    return () => {
      window.removeEventListener("keydown", onShiftToggle);
      window.removeEventListener("keyup", onShiftToggle);
    };
  }, []);

  let measureRender: React.ReactNode = null;
  if (
    measure.a &&
    measure.b &&
    chartRef.current &&
    candleSeriesRef.current
  ) {
    const intervalSec = timeframeToSeconds(useChartStore.getState().timeframe);
    const aX = timeToX(chartRef.current, measure.a.time, candlesRef.current, intervalSec);
    const bX = timeToX(chartRef.current, measure.b.time, candlesRef.current, intervalSec);
    const aY = candleSeriesRef.current.priceToCoordinate(measure.a.price);
    const bY = candleSeriesRef.current.priceToCoordinate(measure.b.price);

    if (aX !== null && bX !== null && aY !== null && bY !== null) {
      const priceDiff = measure.b.price - measure.a.price;
      const pctChange =
        measure.a.price === 0 ? 0 : (priceDiff / measure.a.price) * 100;
      const isUp = priceDiff >= 0;
      const start = Math.min(measure.a.time, measure.b.time);
      const end = Math.max(measure.a.time, measure.b.time);
      const inRange = candlesRef.current.filter(
        (c) => c.time >= start && c.time <= end,
      );
      const bars = inRange.length;
      const volume = inRange.reduce((s, c) => s + c.volume, 0);
      const dur = durationLabel(measure.a.time, measure.b.time);

      measureRender = (
        <MeasureOverlay
          aX={aX}
          aY={aY}
          bX={bX}
          bY={bY}
          priceDiff={priceDiff}
          pctChange={pctChange}
          bars={bars}
          volume={volume}
          durationText={dur}
          isUp={isUp}
          isPreview={measure.phase === "placing"}
        />
      );
    }
  }
  void renderTick;

  return (
    <div ref={outerRef} className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <DrawingsLayer
        symbol={symbol}
        chart={chartRef.current}
        candleSeries={candleSeriesRef.current}
        container={containerRef.current}
        width={containerSize.width}
        height={containerSize.height}
        mainPaneHeight={paneOffsets[0]?.height ?? containerSize.height}
        chartAreaWidth={chartRef.current ? chartRef.current.timeScale().width() : containerSize.width}
        renderTick={renderTick}
      />
      <OrderLinesLayer
        chart={chartRef.current}
        candleSeries={candleSeriesRef.current}
        container={containerRef.current}
        width={containerSize.width}
        mainPaneHeight={paneOffsets[0]?.height ?? containerSize.height}
        renderTick={renderTick}
      />

      {indicators.keylevels && !hidden.keylevels && (
        <KeyLevelsOverlay
          chart={chartRef.current}
          candleSeries={candleSeriesRef.current}
          levels={computeKeyLevels(candlesRef.current, keyLevelsCfg)}
          chartAreaWidth={chartRef.current ? chartRef.current.timeScale().width() : containerSize.width}
          chartHeight={containerSize.height}
          mainPaneHeight={paneOffsets[0]?.height ?? containerSize.height}
          textSize={keyLevelsCfg.textSize}
          lineWidth={keyLevelsCfg.lineWidth}
          rightMargin={keyLevelsCfg.distance}
        />
      )}

      {indicators.squeeze && !subPanesHidden && paneOffsets[squeezePaneIdx] && paneOffsets[squeezePaneIdx].height > 0 && (
        <SqueezeOverlay
          chart={chartRef.current}
          squeezeSeries={squeezeHistRef.current}
          width={containerSize.width}
          height={containerSize.height}
          paneTop={paneOffsets[squeezePaneIdx].top}
          paneHeight={paneOffsets[squeezePaneIdx].height}
          pts={squeezePts}
          visible={squeezeStyle.showMomentum && !hidden.squeeze}
          colorMap={{
            lime: squeezeStyle.momentumIncPos,
            green: squeezeStyle.momentumDecPos,
            red: squeezeStyle.momentumDecNeg,
            maroon: squeezeStyle.momentumIncNeg,
          }}
          chartAreaWidth={chartRef.current ? chartRef.current.timeScale().width() : containerSize.width}
          screenBlend={
            indicators.adx &&
            (indicatorOverlays.adx === "squeeze" || indicatorOverlays.squeeze === "adx") &&
            (() => {
              const hostKey: IndicatorKey =
                indicatorOverlays.squeeze === "adx" ? "adx" : "squeeze";
              const zOrder = paneZOrder[hostKey];
              return (
                !zOrder ||
                !zOrder.includes("adx") ||
                !zOrder.includes("squeeze") ||
                zOrder.indexOf("adx") > zOrder.indexOf("squeeze")
              );
            })()
          }
        />
      )}
      {previewState && (
        <PlacementPreview
          tool={tool}
          first={previewState.first}
          extra={previewState.extra}
          cursor={previewState.cursor}
          chart={chartRef.current}
          candleSeries={candleSeriesRef.current}
          candles={candlesRef.current}
          intervalSec={timeframeToSeconds(timeframe)}
          width={containerSize.width}
          height={containerSize.height}
        />
      )}
      {ctrlHeld && magnetTarget && (
        <MagnetIndicator
          target={magnetTarget}
          chart={chartRef.current}
          candleSeries={candleSeriesRef.current}
          candles={candlesRef.current}
          intervalSec={timeframeToSeconds(timeframe)}
          width={containerSize.width}
          height={containerSize.height}
        />
      )}
      {measureRender}

      {showBarCountdown && !replayActive && (
        <BarCountdown
          chart={chartRef.current}
          candleSeries={candleSeriesRef.current}
          timeframe={timeframe}
          lastPrice={lastPrice?.value ?? null}
          containerWidth={containerSize.width}
          mainPaneHeight={paneOffsets[0]?.height ?? containerSize.height}
          renderTick={renderTick}
        />
      )}

      <FloatingContextToolbar
        containerSize={containerSize}
        onOpenSettings={() => {
          const id = useDrawingsStore.getState().selectedId;
          if (id) useDrawingsStore.getState().setEditing(id);
        }}
      />

      {/* A / L buttons per pane — positioned at the bottom-right of each
          pane (just above the next pane separator / time axis) */}
      {paneOffsets.map((p, paneIdx) => {
        // Resolve which indicator owns this pane (for log scale state)
        let key: "main" | IndicatorKey = "main";
        if (paneIdx > 0) {
          for (const k of [
            "rsi",
            "stochrsi",
            "macd",
            "adx",
            "squeeze",
            "vumanchu",
          ] as const) {
            if (indicatorPaneIdx[k] === paneIdx && indicators[k]) {
              key = k;
              break;
            }
          }
        }
        const isLog =
          key === "main" ? logScale : !!indicatorLogScale[key as IndicatorKey];
        const toggleLog = () => {
          if (key === "main") {
            useChartStore.getState().setLogScale(!logScale);
          } else {
            useChartStore
              .getState()
              .setIndicatorLogScale(key as IndicatorKey, !isLog);
          }
        };
        const autoFit = () => {
          if (!chartRef.current) return;
          if (key === "main") {
            // Rescale the price axis only — matching TradingView's "Auto"
            // button, this must NOT touch pan/zoom (timeScale) at all.
            candleSeriesRef.current?.priceScale().applyOptions({ autoScale: true });
          } else {
            // Reset just the price scale of the pane to auto
            const seriesByPane = {
              rsi: rsiRef.current,
              stochrsi: stochRsiKRef.current,
              macd: macdRef.current,
              adx: adxRef.current,
              squeeze: squeezeHistRef.current,
              vumanchu: vmcWt2Ref.current,
            } as const;
            const s = seriesByPane[key as keyof typeof seriesByPane];
            if (s) {
              s.priceScale().applyOptions({ autoScale: true });
            }
          }
          setAutoScaleOn((prev) => ({ ...prev, [key]: true }));
        };
        const autoScaleActive = autoScaleOn[key] ?? true;
        return (
          <div
            key={paneIdx}
            style={{
              top: p.top + p.height - 26,
              right: 4,
            }}
            className="pointer-events-auto absolute z-10 flex items-center gap-0.5"
          >
            <button
              onClick={autoFit}
              title="Auto scale"
              className={`flex h-5 w-5 items-center justify-center rounded border border-tv-border text-[10px] font-semibold transition-colors ${
                autoScaleActive
                  ? "bg-tv-blue/20 text-tv-blue"
                  : "bg-tv-panel text-tv-text-muted hover:text-tv-text"
              }`}
            >
              A
            </button>
            <button
              onClick={toggleLog}
              title={isLog ? "Switch to linear" : "Switch to logarithmic"}
              className={`flex h-5 w-5 items-center justify-center rounded border border-tv-border text-[10px] font-semibold transition-colors ${
                isLog
                  ? "bg-tv-blue/20 text-tv-blue"
                  : "bg-tv-panel text-tv-text-muted hover:text-tv-text"
              }`}
            >
              L
            </button>
          </div>
        );
      })}

      {/* Top-left of main pane: symbol info + OHLC + Volume pill + EMA pills */}
      <div
        style={{ top: (paneOffsets[0]?.top ?? 0) + 12, left: 12 }}
        className="pointer-events-none absolute z-10 flex flex-col gap-1 text-xs tabular-nums"
      >
        {/* Row 1: symbol · timeframe · Binance + live price inline; OHLC on hover */}
        <div
          className={
            // On a phone the whole line — symbol, timeframe, venue, then four
            // OHLC figures and a volume — is far wider than the screen, and
            // `nowrap` + `overflow-hidden` silently cut it off mid-number.
            // Wrapping is better than truncating a price.
            isMobile
              ? "flex max-w-[88vw] flex-wrap items-center gap-x-2 text-[12px]"
              : "flex flex-nowrap items-center gap-x-2 overflow-hidden whitespace-nowrap text-[12px]"
          }
        >
          <span className="font-semibold text-tv-text">{symbol}</span>
          {/* While a candle is being read, the timeframe and venue are the
              least useful things on the line; on a phone they give way. */}
          {!(isMobile && hover) && (
            <>
          <span className="text-tv-text-muted">·</span>
          <span className="font-semibold text-tv-text-muted">{timeframeLabel(timeframe)}</span>
          <span className="text-tv-text-muted">·</span>
          <span className="font-semibold text-tv-text-muted">
            {(() => {
              const k = resolveSource(symbol).kind;
              if (k === "fred") return "FRED";
              if (k === "coingecko") return "CoinGecko";
              if (k === "yahoo") return "Yahoo";
              if (k === "synthetic") return "Synthetic";
              if (k === "bybit") return "Bybit";
              return "Binance";
            })()}
          </span>
            </>
          )}
          {!hover && lastPrice && (
            <>
              <span className={`font-semibold tabular-nums ${greenOrRed(lastPrice.pct)}`}>
                {formatPrice(lastPrice.value)}
              </span>
              <span className={`text-[10px] ${greenOrRed(lastPrice.pct)}`}>
                {lastPrice.pct >= 0 ? "+" : ""}{lastPrice.pct.toFixed(2)}%
              </span>
            </>
          )}
          {!hover && !lastPrice && (
            <span className="text-[10px] text-tv-text-muted">Loading…</span>
          )}
          {hover && (
            <div className={isMobile
              ? "flex flex-wrap items-center gap-x-1.5 text-[10px]"
              : "flex items-center gap-x-2 text-[11px]"}>
              <span className="text-tv-text-muted">
                O <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.o)}</span>
              </span>
              <span className="text-tv-text-muted">
                H <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.h)}</span>
              </span>
              <span className="text-tv-text-muted">
                L <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.l)}</span>
              </span>
              <span className="text-tv-text-muted">
                C <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.c)}</span>
              </span>
              <span className={greenOrRed(hover.pct)}>
                {hover.pct >= 0 ? "+" : ""}{hover.pct.toFixed(2)}%
              </span>
              {/* Volume is already on its own pill; on a phone that repeat
                  is what pushes OHLC onto a second line. */}
              {!isMobile && (
                <span className="text-tv-text-muted">
                  Vol <span className="text-tv-text">{formatVolume(hover.v)}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Row 2: quick-trade buttons (only when exchange is connected) */}
        <BuySellOverlay />

        {/* Indicator pills for the main pane (collapsible) */}
        <div
          className={
            // Wrap into rows on a phone instead of one chip per line: three
            // compact chips fit across a 400px plot, and stacking them pushed
            // the legend a third of the way down the candles.
            isMobile
              ? "mt-1 flex max-w-[82%] flex-row flex-wrap items-start gap-1"
              : "mt-1 flex flex-col items-start gap-1"
          }
        >
          {!pillsCollapsed && (
            <>
              {mainPaneEntries.map((entry, i) => (
                <div key={entry.key} className="pointer-events-auto flex items-center gap-0.5">
                  {/* Reordering by 10px arrows is not a touch affordance; on a
                      phone the order is managed from the indicators sheet. */}
                  {!isMobile && mainPaneEntries.length > 1 && (
                    <div className="flex flex-col">
                      <button
                        title="Move up"
                        disabled={i === 0}
                        onClick={() => {
                          const order = mainPaneEntries.map((e) => e.key);
                          [order[i - 1], order[i]] = [order[i], order[i - 1]];
                          setMainPaneOrder(order);
                        }}
                        className={`flex h-2.5 w-3.5 items-center justify-center rounded text-[8px] leading-none ${i === 0 ? "cursor-default text-tv-text-dim/30" : "text-tv-text-dim hover:bg-tv-panel-hover hover:text-tv-text"}`}
                      >
                        ▲
                      </button>
                      <button
                        title="Move down"
                        disabled={i === mainPaneEntries.length - 1}
                        onClick={() => {
                          const order = mainPaneEntries.map((e) => e.key);
                          [order[i], order[i + 1]] = [order[i + 1], order[i]];
                          setMainPaneOrder(order);
                        }}
                        className={`flex h-2.5 w-3.5 items-center justify-center rounded text-[8px] leading-none ${i === mainPaneEntries.length - 1 ? "cursor-default text-tv-text-dim/30" : "text-tv-text-dim hover:bg-tv-panel-hover hover:text-tv-text"}`}
                      >
                        ▼
                      </button>
                    </div>
                  )}
                  {entry.node}
                </div>
              ))}
            </>
          )}
          {(userEMAs.length > 0 || indicators.volume || indicators.keylevels || ownedSubPanes.length > 0) && (
            <button
              onClick={() =>
                useChartStore.getState().setPillsCollapsed(!pillsCollapsed)
              }
              title={pillsCollapsed ? "Show indicators" : "Hide indicators"}
              aria-label={pillsCollapsed ? "Show indicators" : "Hide indicators"}
              className="pointer-events-auto flex h-5 w-5 items-center justify-center rounded bg-tv-panel/95 text-tv-text-muted ring-1 ring-tv-border hover:bg-tv-panel-hover hover:text-tv-text"
            >
              <ChevronUp
                className={`h-3.5 w-3.5 transition-transform ${
                  pillsCollapsed ? "rotate-180" : ""
                }`}
              />
            </button>
          )}
        </div>
      </div>

      {/* ── Sub-pane indicator pills with drag-to-overlay ─────────────────── */}
      {/* Drop zones — always in the DOM. Visible/active only while dragging.
          Skipped entirely while collapsed: a hidden pane is still ~2px tall,
          so its zone would sit as an invisible sliver over the price pane and
          swallow drops meant for the chart. */}
      {!subPanesHidden && ownedSubPanes.map((p) => {
        const offset = paneOffsets[p.paneIdx];
        if (!offset) return null;
        const isSource = !!dragKey && (dragKey === p.key || indicatorOverlays[dragKey] === p.key);
        const active = dragKey !== null;
        return (
          <div
            key={`drop-${p.key}`}
            style={{ top: offset.top, height: offset.height, left: 0, right: 0 }}
            className={`absolute z-20 border-2 transition-all duration-150 ${
              active
                ? isSource
                  ? "border-yellow-400/60 bg-yellow-400/5"
                  : "border-blue-400/60 bg-blue-400/10"
                : "pointer-events-none border-transparent bg-transparent"
            }`}
          >
            {active && (
              <span className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded bg-black/60 px-2 py-0.5 text-xs text-white/70">
                {isSource ? "Release to detach" : `Drop to overlay on ${p.name}`}
              </span>
            )}
          </div>
        );
      })}

      {/* Pills for each owned pane. Collapsed sub-panes are ~2px tall, so
          their pills would otherwise pile up as orphaned labels floating over
          the price pane instead of disappearing with the pane they name. */}
      {!pillsCollapsed && !subPanesHidden && ownedSubPanes.map((p) => {
        const offset = paneOffsets[p.paneIdx];
        if (!offset) return null;
        const guests = subPaneEntries.filter(
          (e) => indicatorOverlays[e.key] === p.key && !ownedSubPaneKeySet.has(e.key),
        );
        const allPaneEntries = [p, ...guests];
        const allPaneKeys = allPaneEntries.map((e) => e.key);
        const hasMultiple = allPaneKeys.length > 1;
        const savedOrder = paneZOrder[p.key];
        const effectiveZOrder =
          savedOrder && allPaneKeys.every((k) => savedOrder.includes(k))
            ? savedOrder
            : allPaneKeys; // default: host first, guests on top
        return (
          <div
            key={p.key}
            style={{ top: offset.top + 6, left: 12 }}
            className="pointer-events-none absolute z-10 flex flex-col items-start gap-1"
          >
            {allPaneEntries.map((entry) => {
              const isGuest = indicatorOverlays[entry.key] && indicatorOverlays[entry.key] !== "own";
              const posInOrder = effectiveZOrder.indexOf(entry.key);
              const isOnTop = posInOrder === effectiveZOrder.length - 1;
              const isOnBottom = posInOrder === 0;
              return (
                <div key={entry.key} className="pointer-events-auto flex items-center gap-0.5">
                  {/* Drag handle — uses pointer events (not HTML5 DnD) for reliability */}
                  <div
                    className={`cursor-grab select-none px-0.5 text-xs hover:text-white/60 active:cursor-grabbing ${dragKey === entry.key ? "text-white/80" : "text-white/30"}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      pointerDragRef.current = { key: entry.key };
                      setDragKey(entry.key);
                    }}
                  >
                    ⠿
                  </div>
                  {isGuest && (
                    <button
                      title="Detach to own pane"
                      className="flex h-5 w-5 items-center justify-center rounded text-[10px] text-white/40 hover:bg-white/10 hover:text-white/80"
                      onClick={() => setIndicatorOverlay(entry.key, "own")}
                    >
                      ⊞
                    </button>
                  )}
                  {/* Visual order buttons — only when pane has multiple indicators */}
                  {hasMultiple && (
                    <div className="flex flex-col">
                      <button
                        title="Bring to front"
                        disabled={isOnTop}
                        onClick={() => {
                          const newOrder = [...effectiveZOrder.filter((k) => k !== entry.key), entry.key];
                          setPaneZOrder(p.key, newOrder);
                        }}
                        className={`flex h-2.5 w-3.5 items-center justify-center rounded text-[8px] leading-none ${isOnTop ? "cursor-default text-white/15" : "text-white/40 hover:bg-white/10 hover:text-white/80"}`}
                      >
                        ▲
                      </button>
                      <button
                        title="Send to back"
                        disabled={isOnBottom}
                        onClick={() => {
                          const newOrder = [entry.key, ...effectiveZOrder.filter((k) => k !== entry.key)];
                          setPaneZOrder(p.key, newOrder);
                        }}
                        className={`flex h-2.5 w-3.5 items-center justify-center rounded text-[8px] leading-none ${isOnBottom ? "cursor-default text-white/15" : "text-white/40 hover:bg-white/10 hover:text-white/80"}`}
                      >
                        ▼
                      </button>
                    </div>
                  )}
                  <IndicatorPill
                    name={entry.name}
                    value={entry.value}
                    color={INDICATOR_COLORS[entry.key]}
                    hidden={hidden[entry.key]}
                    onToggleHide={() => toggleHidden(entry.key)}
                    onSettings={() => setSettingsTarget(entry.key)}
                    onRemove={() => removeIndicator(entry.key)}
                  />
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Bar-replay transport controls (only rendered once active — the entry
          trigger lives in the Header, next to Alert) */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2">
        <ReplayToolbar />
      </div>

      {/* Chart right-click context menu */}
      {chartContextMenu && (
        <>
          {/* Backdrop to close on outside click */}
          <div
            className="absolute inset-0 z-40"
            onMouseDown={() => setChartContextMenu(null)}
          />
          <div
            style={{
              top: Math.max(
                8,
                Math.min(
                  chartContextMenu.y,
                  containerSize.height - (chartContextMenu.region === "scale" ? 260 : 180),
                ),
              ),
              left: Math.max(8, Math.min(chartContextMenu.x, containerSize.width - 232)),
            }}
            className="absolute z-50 min-w-56 overflow-hidden rounded border border-tv-border bg-tv-panel py-1 shadow-2xl"
          >
            {chartContextMenu.region === "chart" && (
              <>
                <button
                  onMouseDown={() => {
                    openAlertDialog(chartContextMenu.price);
                    setChartContextMenu(null);
                  }}
                  className={MENU_ITEM_CLS}
                >
                  <Bell className="h-3.5 w-3.5 shrink-0 text-tv-yellow" />
                  <span>
                    Add alert on{" "}
                    <span className="font-medium">{symbol}</span> at{" "}
                    <span className="font-medium">{formatPrice(chartContextMenu.price)}</span>
                  </span>
                </button>
                <div className="my-1 h-px bg-tv-border" />
              </>
            )}

            <button
              onMouseDown={() => {
                if (chartContextMenu.region === "scale") {
                  // Price-scale-only auto-fit — rescales the Y axis to the
                  // currently visible candles without touching pan/zoom.
                  candleSeriesRef.current?.priceScale().applyOptions({ autoScale: true });
                } else {
                  chartRef.current?.timeScale().fitContent();
                  candleSeriesRef.current?.priceScale().applyOptions({ autoScale: true });
                }
                setChartContextMenu(null);
              }}
              className={MENU_ITEM_CLS}
            >
              <Maximize2 className="h-3.5 w-3.5 shrink-0 text-tv-text-muted" />
              <span>{chartContextMenu.region === "scale" ? "Auto (fit data)" : "Fit chart to data"}</span>
            </button>
            <button
              onMouseDown={() => {
                useChartStore.getState().setLogScale(!logScale);
                setChartContextMenu(null);
              }}
              className={MENU_ITEM_CLS}
            >
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[10px] font-bold text-tv-text-muted">
                L
              </span>
              <span>{logScale ? "Switch to linear scale" : "Switch to logarithmic scale"}</span>
            </button>

            {chartContextMenu.region === "scale" && (
              <>
                <button
                  onMouseDown={() => {
                    useChartStore
                      .getState()
                      .setMainPriceScaleMode(
                        mainPriceScaleMode === "percentage" ? "normal" : "percentage",
                      );
                    setChartContextMenu(null);
                  }}
                  className={MENU_ITEM_CLS}
                >
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[10px] font-bold text-tv-text-muted">
                    %
                  </span>
                  <span>{mainPriceScaleMode === "percentage" ? "Switch to regular scale" : "Percentage scale"}</span>
                </button>
                <button
                  onMouseDown={() => {
                    useChartStore
                      .getState()
                      .setMainPriceScaleMode(
                        mainPriceScaleMode === "indexed100" ? "normal" : "indexed100",
                      );
                    setChartContextMenu(null);
                  }}
                  className={MENU_ITEM_CLS}
                >
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[9px] font-bold text-tv-text-muted">
                    100
                  </span>
                  <span>{mainPriceScaleMode === "indexed100" ? "Switch to regular scale" : "Indexed to 100"}</span>
                </button>
                <button
                  onMouseDown={() => {
                    useChartStore.getState().toggleMainPriceScaleInverted();
                    setChartContextMenu(null);
                  }}
                  className={MENU_ITEM_CLS}
                >
                  <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-tv-text-muted" />
                  <span>{mainPriceScaleInverted ? "Un-invert scale" : "Invert scale"}</span>
                </button>
              </>
            )}

            {chartContextMenu.region === "chart" && (
              <>
                <div className="my-1 h-px bg-tv-border" />
                <button
                  onMouseDown={() => {
                    useChartStore.getState().setChartSettingsOpen(true);
                    setChartContextMenu(null);
                  }}
                  className={MENU_ITEM_CLS}
                >
                  <Settings2 className="h-3.5 w-3.5 shrink-0 text-tv-text-muted" />
                  <span>Chart settings…</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
