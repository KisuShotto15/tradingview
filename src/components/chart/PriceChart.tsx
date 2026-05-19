"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  AreaSeries,
  CrosshairMode,
  PriceScaleMode,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { fetchKlines } from "@/lib/binance/rest";
import { getBinanceWS } from "@/lib/binance/ws";
import {
  fetchSyntheticKlines,
  isSyntheticExpression,
  extractSymbols,
  evaluateCandleAt,
} from "@/lib/binance/synthetic";
import { ema, rsi, macd } from "@/lib/indicators";
import { adx as adxCalc } from "@/lib/indicators/adx";
import { squeezeMomentum } from "@/lib/indicators/squeeze";
import { vumanchu as vumanchuCalc } from "@/lib/indicators/vumanchu";
import type { Candle, Timeframe } from "@/lib/binance/types";
import {
  INDICATOR_COLORS,
  useChartStore,
  type IndicatorKey,
  DEFAULT_CHART_COLORS,
} from "@/lib/store/chart-store";
import { formatPrice, formatVolume } from "@/lib/format";
import { ChevronUp } from "lucide-react";
import { IndicatorPill } from "./IndicatorPill";
import { MeasureOverlay } from "./MeasureOverlay";
import { DrawingsLayer } from "./drawings/DrawingsLayer";
import { PlacementPreview, MagnetIndicator } from "./PlacementPreview";
import { SqueezeOverlay } from "./SqueezeOverlay";
import type { SqueezePoint } from "@/lib/indicators/squeeze";
import { xToTime, timeframeToSeconds } from "@/lib/chart/coords";
import { candlesRef as globalCandlesRef } from "@/lib/chart/candles-ref";
import { snapToOHLC } from "@/lib/chart/snap";
import { useDrawings } from "@/lib/supabase/use-drawings";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { unifiedHistory, registerViewportApplier, isApplyingHistory } from "@/lib/history";
import { generateId, FIB_LEVELS_DEFAULT } from "@/lib/drawings/types";
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

const TV_COLORS = {
  bg: "#000000",
  panel: "#0a0a0a",
  border: "#1a1a1a",
  text: "#e6e6e6",
  textMuted: "#8a8a8a",
  green: "#26a69a",
  red: "#ef5350",
  blue: "#2962ff",
  yellow: "#ffb74d",
  purple: "#ab47bc",
  grid: "#0e0e0e",
};

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
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
  volume?: number;
}

interface PaneOffset {
  top: number;
  height: number;
}

