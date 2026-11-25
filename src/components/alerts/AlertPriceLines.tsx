"use client";

import { useEffect, useRef } from "react";
import type { IPriceLine, ISeriesApi } from "lightweight-charts";
import { useAlertsStore } from "@/lib/store/alerts-store";
import { cleanSym } from "@/lib/binance/rest";

/** Dashed, so an alert never reads as an order or a position. */
const LINE_STYLE_DASHED = 2;

/**
 * Draws the standalone price alerts for the charted symbol as native price
 * lines.
 *
 * Alerts attached to a drawing have always been visible — they *are* the
 * drawing. A standalone one had no mark at all: creating it from the "+" on
 * the price axis put a row in the alerts list and left the chart unchanged,
 * so the level you had just picked was nowhere to be seen on the chart you
 * picked it from.
 *
 * Native price lines rather than an SVG overlay: they span the pane, carry
 * their own label on the price scale, and lightweight-charts keeps them
 * placed through every pan, zoom and rescale with no geometry to maintain
 * here. Same approach as the order lines.
 *
 * Only `price` alerts get a line. An RSI or MACD alert's level lives in its
 * own pane on a different scale, and drawing it over the candles would put it
 * at a meaningless height.
 */
export function AlertPriceLines({
  candleSeries,
  symbol,
  color,
}: {
  candleSeries: ISeriesApi<"Candlestick"> | null;
  symbol: string;
  color: string;
}) {
  const alerts = useAlertsStore((s) => s.alerts);
  const linesRef = useRef<Map<string, IPriceLine>>(new Map());

  useEffect(() => {
    if (!candleSeries) return;
    const map = linesRef.current;
    const want = alerts.filter(
      (a) =>
        a.enabled &&
        (a.source ?? "price") === "price" &&
        Number.isFinite(a.value) &&
        a.value > 0 &&
        // Match on the bare exchange symbol: the same market can be charted
        // as SOLUSDT.P or BYBIT:SOLUSDT.P, and an alert set from one belongs
        // on the other.
        cleanSym(a.symbol) === cleanSym(symbol),
    );

    const seen = new Set<string>();
    for (const a of want) {
      seen.add(a.id);
      const existing = map.get(a.id);
      if (existing) {
        existing.applyOptions({ price: a.value, color });
      } else {
        map.set(
          a.id,
          candleSeries.createPriceLine({
            price: a.value,
            color,
            lineWidth: 1,
            lineStyle: LINE_STYLE_DASHED,
            axisLabelVisible: true,
            lineVisible: true,
            title: "🔔",
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
  }, [candleSeries, alerts, symbol, color]);

  // Drop every line when the series itself goes away, or they leak onto the
  // next chart built in its place.
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
