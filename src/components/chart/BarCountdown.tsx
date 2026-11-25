"use client";

import { useEffect, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { candlesRef } from "@/lib/chart/candles-ref";
import { formatCountdown, secondsToBarClose } from "@/lib/chart/countdown";
import { readableTextOn } from "@/lib/chart/contrast";
import { formatPrice } from "@/lib/format";
import { useChartStore } from "@/lib/store/chart-store";
import type { Timeframe } from "@/lib/binance/types";

/** Line height inside the block, and how many lines it stacks. */
const LINE_H = 15;
const LINES = 3;
const BLOCK_H = LINE_H * LINES;

/**
 * How far the plate reaches left of the price axis, into the plot.
 *
 * The axis is only ever as wide as its own labels, and the plate carries a
 * price of the same length plus padding — so sized to the axis it clipped the
 * last digits of its own number. Overhanging is also what the venues do: the
 * block is the one readout you look for, so it is allowed to sit proud of the
 * scale. Kept small enough that it covers only the last bar or two.
 */
const OVERHANG = 16;

interface Props {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
  timeframe: Timeframe;
  /** Live last price — the block replaces the native axis label. */
  lastPrice: number | null;
  /** 24h-style change for the same tick, shown under the price. */
  lastPct: number | null;
  /** Full chart width; the price scale is whatever the time scale doesn't use. */
  containerWidth: number;
  mainPaneHeight: number;
  /** Bumped by PriceChart on every chart repaint, so the chip follows pans/zooms. */
  renderTick: number;
}

/**
 * The last-price block on the price axis: price, change and the countdown to
 * the current bar's close, as one plate.
 *
 * It replaces lightweight-charts' own last-value label rather than sitting
 * under it — `PriceChart` turns that label off whenever this is mounted.
 * Two separate boxes in two different colours, one grey and one tinted, read
 * as two unrelated readouts stacked by accident; the venue convention, and
 * what this now matches, is a single plate in the candle's colour.
 *
 * It lives outside lightweight-charts (which has no API for annotating the
 * price scale) as an absolutely-positioned chip, so it needs the same two
 * measurements every other overlay here takes: `timeScale().width()` for where
 * the plot ends and the axis begins, and `priceToCoordinate` for the label's y.
 *
 * PriceChart only mounts this while `showBarCountdown` is on, so the 1s
 * interval is not paid for by anyone who turns the chip off in chart settings.
 */
export function BarCountdown({
  chart,
  candleSeries,
  timeframe,
  lastPrice,
  lastPct,
  containerWidth,
  mainPaneHeight,
  renderTick,
}: Props) {
  const chartColors = useChartStore((s) => s.chartColors);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  void renderTick;

  if (!chart || !candleSeries || lastPrice === null) return null;

  const last = candlesRef.current[candlesRef.current.length - 1];
  if (!last) return null;

  const plotW = chart.timeScale().width();
  const axisW = containerWidth - plotW;
  // No room for the chip (price scale hidden or chart not laid out yet).
  if (axisW < 24) return null;

  const y = candleSeries.priceToCoordinate(lastPrice);
  if (y === null) return null;

  // Centred on the price, clamped so it never hangs off either edge of the
  // pane — at the extremes the plate slides rather than being cut.
  let top = (y as number) - BLOCK_H / 2;
  if (top + BLOCK_H > mainPaneHeight) top = mainPaneHeight - BLOCK_H;
  if (top < 0) top = 0;

  const remaining = secondsToBarClose(last.time, timeframe, now);
  const up = last.close >= last.open;
  // Border, not body: bodies may be translucent (the default palette draws
  // them at 30%), and a see-through plate over the price axis is unreadable.
  // The border colour is the solid one of the pair.
  const bg = up ? chartColors.borderUp : chartColors.borderDown;
  const fg = readableTextOn(bg);

  return (
    <div
      className="pointer-events-none absolute z-10 flex flex-col items-center justify-center rounded-sm text-[10px] font-semibold tabular-nums leading-none"
      style={{
        left: plotW + 1 - OVERHANG,
        top,
        width: axisW - 2 + OVERHANG,
        height: BLOCK_H,
        backgroundColor: bg,
        color: fg,
      }}
      title="Last price, change, and time left until the current bar closes"
    >
      <span className="w-full truncate text-center">{formatPrice(lastPrice)}</span>
      {lastPct !== null && (
        <span className="w-full truncate text-center opacity-80">
          {lastPct >= 0 ? "+" : ""}{lastPct.toFixed(2)}%
        </span>
      )}
      <span className="w-full truncate text-center opacity-80">
        {formatCountdown(remaining)}
      </span>
    </div>
  );
}
