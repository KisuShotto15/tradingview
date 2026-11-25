"use client";

import { useCallback, useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { useChartStore } from "@/lib/store/chart-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { xToTime, timeframeToSeconds } from "@/lib/chart/coords";
import { candlesRef as globalCandlesRef } from "@/lib/chart/candles-ref";
import { magnetRadius, magnetSnapDragging } from "@/lib/chart/magnet";
import { DRAG_SLOP_PX, beginPointerDrag } from "./pointer-drag";

/** True if the currently-selected drawing is locked (no drag allowed). */
function selectedIsLocked(): boolean {
  const st = useDrawingsStore.getState();
  if (!st.selectedId) return false;
  const d = st.drawings.find((x) => x.id === st.selectedId);
  return !!d?.locked;
}

interface ShapeDragHandlers<T> {
  onStart?: () => void;
  onMove: (patch: Partial<T>) => void;
  onEnd?: () => void;
}

/**
 * Drag the whole shape — captures the original drawing on pointer down, tracks
 * cursor delta in (time, price) space, and emits a patch via applyDelta.
 */
export function useDragShape<T>(
  chart: IChartApi | null,
  candleSeries: ISeriesApi<"Candlestick"> | null,
  container: HTMLElement | null,
  applyDelta: (orig: T, dt: number, dp: number) => Partial<T>,
  getCurrent: () => T | null,
  handlers: ShapeDragHandlers<T>,
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const applyRef = useRef(applyDelta);
  applyRef.current = applyDelta;
  const getRef = useRef(getCurrent);
  getRef.current = getCurrent;

  return useCallback(
    (e: React.PointerEvent) => {
      if (!chart || !candleSeries || !container) return;
      if (selectedIsLocked()) return; // drawing is locked → no drag
      e.preventDefault();
      e.stopPropagation();

      const original = getRef.current();
      if (!original) return;

      const rect = container.getBoundingClientRect();
      const startX = e.clientX - rect.left;
      const startY = e.clientY - rect.top;
      const interval = timeframeToSeconds(useChartStore.getState().timeframe);
      const startTime = xToTime(chart, startX, globalCandlesRef.current, interval);
      const startPriceRaw = candleSeries.coordinateToPrice(startY);
      if (startTime === null || startPriceRaw === null) return;
      const startPrice = startPriceRaw as number;

      handlersRef.current.onStart?.();

      beginPointerDrag(e, {
        onMove(ev) {
          if (!chart || !candleSeries) return;
          const x = ev.clientX - rect.left;
          const y = ev.clientY - rect.top;
          const t = xToTime(chart, x, globalCandlesRef.current, interval);
          const rawP = candleSeries.coordinateToPrice(y);
          if (t === null || rawP === null) return;
          let p = rawP as number;
          // Magnet snap: held Ctrl/Cmd, or the persistent magnet-mode toggle
          if (ev.ctrlKey || ev.metaKey || useChartStore.getState().magnetMode) {
            const snapped = magnetSnapDragging(
              p,
              t,
              globalCandlesRef.current,
              magnetRadius(candleSeries, y),
            );
            if (snapped !== null) p = snapped;
          }
          const dt = t - startTime;
          const dp = p - startPrice;
          handlersRef.current.onMove(applyRef.current(original, dt, dp));
        },
        onEnd(moved) {
          if (moved) handlersRef.current.onEnd?.();
        },
        slop: DRAG_SLOP_PX,
      });
    },
    [chart, candleSeries, container],
  );
}
