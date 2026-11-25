"use client";

import { useEffect, useRef } from "react";
import type { IPriceLine, ISeriesApi } from "lightweight-charts";
import { useDrawingsStore } from "@/lib/store/drawings-store";

/**
 * Puts the price of every horizontal drawing on the price scale.
 *
 * It used to be a chip floating in the plot beside the line, which is the
 * wrong place twice over: it covers the candles it is meant to help you read,
 * and it is nowhere near the scale every other price on the chart is read
 * from. The venues put it on the axis, in the line's own colour, and so does
 * this.
 *
 * Native price lines with `lineVisible: false` — the line itself is still
 * drawn by the SVG layer, which is what makes it selectable and draggable;
 * this adds only the axis label, and lightweight-charts keeps it placed
 * through every pan, zoom and rescale.
 *
 * Only for drawings that *have* a single price: a horizontal line and a
 * horizontal ray. A sloped line has a different price in every column, and a
 * box has two.
 */
export function DrawingAxisLabels({
  candleSeries,
  symbol,
}: {
  candleSeries: ISeriesApi<"Candlestick"> | null;
  symbol: string;
}) {
  const drawings = useDrawingsStore((s) => s.drawings);
  const linesRef = useRef<Map<string, IPriceLine>>(new Map());

  useEffect(() => {
    if (!candleSeries) return;
    const map = linesRef.current;

    const want = drawings.flatMap((d) => {
      if (d.symbol !== symbol || d.hidden) return [];
      if (d.kind === "hline") return [{ id: d.id, price: d.price, color: d.color ?? "#2962ff" }];
      if (d.kind === "hray") return [{ id: d.id, price: d.anchor.price, color: d.color ?? "#2962ff" }];
      return [];
    });

    const seen = new Set<string>();
    for (const w of want) {
      if (!Number.isFinite(w.price)) continue;
      seen.add(w.id);
      const existing = map.get(w.id);
      if (existing) {
        existing.applyOptions({ price: w.price, color: w.color });
      } else {
        map.set(
          w.id,
          candleSeries.createPriceLine({
            price: w.price,
            color: w.color,
            lineWidth: 1,
            lineVisible: false,
            axisLabelVisible: true,
            title: "",
          }),
        );
      }
    }

    for (const [id, line] of map) {
      if (!seen.has(id)) {
        try {
          candleSeries.removePriceLine(line);
        } catch {
          // The series can already be gone when the symbol changed under us.
        }
        map.delete(id);
      }
    }
  }, [candleSeries, drawings, symbol]);

  useEffect(() => {
    const map = linesRef.current;
    return () => {
      if (!candleSeries) return;
      for (const line of map.values()) {
        try {
          candleSeries.removePriceLine(line);
        } catch {
          // Series already disposed.
        }
      }
      map.clear();
    };
  }, [candleSeries]);

  return null;
}
