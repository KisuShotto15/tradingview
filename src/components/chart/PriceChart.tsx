"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  AreaSeries,
  CrosshairMode,
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
import { IndicatorPill } from "./IndicatorPill";
import { MeasureOverlay } from "./MeasureOverlay";
import { DrawingsLayer } from "./drawings/DrawingsLayer";
import { useDrawings } from "@/lib/supabase/use-drawings";
import { useDrawingsStore } from "@/lib/store/drawings-store";
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
  bg: "#131722",
  panel: "#1e222d",
  border: "#2a2e39",
  text: "#d1d4dc",
  textMuted: "#787b86",
  green: "#26a69a",
  red: "#ef5350",
  blue: "#2962ff",
  yellow: "#ffb74d",
  purple: "#ab47bc",
  grid: "#1e222d",
};

function snapToOHLC(price: number, time: number, candles: Candle[]): number | null {
  if (candles.length === 0) return null;
  const candle = candles.reduce((best, c) =>
    Math.abs(c.time - time) < Math.abs(best.time - time) ? c : best,
  );
  const levels = [candle.open, candle.high, candle.low, candle.close];
  return levels.reduce((closest, level) =>
    Math.abs(level - price) < Math.abs(closest - price) ? level : closest,
  );
}

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
  ema20?: number;
  ema50?: number;
  ema200?: number;
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
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);
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
  const chartColors = useChartStore((s) => s.chartColors);
  chartColorsRef.current = chartColors;
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const toggleHidden = useChartStore((s) => s.toggleHidden);
  const setSettingsTarget = useChartStore((s) => s.setSettingsTarget);
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
  const [renderTick, setRenderTick] = useState(0);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
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

    ema20Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema20,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema50Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema50,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema200Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema200,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;

    // Click handler — drawing tools
    chart.subscribeClick((param) => {
      if (!param.point || !candleSeriesRef.current) return;
      const rawPrice = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (rawPrice === null || !isFinite(rawPrice as number)) return;
      let price: number = rawPrice as number;

      // Magnet: Ctrl held → snap price to nearest OHLC of the closest candle
      if (param.sourceEvent?.ctrlKey && param.time) {
        const t = Number(param.time);
        const snapped = snapToOHLC(price, t, candlesRef.current);
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
        });
        setToolRef.current("cursor");
        return;
      }

      if (toolRef.current === "vline") {
        if (!param.time) return;
        void drawingsApiRef.current.add({
          id: generateId(),
          kind: "vline",
          symbol: symbolRef.current,
          time: Number(param.time),
        });
        setToolRef.current("cursor");
        return;
      }

      if (toolRef.current === "hray") {
        if (!param.time) return;
        void drawingsApiRef.current.add({
          id: generateId(),
          kind: "hray",
          symbol: symbolRef.current,
          anchor: { time: Number(param.time), price },
        });
        setToolRef.current("cursor");
        return;
      }

      if (toolRef.current === "trendline" || toolRef.current === "ray") {
        if (!param.time) return;
        const time = Number(param.time);
        const first = firstPointRef.current;
        const kind = toolRef.current;
        if (!first) {
          firstPointRef.current = { time, price };
        } else {
          void drawingsApiRef.current.add({
            id: generateId(),
            kind,
            symbol: symbolRef.current,
            a: first,
            b: { time, price },
          } as Parameters<typeof drawingsApiRef.current.add>[0]);
          firstPointRef.current = null;
          setToolRef.current("cursor");
        }
        return;
      }

      if (toolRef.current === "long" || toolRef.current === "short") {
        if (!param.time) return;
        const time = Number(param.time);
        const first = firstPointRef.current;
        const kind = toolRef.current;
        if (!first) {
          firstPointRef.current = { time, price };
        } else {
          const entry = first.price;
          const target = price;
          // Default stop: same absolute distance from entry as target, opposite side
          const stop = entry - (target - entry);
          void drawingsApiRef.current.add({
            id: generateId(),
            kind,
            symbol: symbolRef.current,
            entry,
            stop,
            target,
            timeA: first.time,
            timeB: time,
          } as Parameters<typeof drawingsApiRef.current.add>[0]);
          firstPointRef.current = null;
          setToolRef.current("cursor");
        }
        return;
      }

      if (toolRef.current === "price-range") {
        if (!param.time) return;
        const time = Number(param.time);
        const first = firstPointRef.current;
        if (!first) {
          firstPointRef.current = { time, price };
        } else {
          void drawingsApiRef.current.add({
            id: generateId(),
            kind: "price-range",
            symbol: symbolRef.current,
            priceA: first.price,
            priceB: price,
            timeA: first.time,
            timeB: time,
          });
          firstPointRef.current = null;
          setToolRef.current("cursor");
        }
        return;
      }

      if (toolRef.current === "date-range") {
        if (!param.time) return;
        const time = Number(param.time);
        const first = firstPointRef.current;
        if (!first) {
          firstPointRef.current = { time, price };
        } else {
          void drawingsApiRef.current.add({
            id: generateId(),
            kind: "date-range",
            symbol: symbolRef.current,
            timeA: first.time,
            timeB: time,
          });
          firstPointRef.current = null;
          setToolRef.current("cursor");
        }
        return;
      }

      if (toolRef.current === "fib-retracement") {
        if (!param.time) return;
        const time = Number(param.time);
        const first = firstPointRef.current;
        if (!first) {
          firstPointRef.current = { time, price };
        } else {
          void drawingsApiRef.current.add({
            id: generateId(),
            kind: "fib-retracement",
            symbol: symbolRef.current,
            a: first,
            b: { time, price },
            levels: [...FIB_LEVELS_DEFAULT],
          });
          firstPointRef.current = null;
          setToolRef.current("cursor");
        }
        return;
      }

      if (toolRef.current === "parallel-channel") {
        if (!param.time) return;
        const time = Number(param.time);
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
          });
          placementPointsRef.current = [];
          setToolRef.current("cursor");
        }
        return;
      }

      if (toolRef.current === "measure") {
        if (!param.time) return;
        const time = Number(param.time);
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
      if (
        toolRef.current === "measure" &&
        measureRef.current.phase === "placing" &&
        param.point &&
        param.time &&
        candleSeriesRef.current
      ) {
        const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (price !== null && isFinite(price)) {
          const time = Number(param.time);
          setMeasure((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time, price } } : prev,
          );
        }
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
    const logicalRangeHandler = () => setRenderTick((t) => t + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(logicalRangeHandler);

    // ResizeObserver — recompute pane offsets when chart container resizes
    const ro = new ResizeObserver((entries) => {
      requestAnimationFrame(() => recomputePaneOffsets());
      const cr = entries[0]?.contentRect;
      if (cr) setContainerSize({ width: cr.width, height: cr.height });
    });
    ro.observe(containerRef.current);
    recomputePaneOffsets();
    const initRect = containerRef.current.getBoundingClientRect();
    setContainerSize({ width: initRect.width, height: initRect.height });

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(tsRangeHandler);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(logicalRangeHandler);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      ema20Ref.current = null;
      ema50Ref.current = null;
      ema200Ref.current = null;
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
    let idx = 1;
    for (const k of order) {
      if (k === key) return idx;
      if (indicators[k]) idx++;
    }
    return idx;
  }

  // ── ADX pane ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.adx && !adxRef.current) {
      const paneIndex = panelIndexFor("adx");
      adxRef.current = chartRef.current.addSeries(
        LineSeries,
        { color: "#ffb74d", lineWidth: 2, priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      adxPlusDIRef.current = chartRef.current.addSeries(
        LineSeries,
        { color: "#26a69a", lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      adxMinusDIRef.current = chartRef.current.addSeries(
        LineSeries,
        { color: "#ef5350", lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateADX();
    } else if (!indicators.adx && adxRef.current && chartRef.current) {
      if (adxRef.current) chartRef.current.removeSeries(adxRef.current);
      if (adxPlusDIRef.current) chartRef.current.removeSeries(adxPlusDIRef.current);
      if (adxMinusDIRef.current) chartRef.current.removeSeries(adxMinusDIRef.current);
      adxRef.current = null;
      adxPlusDIRef.current = null;
      adxMinusDIRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.adx, indicators.rsi, indicators.macd]);

  // ── Squeeze Momentum pane ────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.squeeze && !squeezeHistRef.current) {
      const paneIndex = panelIndexFor("squeeze");
      squeezeHistRef.current = chartRef.current.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      // Invisible line at y=0 used to anchor the squeeze-state markers
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
    } else if (!indicators.squeeze && squeezeHistRef.current && chartRef.current) {
      if (squeezeHistRef.current) chartRef.current.removeSeries(squeezeHistRef.current);
      if (squeezeDotsRef.current) chartRef.current.removeSeries(squeezeDotsRef.current);
      squeezeHistRef.current = null;
      squeezeDotsRef.current = null;
      squeezeDotsMarkersRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.squeeze, indicators.rsi, indicators.macd, indicators.adx]);

  // ── VuManChu Cipher B pane ───────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.vumanchu && !vmcWt2Ref.current) {
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
    } else if (!indicators.vumanchu && vmcWt2Ref.current && chartRef.current) {
      const refs = [vmcWt1Ref, vmcWt2Ref, vmcVwapRef, vmcMfiRef, vmcRsiRef, vmcObRef, vmcOsRef, vmcZeroRef];
      for (const r of refs) {
        if (r.current) {
          try { chartRef.current.removeSeries(r.current); } catch {}
          r.current = null;
        }
      }
      vmcMarkersRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.vumanchu, indicators.rsi, indicators.macd, indicators.adx, indicators.squeeze]);

  // Visibility — eye toggle (hidden state) + enabled state combined
  useEffect(() => {
    const v = (key: IndicatorKey) => indicators[key] && !hidden[key];
    ema20Ref.current?.applyOptions({ visible: v("ema20") });
    ema50Ref.current?.applyOptions({ visible: v("ema50") });
    ema200Ref.current?.applyOptions({ visible: v("ema200") });
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

  // Recompute indicators when config changes (periods)
  useEffect(() => {
    updateEMAs();
  }, [config.ema20, config.ema50, config.ema200]);

  useEffect(() => {
    updateRSI();
  }, [config.rsi]);

  useEffect(() => {
    updateMACD();
  }, [config.macdFast, config.macdSlow, config.macdSignal]);

  useEffect(() => {
    updateADX();
  }, [config.adx]);

  useEffect(() => {
    updateSqueeze();
  }, [config.squeezeBB, config.squeezeBBMult, config.squeezeKC, config.squeezeKCMult]);

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
  }, [tool]);

  function updateEMAs() {
    const c = candlesRef.current;
    if (c.length === 0) return;
    const cfg = configRef.current;
    let last20: number | undefined;
    let last50: number | undefined;
    let last200: number | undefined;

    if (ema20Ref.current) {
      const data = ema(c, cfg.ema20);
      ema20Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last20 = data.at(-1)?.value;
    }
    if (ema50Ref.current) {
      const data = ema(c, cfg.ema50);
      ema50Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last50 = data.at(-1)?.value;
    }
    if (ema200Ref.current) {
      const data = ema(c, cfg.ema200);
      ema200Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last200 = data.at(-1)?.value;
    }
    const lastVol = c.at(-1)?.volume;
    setLastValues((prev) => ({
      ...prev,
      ema20: last20,
      ema50: last50,
      ema200: last200,
      volume: lastVol,
    }));
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
    const data = adxCalc(c, cfg.adx);
    adxRef.current.setData(data.map((p) => ({ time: p.time as UTCTimestamp, value: p.adx })));
    adxPlusDIRef.current?.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.plusDI })),
    );
    adxMinusDIRef.current?.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.minusDI })),
    );
  }

  function updateSqueeze() {
    const c = candlesRef.current;
    if (c.length === 0 || !squeezeHistRef.current) return;
    const cfg = configRef.current;
    const pts = squeezeMomentum(c, {
      bbLength: cfg.squeezeBB,
      bbMult: cfg.squeezeBBMult,
      kcLength: cfg.squeezeKC,
      kcMult: cfg.squeezeKCMult,
    });
    const COLORS: Record<string, string> = {
      lime: "#00ff00",
      green: "#26a69a",
      red: "#ef5350",
      maroon: "#a52a2a",
    };
    squeezeHistRef.current.setData(
      pts.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.momentum,
        color: COLORS[p.color],
      })),
    );
    // Zero-line dots: invisible line at 0 + colored markers for squeeze state
    squeezeDotsRef.current?.setData(
      pts.map((p) => ({ time: p.time as UTCTimestamp, value: 0 })),
    );
    if (squeezeDotsMarkersRef.current) {
      const markers: SeriesMarker<Time>[] = pts.map((p) => ({
        time: p.time as UTCTimestamp,
        position: "inBar",
        shape: "circle",
        size: 0.5,
        color:
          p.state === "on" ? "#000000" : p.state === "off" ? "#787b86" : "#2962ff",
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
        const klines = await fetchKlines(symbol, timeframe, 1000);
        if (cancelled) return;
        candlesRef.current = klines;
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
        chartRef.current?.timeScale().fitContent();
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
  const rsiPaneIdx = 1;
  const macdPaneIdx = indicators.rsi ? 2 : 1;

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
      {measureRender}

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

        {/* Indicator pills for the main pane (fixed position below price) */}
        <div className="mt-1 flex flex-col items-start gap-1">
          {indicators.ema20 && (
            <IndicatorPill
              name={`EMA ${config.ema20}`}
              value={lastValues.ema20 !== undefined ? formatPrice(lastValues.ema20) : undefined}
              color={INDICATOR_COLORS.ema20}
              hidden={hidden.ema20}
              onToggleHide={() => toggleHidden("ema20")}
              onSettings={() => setSettingsTarget("ema20")}
              onRemove={() => removeIndicator("ema20")}
            />
          )}
          {indicators.ema50 && (
            <IndicatorPill
              name={`EMA ${config.ema50}`}
              value={lastValues.ema50 !== undefined ? formatPrice(lastValues.ema50) : undefined}
              color={INDICATOR_COLORS.ema50}
              hidden={hidden.ema50}
              onToggleHide={() => toggleHidden("ema50")}
              onSettings={() => setSettingsTarget("ema50")}
              onRemove={() => removeIndicator("ema50")}
            />
          )}
          {indicators.ema200 && (
            <IndicatorPill
              name={`EMA ${config.ema200}`}
              value={lastValues.ema200 !== undefined ? formatPrice(lastValues.ema200) : undefined}
              color={INDICATOR_COLORS.ema200}
              hidden={hidden.ema200}
              onToggleHide={() => toggleHidden("ema200")}
              onSettings={() => setSettingsTarget("ema200")}
              onRemove={() => removeIndicator("ema200")}
            />
          )}
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
        </div>
      </div>

      {/* RSI pane label */}
      {indicators.rsi && paneOffsets[rsiPaneIdx] && (
        <div
          style={{ top: paneOffsets[rsiPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`RSI ${config.rsi}`}
            value={lastValues.rsi !== undefined ? lastValues.rsi.toFixed(2) : undefined}
            color={INDICATOR_COLORS.rsi}
            hidden={hidden.rsi}
            onToggleHide={() => toggleHidden("rsi")}
            onSettings={() => setSettingsTarget("rsi")}
            onRemove={() => removeIndicator("rsi")}
          />
        </div>
      )}

      {/* MACD pane label */}
      {indicators.macd && paneOffsets[macdPaneIdx] && (
        <div
          style={{ top: paneOffsets[macdPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`MACD ${config.macdFast}, ${config.macdSlow}, ${config.macdSignal}`}
            value={
              lastValues.macd !== undefined
                ? `${lastValues.macd.toFixed(2)} / ${(lastValues.macdSignal ?? 0).toFixed(2)}`
                : undefined
            }
            color={INDICATOR_COLORS.macd}
            hidden={hidden.macd}
            onToggleHide={() => toggleHidden("macd")}
            onSettings={() => setSettingsTarget("macd")}
            onRemove={() => removeIndicator("macd")}
          />
        </div>
      )}
    </div>
  );
}
