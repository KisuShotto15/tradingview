"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { candlesRef } from "@/lib/chart/candles-ref";
import { formatCountdown, secondsToBarClose } from "@/lib/chart/countdown";
import { readableTextOn } from "@/lib/chart/contrast";
import { formatPrice } from "@/lib/format";
import { useChartStore } from "@/lib/store/chart-store";
import type { Timeframe } from "@/lib/binance/types";

/** Line height inside the block. */
const LINE_H = 15;

/**
 * The plate is as tall as the lines it carries: price, change and — only when
 * the countdown is switched on in chart settings — the time to the bar's
 * close. It used to be mounted only while the countdown was on, which left
 * lightweight-charts' own last-value label to be covered by the crosshair's
 * label with nothing able to move either one. The plate now always stands in
 * for that label, and turning the countdown off removes the countdown rather
 * than the price.
 */
function blockH(lines: number): number {
  return LINE_H * lines;
}

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

/** Half the height of lightweight-charts' own crosshair price label. */
const CROSSHAIR_LABEL_HALF = 11;

/** Where the plate's top edge lands, clamped inside the pane. */
function plateTop(y: number, paneHeight: number, lines: number): number {
  const h = blockH(lines);
  let top = y - h / 2;
  if (top + h > paneHeight) top = paneHeight - h;
  if (top < 0) top = 0;
  return top;
}

/** The plate's centre, measured after clamping. */
function plateCentre(
  series: ISeriesApi<"Candlestick">,
  price: number,
  paneHeight: number,
  lines: number,
): number | null {
  const y = series.priceToCoordinate(price);
  if (y === null) return null;
  return plateTop(y as number, paneHeight, lines) + blockH(lines) / 2;
}

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
  /** Chart settings' bar-countdown toggle: adds the third line. */
  showCountdown: boolean;
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
 * The 1s interval only runs while the countdown line is actually shown, so
 * nobody who turns it off in chart settings pays for it.
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
  showCountdown,
}: Props) {
  const chartColors = useChartStore((s) => s.chartColors);
  const [now, setNow] = useState(() => Date.now());
  // Price, change (when there is one) and the countdown (when it is on).
  const lines = 1 + (lastPct !== null ? 1 : 0) + (showCountdown ? 1 : 0);
  const BLOCK_H = blockH(lines);

  /*
   * Whether the crosshair's own price label is over the plate.
   *
   * Both sit on the price axis, and lightweight-charts draws its label right
   * across this plate when the crosshair passes the last price. Something has
   * to give, and it is the plate: the price under the cursor is what you are
   * looking at while you move the cursor, so it takes priority and the plate
   * steps out from under it until the crosshair moves on.
   *
   * The plate used to *move* instead — a whole block height, signed away from
   * the crosshair. That kept both readable but broke the thing a price axis is
   * for: the label left the price it belongs to, so the last price appeared to
   * jump around the scale whenever the cursor went near it, and the axis
   * stopped being a fixed ruler you can read a position against. Fixed in
   * place and yielding is what the venues do.
   *
   * It is state rather than a style written in the crosshair handler because
   * it changes twice per pass — in and out of the overlap — not once per pixel
   * of movement. And because the plate no longer moves, the test is taken
   * against one fixed position: there is no feedback loop left to oscillate,
   * which the dodging version had to be written carefully to avoid.
   */
  const [covered, setCovered] = useState(false);
  /**
   * The inputs the handler needs to work out where the plate sits. Kept in a
   * ref and refreshed in an effect: the handler is registered once, and the
   * alternative — writing the computed position during render — is the thing
   * that makes a render depend on the previous one.
   */
  const placeRef = useRef({ lastPrice, mainPaneHeight, lines });

  useEffect(() => {
    if (!showCountdown) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [showCountdown]);

  useEffect(() => {
    placeRef.current = { lastPrice, mainPaneHeight, lines };
  });

  useEffect(() => {
    if (!chart || !candleSeries) return;
    const handler = (param: { point?: { x: number; y: number } }) => {
      const { lastPrice: p, mainPaneHeight: h, lines: n } = placeRef.current;
      const centre = p === null ? null : plateCentre(candleSeries, p, h, n);
      const hit =
        !!param.point &&
        centre !== null &&
        Math.abs(param.point.y - centre) < blockH(n) / 2 + CROSSHAIR_LABEL_HALF;
      setCovered((prev) => (prev === hit ? prev : hit));
    };
    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, [chart, candleSeries]);

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

  // The crosshair's label is over us: yield the space rather than fight for
  // it. Nothing else draws the last price here (PriceChart turns the native
  // last-value label off while this is mounted), so what the user sees is the
  // price under the cursor alone, which is the one they are reading.
  if (covered) return null;

  // Centred on the price, clamped so it never hangs off either edge of the
  // pane — at the extremes the plate slides rather than being cut.
  const top = plateTop(y as number, mainPaneHeight, lines);

  const remaining = showCountdown ? secondsToBarClose(last.time, timeframe, now) : 0;
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
      title={
        showCountdown
          ? "Last price, change, and time left until the current bar closes"
          : "Last price and change"
      }
    >
      <span className="w-full truncate text-center">{formatPrice(lastPrice)}</span>
      {lastPct !== null && (
        <span className="w-full truncate text-center opacity-80">
          {lastPct >= 0 ? "+" : ""}{lastPct.toFixed(2)}%
        </span>
      )}
      {showCountdown && (
        <span className="w-full truncate text-center opacity-80">
          {formatCountdown(remaining)}
        </span>
      )}
    </div>
  );
}
