"use client";

import { useCallback } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { Point } from "@/lib/drawings/types";
import { useChartStore } from "@/lib/store/chart-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { xToTime, timeframeToSeconds } from "@/lib/chart/coords";
import { candlesRef as globalCandlesRef } from "@/lib/chart/candles-ref";
import { snapToOHLC } from "@/lib/chart/snap";

/** True if the currently-selected drawing is locked. */
function selectedIsLocked(): boolean {
  const st = useDrawingsStore.getState();
  if (!st.selectedId) return false;
  const d = st.drawings.find((x) => x.id === st.selectedId);
  return !!d?.locked;
}

interface DragHandlers {
  onStart?: () => void;
  onMove: (pt: Point) => void;
  onEnd?: () => void;
}

/**
 * Returns a starter that begins dragging on mouse down. While dragging,
 * converts pixel coords back to (time, price) and calls onMove.
 * Supports timestamps past the last candle via xToTime extrapolation.
 */
export function useDragPoint(
  chart: IChartApi | null,
  candleSeries: ISeriesApi<"Candlestick"> | null,
  container: HTMLElement | null,
  handlers: DragHandlers,
) {
  return useCallback(
    (e: React.MouseEvent) => {
      if (!chart || !candleSeries || !container) return;
      if (selectedIsLocked()) return; // drawing is locked → no drag
      e.preventDefault();
      e.stopPropagation();

      if (handlers.onStart) handlers.onStart();

      function toPoint(
        clientX: number,
        clientY: number,
        snap: boolean,
      ): Point | null {
        const rect = container!.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const rawPrice = candleSeries!.coordinateToPrice(y);
        if (rawPrice === null) return null;
        const intervalSec = timeframeToSeconds(useChartStore.getState().timeframe);
        const time = xToTime(chart!, x, globalCandlesRef.current, intervalSec);
        if (time === null) return null;
        let price = rawPrice as number;
        if (snap) {
          const snapped = snapToOHLC(price, time, globalCandlesRef.current);
          if (snapped !== null) price = snapped;
        }
        return { time, price };
      }

      function onMove(ev: MouseEvent) {
        const pt = toPoint(ev.clientX, ev.clientY, ev.ctrlKey || ev.metaKey);
        if (pt) handlers.onMove(pt);
      }

      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        if (handlers.onEnd) handlers.onEnd();
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "grabbing";
    },
    [chart, candleSeries, container, handlers],
  );
}
