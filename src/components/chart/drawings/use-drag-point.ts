"use client";

import { useCallback } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { Point } from "@/lib/drawings/types";
import { useChartStore } from "@/lib/store/chart-store";
import { xToTime, timeframeToSeconds } from "@/lib/chart/coords";
import { candlesRef as globalCandlesRef } from "@/lib/chart/candles-ref";

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
      e.preventDefault();
      e.stopPropagation();

      if (handlers.onStart) handlers.onStart();

      function toPoint(clientX: number, clientY: number): Point | null {
        const rect = container!.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const price = candleSeries!.coordinateToPrice(y);
        if (price === null) return null;
        const intervalSec = timeframeToSeconds(useChartStore.getState().timeframe);
        const time = xToTime(chart!, x, globalCandlesRef.current, intervalSec);
        if (time === null) return null;
        return { time, price };
      }

      function onMove(ev: MouseEvent) {
        const pt = toPoint(ev.clientX, ev.clientY);
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