export function PriceChart({ symbol, timeframe }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  /** Per-user EMA instance: id → series */
  const emaSeriesMapRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi30Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi70Ref = useRef<ISeriesApi<"Line"> | null>(null);
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
  const candlesRef = useRef<Candle[]>([]);
  const firstPointRef = useRef<{ time: number; price: number } | null>(null);
  const placementPointsRef = useRef<Array<{ time: number; price: number }>>([]);
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
  const logScale = useChartStore((s) => s.logScale);
  const indicatorLogScale = useChartStore((s) => s.indicatorLogScale);
  const pillsCollapsed = useChartStore((s) => s.pillsCollapsed);
  const chartColors = useChartStore((s) => s.chartColors);
  chartColorsRef.current = chartColors;
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const toggleHidden = useChartStore((s) => s.toggleHidden);
  const setSettingsTarget = useChartStore((s) => s.setSettingsTarget);
  const setIndicatorOverlay = useChartStore((s) => s.setIndicatorOverlay);
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

  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [lastPrice, setLastPrice] = useState<{ value: number; pct: number } | null>(null);
  const [lastValues, setLastValues] = useState<LastValues>({});
  const [paneOffsets, setPaneOffsets] = useState<PaneOffset[]>([]);
  const [measure, setMeasure] = useState<MeasureState>(INITIAL_MEASURE);
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

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const initColors = chartColorsRef.current;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: initColors.bg },
        textColor: TV_COLORS.text,
        fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
        fontSize: 11,
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

      // Magnet: Ctrl held → snap price to nearest OHLC of the closest candle
      if (param.sourceEvent?.ctrlKey && resolvedTime !== null) {
        const snapped = snapToOHLC(price, resolvedTime, candlesRef.current);
        if (snapped !== null) price = snapped;
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

      if (toolRef.current === "trendline" || toolRef.current === "ray") {
        if (resolvedTime === null) return;
        const time = resolvedTime;
        const first = firstPointRef.current;
        const kind = toolRef.current;
        if (!first) {
          firstPointRef.current = { time, price };
          setPreviewState({ first: { time, price }, extra: [], cursor: { time, price } });
        } else {
          void drawingsApiRef.current.add({
            id: generateId(),
            kind,
            symbol: symbolRef.current,
            a: first,
            b: { time, price },
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
        // Default: 2% move in the favorable direction; 1:1 R:R on the other side
        const dist = Math.abs(entry) * 0.02 || 1;
        const target = kind === "long" ? entry + dist : entry - dist;
        const stop = kind === "long" ? entry - dist : entry + dist;
        // Default width: 20 bars to the right
        const intervalSec = timeframeToSeconds(
          useChartStore.getState().timeframe,
        );
        const timeB = time + 20 * intervalSec;
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

      if (toolRef.current === "parallel-channel") {
        if (resolvedTime === null) return;
        const time = resolvedTime;
        placementPointsRef.current.push({ time, price });
        if (placementPointsRef.current.length >= 3) {
          const [a, b, c] = placementPointsRef.current;
          void drawingsApiRef.current.add({
            id: generateId(),
            kind: "parallel-channel",
            symbol: symbolRef.current,
            a,
            b,
            c,
            ...(useChartStore.getState().toolDefaults["parallel-channel"] ?? {}),
          });
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

      // Magnet target: when Ctrl is held + tool active + cursor over chart
      const t = toolRef.current;
      const tracksMagnet =
        t !== "cursor" &&
        t !== "eraser" &&
        cursorTime !== null &&
        cursorPrice !== null;
      if (param.sourceEvent?.ctrlKey && tracksMagnet) {
        const snapped = snapToOHLC(cursorPrice!, cursorTime!, candlesRef.current);
        setMagnetTarget({ time: cursorTime!, price: snapped ?? cursorPrice! });
      } else {
        setMagnetTarget((prev) => (prev === null ? prev : null));
      }

      // Measure preview
      if (
        toolRef.current === "measure" &&
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
        // Apply snap to preview cursor if Ctrl held
        let pc: { time: number; price: number } = { time: cursorTime, price: cursorPrice };
        if (param.sourceEvent?.ctrlKey) {
          const snapped = snapToOHLC(cursorPrice, cursorTime, candlesRef.current);
          if (snapped !== null) pc = { time: cursorTime, price: snapped };
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

    // Re-render measure overlay on pan / zoom so pixel coords stay in sync
    const tsRangeHandler = () => setRenderTick((t) => t + 1);
    chart.timeScale().subscribeVisibleTimeRangeChange(tsRangeHandler);
    // Register viewport applier so undo/redo can restore pan/zoom
    registerViewportApplier((range) => {
      chart.timeScale().setVisibleLogicalRange({ from: range.from, to: range.to });
    });

    let zoomSaveTimer: ReturnType<typeof setTimeout> | null = null;
    let lastViewport: { from: number; to: number } | null = null;
    const logicalRangeHandler = () => {
      setRenderTick((t) => t + 1);
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
    const onPaneMouseUp = () => requestAnimationFrame(() => recomputePaneOffsets());
    containerRef.current.addEventListener("mouseup", onPaneMouseUp);
    recomputePaneOffsets();
    const initRect = containerRef.current.getBoundingClientRect();
    setContainerSize({ width: initRect.width, height: initRect.height });

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(tsRangeHandler);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(logicalRangeHandler);
      ro.disconnect();
      containerRef.current?.removeEventListener("mouseup", onPaneMouseUp);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      emaSeriesMapRef.current.clear();
      rsiRef.current = null;
      rsi30Ref.current = null;
      rsi70Ref.current = null;
      macdRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
    };
  }, []);

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
      const r = chartRef.current.addSeries(
        LineSeries,
        {
          color: INDICATOR_COLORS.rsi,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const r30 = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.textMuted,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const r70 = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.textMuted,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      rsiRef.current = r;
      rsi30Ref.current = r30;
      rsi70Ref.current = r70;
      try {
        chartRef.current.panes()[1]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateRSI();
    } else if (!indicators.rsi && rsiRef.current && chartRef.current) {
      chartRef.current.removeSeries(rsiRef.current);
      if (rsi30Ref.current) chartRef.current.removeSeries(rsi30Ref.current);
      if (rsi70Ref.current) chartRef.current.removeSeries(rsi70Ref.current);
      rsiRef.current = null;
      rsi30Ref.current = null;
      rsi70Ref.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.rsi]);

  // MACD pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.macd && !macdRef.current) {
      const paneIndex = indicators.rsi ? 2 : 1;
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
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateMACD();
    } else if (!indicators.macd && macdRef.current && chartRef.current) {
      if (macdRef.current) chartRef.current.removeSeries(macdRef.current);
      if (macdSignalRef.current) chartRef.current.removeSeries(macdSignalRef.current);
      if (macdHistRef.current) chartRef.current.removeSeries(macdHistRef.current);
      macdRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.macd, indicators.rsi]);

  /**
   * Compute pane index for a sub-chart indicator. Fixed display order:
   *   1: RSI, 2: MACD, 3: ADX, 4: Squeeze, 5: VuManChu
   * Each indicator falls into the next available index based on which higher-priority ones are enabled.
   */
  function panelIndexFor(key: "rsi" | "macd" | "adx" | "squeeze" | "vumanchu"): number {
    const order: Array<typeof key> = ["rsi", "macd", "adx", "squeeze", "vumanchu"];
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
      const style = useChartStore.getState().adxStyle;
      adxRef.current = chartRef.current.addSeries(
        LineSeries,
        { color: style.adxColor, lineWidth: 2, priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      adxPlusDIRef.current = chartRef.current.addSeries(
        LineSeries,
        { color: style.plusDiColor, lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      adxMinusDIRef.current = chartRef.current.addSeries(
        LineSeries,
        { color: style.minusDiColor, lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      adxKeyLevelRef.current = chartRef.current.addSeries(
        LineSeries,
        { color: style.keyLevelColor, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateADX();
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.adx, indicators.rsi, indicators.macd, indicatorOverlays]);

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
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateSqueeze();
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.squeeze, indicators.rsi, indicators.macd, indicators.adx, indicatorOverlays]);

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
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateVumanchu();
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.vumanchu, indicators.rsi, indicators.macd, indicators.adx, indicators.squeeze, indicatorOverlays]);

  // Visibility — eye toggle (hidden state) + enabled state combined
  useEffect(() => {
    const v = (key: IndicatorKey) => indicators[key] && !hidden[key];
    // EMAs visibility is driven by per-instance `hidden` flag in the sync effect
    if (rsiRef.current) rsiRef.current.applyOptions({ visible: v("rsi") });
    if (rsi30Ref.current) rsi30Ref.current.applyOptions({ visible: v("rsi") });
    if (rsi70Ref.current) rsi70Ref.current.applyOptions({ visible: v("rsi") });
    if (macdRef.current) macdRef.current.applyOptions({ visible: v("macd") });
    if (macdSignalRef.current) macdSignalRef.current.applyOptions({ visible: v("macd") });
    if (macdHistRef.current) macdHistRef.current.applyOptions({ visible: v("macd") });
    if (volumeSeriesRef.current) volumeSeriesRef.current.applyOptions({ visible: v("volume") });
    // ADX pane
    if (adxRef.current) adxRef.current.applyOptions({ visible: v("adx") });
    if (adxPlusDIRef.current) adxPlusDIRef.current.applyOptions({ visible: v("adx") });
    if (adxMinusDIRef.current) adxMinusDIRef.current.applyOptions({ visible: v("adx") });
    if (adxKeyLevelRef.current) adxKeyLevelRef.current.applyOptions({ visible: v("adx") });
    // Squeeze pane
    if (squeezeHistRef.current) squeezeHistRef.current.applyOptions({ visible: v("squeeze") });
    if (squeezeDotsRef.current) squeezeDotsRef.current.applyOptions({ visible: v("squeeze") });
    // VuManChu pane
    if (vmcWt1Ref.current) vmcWt1Ref.current.applyOptions({ visible: v("vumanchu") });
    if (vmcWt2Ref.current) vmcWt2Ref.current.applyOptions({ visible: v("vumanchu") });
    if (vmcVwapRef.current) vmcVwapRef.current.applyOptions({ visible: v("vumanchu") });
    if (vmcMfiRef.current) vmcMfiRef.current.applyOptions({ visible: v("vumanchu") });
    if (vmcRsiRef.current) vmcRsiRef.current.applyOptions({ visible: v("vumanchu") });
    if (vmcObRef.current) vmcObRef.current.applyOptions({ visible: v("vumanchu") });
    if (vmcOsRef.current) vmcOsRef.current.applyOptions({ visible: v("vumanchu") });
    if (vmcZeroRef.current) vmcZeroRef.current.applyOptions({ visible: v("vumanchu") });
  }, [indicators, hidden]);

  // Apply logarithmic price scale toggle — main candle pane ONLY (uses the
  // candle series's own price scale so sub-pane indicators are unaffected).
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    candleSeriesRef.current.priceScale().applyOptions({
      mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });
  }, [logScale]);

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

  useEffect(() => {
    updateRSI();
  }, [config.rsi]);

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
        tool !== "cursor" && tool !== "eraser" ? "crosshair" : "";
    }
    if (tool !== "measure") setMeasure(INITIAL_MEASURE);
    // Reset multi-click placement when switching tools
    firstPointRef.current = null;
    placementPointsRef.current = [];
    setPreviewState(null);
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
      if (e.ctrlKey || e.metaKey) {
        const snapped = snapToOHLC(price, time, candlesRef.current);
        if (snapped !== null) price = snapped;
        setMagnetTarget({ time, price });
      }
      setPreviewState((prev) => (prev ? { ...prev, cursor: { time, price } } : prev));
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

  function updateRSI() {
    const c = candlesRef.current;
    if (c.length === 0 || !rsiRef.current) return;
    const cfg = configRef.current;
    const data = rsi(c, cfg.rsi).map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.value,
    }));
    rsiRef.current.setData(data);
    if (rsi30Ref.current && data.length > 0)
      rsi30Ref.current.setData([
        { time: data[0].time, value: 30 },
        { time: data[data.length - 1].time, value: 30 },
      ]);
    if (rsi70Ref.current && data.length > 0)
      rsi70Ref.current.setData([
        { time: data[0].time, value: 70 },
        { time: data[data.length - 1].time, value: 70 },
      ]);
    setLastValues((prev) => ({ ...prev, rsi: data.at(-1)?.value }));
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
    adxRef.current.applyOptions({ color: style.adxColor, visible: style.showAdx && indicators.adx });
    adxPlusDIRef.current?.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.plusDI })),
    );
    adxPlusDIRef.current?.applyOptions({ color: style.plusDiColor, visible: style.showPlusDi && indicators.adx });
    adxMinusDIRef.current?.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.minusDI })),
    );
    adxMinusDIRef.current?.applyOptions({ color: style.minusDiColor, visible: style.showMinusDi && indicators.adx });
    // Key level: constant horizontal line at configured value
    if (adxKeyLevelRef.current && data.length > 0) {
      adxKeyLevelRef.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: cfg.adxKeyLevel })),
      );
      adxKeyLevelRef.current.applyOptions({ color: style.keyLevelColor, visible: style.showKeyLevel && indicators.adx });
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
    // Feed the histogram the raw momentum WITHOUT per-bar colors (or with
    // a transparent color). The actual visible rendering is done by the
    // SqueezeOverlay SVG layer, which draws polygons per Pine-color segment
    // with bars touching exactly — no gaps, smooth solid regions matching
    // TradingView's plot.style_columns look.
    squeezeHistRef.current.setData(
      pts.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.momentum,
        color: "rgba(0,0,0,0)",
      })),
    );
    squeezeHistRef.current.applyOptions({
      visible: style.showMomentum && indicators.squeeze,
    });
    // Publish pts to React state so SqueezeOverlay can render them.
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
        const synthetic = isSyntheticExpression(symbol);
        const klines = synthetic
          ? await fetchSyntheticKlines(symbol, timeframe, 1000)
          : await fetchKlines(symbol, timeframe, 1000);
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
        updateRSI();
        updateMACD();
        updateADX();
        updateSqueeze();
        updateVumanchu();
        // Show the user's preferred number of recent bars (persisted across
        // loads). Bypasses lightweight-charts' default "fit all" which zooms
        // out way too far for 1000 bars.
        if (chartRef.current && klines.length > 0) {
          const bars = useChartStore.getState().visibleBars;
          const lastIdx = klines.length - 1;
          chartRef.current.timeScale().setVisibleLogicalRange({
            from: Math.max(0, lastIdx - bars + 1),
            to: lastIdx + 4,
          });
        }
        requestAnimationFrame(() => recomputePaneOffsets());

        if (klines.length > 0) {
          const last = klines[klines.length - 1];
          const prev = klines[klines.length - 2] ?? last;
          setLastPrice({
            value: last.close,
            pct: prev.close === 0 ? 0 : ((last.close - prev.close) / prev.close) * 100,
          });
        }

        const ws = getBinanceWS();
        if (synthetic) {
          // Subscribe to each component, recompute synthetic candle on update
          const symbols = extractSymbols(symbol);
          const lastBySym = new Map<string, Candle>();
          const unsubs = symbols.map((s) =>
            ws.subscribeKline({
              symbol: s,
              interval: timeframe,
              onCandle: (k) => {
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
                updateRSI();
                updateMACD();
                updateADX();
                updateSqueeze();
                updateVumanchu();
                const prev = arr[arr.length - 2] ?? lastCandle;
                setLastPrice({
                  value: synth.close,
                  pct:
                    prev && prev.close !== 0
                      ? ((synth.close - prev.close) / prev.close) * 100
                      : 0,
                });
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
            if (volumeSeriesRef.current) {
              volumeSeriesRef.current.update({
                time: k.time as UTCTimestamp,
                value: k.volume,
                color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
              });
            }
            updateEMAs();
            updateRSI();
            updateMACD();
            updateADX();
            updateSqueeze();
            updateVumanchu();
            const prev = arr[arr.length - 2] ?? lastCandle;
            setLastPrice({
              value: k.close,
              pct: prev && prev.close !== 0 ? ((k.close - prev.close) / prev.close) * 100 : 0,
            });
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
    "rsi" | "macd" | "adx" | "squeeze" | "vumanchu",
    number
  > = (() => {
    const order: Array<"rsi" | "macd" | "adx" | "squeeze" | "vumanchu"> = [
      "rsi",
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
    return out as Record<"rsi" | "macd" | "adx" | "squeeze" | "vumanchu", number>;
  })();
  const rsiPaneIdx = indicatorPaneIdx.rsi;
  const macdPaneIdx = indicatorPaneIdx.macd;
  const adxPaneIdx = indicatorPaneIdx.adx;
  const squeezePaneIdx = indicatorPaneIdx.squeeze;
  const vumanchuPaneIdx = indicatorPaneIdx.vumanchu;

  // ── Overlay drag state — computed at component scope so pointer drag effect can read it ──
  type PaneEntry = { key: IndicatorKey; paneIdx: number; name: string; value?: string };
  const subPaneEntries: PaneEntry[] = (
    [
      { key: "rsi" as IndicatorKey, paneIdx: rsiPaneIdx, name: `RSI ${config.rsi}`, value: lastValues.rsi !== undefined ? lastValues.rsi.toFixed(2) : undefined },
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
      if (e.key === "Escape") { pointerDragRef.current = null; setDragKey(null); }
    }
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragKey]);

  let measureRender: React.ReactNode = null;
  if (
    measure.a &&
    measure.b &&
    chartRef.current &&
    candleSeriesRef.current
  ) {
    const ts = chartRef.current.timeScale();
    const aX = ts.timeToCoordinate(measure.a.time as UTCTimestamp);
    const bX = ts.timeToCoordinate(measure.b.time as UTCTimestamp);
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
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <DrawingsLayer
        symbol={symbol}
        chart={chartRef.current}
        candleSeries={candleSeriesRef.current}
        container={containerRef.current}
        width={containerSize.width}
        height={containerSize.height}
        renderTick={renderTick}
      />
      {indicators.squeeze && paneOffsets[squeezePaneIdx] && (
        <SqueezeOverlay
          chart={chartRef.current}
          squeezeSeries={squeezeHistRef.current}
          width={containerSize.width}
          height={containerSize.height}
          paneTop={paneOffsets[squeezePaneIdx].top}
          paneHeight={paneOffsets[squeezePaneIdx].height}
          pts={squeezePts}
          visible={squeezeStyle.showMomentum}
          colorMap={{
            lime: squeezeStyle.momentumIncPos,
            green: squeezeStyle.momentumDecPos,
            red: squeezeStyle.momentumDecNeg,
            maroon: squeezeStyle.momentumIncNeg,
          }}
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

      {/* A / L buttons per pane — positioned at the bottom-right of each
          pane (just above the next pane separator / time axis) */}
      {paneOffsets.map((p, paneIdx) => {
        // Resolve which indicator owns this pane (for log scale state)
        let key: "main" | IndicatorKey = "main";
        if (paneIdx > 0) {
          for (const k of [
            "rsi",
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
            chartRef.current.timeScale().fitContent();
          } else {
            // Reset just the price scale of the pane to auto
            const seriesByPane = {
              rsi: rsiRef.current,
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
        };
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
              className="flex h-5 w-5 items-center justify-center rounded border border-tv-border bg-tv-panel text-[10px] font-semibold text-tv-text-muted hover:text-tv-text"
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
        {/* Row 1: symbol info + OHLC stats inline on hover (fixed height, never wraps) */}
        <div className="flex h-5 flex-nowrap items-center gap-x-3 overflow-hidden whitespace-nowrap">
          <div className="flex shrink-0 items-center gap-2 text-[13px] font-semibold">
            <span className="text-tv-text">{symbol}</span>
            <span className="text-tv-text-muted">·</span>
            <span className="uppercase text-tv-text-muted">{timeframe}</span>
            <span className="text-tv-text-muted">·</span>
            <span className="text-tv-text-muted">Binance</span>
          </div>
          {hover && (
            <div className="flex items-center gap-x-3 text-[11px]">
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
                {hover.pct >= 0 ? "+" : ""}
                {hover.pct.toFixed(2)}%
              </span>
              <span className="text-tv-text-muted">
                Vol <span className="text-tv-text">{formatVolume(hover.v)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Row 2: big live price (always present — reserves space even while loading) */}
        <div className="flex h-7 items-center gap-2">
          {lastPrice ? (
            <>
              <span className={`text-lg font-semibold tabular-nums ${greenOrRed(lastPrice.pct)}`}>
                {formatPrice(lastPrice.value)}
              </span>
              <span className={`text-xs ${greenOrRed(lastPrice.pct)}`}>
                {lastPrice.pct >= 0 ? "+" : ""}
                {lastPrice.pct.toFixed(2)}%
              </span>
            </>
          ) : (
            <span className="text-xs text-tv-text-muted">Loading…</span>
          )}
        </div>

        {/* Indicator pills for the main pane (collapsible) */}
        <div className="mt-1 flex flex-col items-start gap-1">
          {!pillsCollapsed && (
            <>
              {userEMAs.map((e) => (
                <IndicatorPill
                  key={e.id}
                  name={`EMA ${e.period}`}
                  color={e.color}
                  hidden={e.hidden}
                  onToggleHide={() => toggleUserEMAHidden(e.id)}
                  onSettings={() => setSettingsTarget({ kind: "ema", id: e.id })}
                  onRemove={() => removeUserEMA(e.id)}
                />
              ))}
              {indicators.volume && (
                <IndicatorPill
                  name="Vol"
                  value={lastValues.volume !== undefined ? formatVolume(lastValues.volume) : undefined}
                  color={INDICATOR_COLORS.volume}
                  hidden={hidden.volume}
                  onToggleHide={() => toggleHidden("volume")}
                  onSettings={() => setSettingsTarget("volume")}
                  onRemove={() => removeIndicator("volume")}
                />
              )}
            </>
          )}
          {(userEMAs.length > 0 || indicators.volume) && (
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
      {/* Drop zones — always in the DOM. Visible/active only while dragging. */}
      {ownedSubPanes.map((p) => {
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

      {/* Pills for each owned pane */}
      {ownedSubPanes.map((p) => {
        const offset = paneOffsets[p.paneIdx];
        if (!offset) return null;
        const guests = subPaneEntries.filter(
          (e) => indicatorOverlays[e.key] === p.key && !ownedSubPaneKeySet.has(e.key),
        );
        return (
          <div
            key={p.key}
            style={{ top: offset.top + 6, left: 12 }}
            className="pointer-events-none absolute z-10 flex flex-col items-start gap-1"
          >
            {[p, ...guests].map((entry) => {
              const isGuest = indicatorOverlays[entry.key] && indicatorOverlays[entry.key] !== "own";
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
    </div>
  );
}
