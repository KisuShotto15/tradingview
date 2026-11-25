"use client";

import { useCallback, useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { useChartStore } from "@/lib/store/chart-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { xToTime, timeframeToSeconds } from "@/lib/chart/coords";
import { candlesRef as globalCandlesRef } from "@/lib/chart/candles-ref";
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
          const p = rawP as number;
          /*
           * No magnet here, deliberately: this is a translation of the whole
           * shape, and the magnet snaps *points*.
           *
           * The price under the cursor is not one of the shape's points — you
           * grab a line wherever you happen to click on it — so snapping it
           * moves the shape by the distance from an arbitrary grab position to
           * a candle level. Both ways of doing it are wrong in a visible way.
           * Snapping only the live end (what this did) measured the delta from
           * the raw grab price, so a 60px drag moved the shape 100px on the
           * first pixel and dragging it back did not put it back; that was
           * bounded and rare while the magnet needed the cursor to be near a
           * level, and became constant once a bar owned its whole column.
           * Snapping both ends instead pins the delta to level-to-level steps,
           * which makes a vertical drag inside one bar's column do nothing at
           * all until the cursor crosses the midpoint between two of that
           * bar's four prices — the shape just refuses to move.
           *
           * So a whole-shape drag follows the cursor exactly, and the magnet
           * stays where it means something: placing a new point, and dragging
           * an individual anchor (`use-drag-point`, and the long/short's
           * entry/stop/target), both of which set an absolute snapped price
           * rather than a delta. It also keeps a magnetised drawing nudgeable,
           * which a snapped translation does not.
           */
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
