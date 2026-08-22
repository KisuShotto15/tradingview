"use client";

import { useEffect, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { candlesRef } from "@/lib/chart/candles-ref";
import { formatCountdown, secondsToBarClose } from "@/lib/chart/countdown";
import { useChartStore } from "@/lib/store/chart-store";
import type { Timeframe } from "@/lib/binance/types";

/** Height of the countdown chip, and the gap kept below the price label. */
const CHIP_H = 16;
const LABEL_HALF_H = 10;

interface Props {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
  timeframe: Timeframe;
  /** Live last price — the countdown sits directly under its axis label. */
  lastPrice: number | null;
  /** Full chart width; the price scale is whatever the time scale doesn't use. */
  containerWidth: number;
  mainPaneHeight: number;
  /** Bumped by PriceChart on every chart repaint, so the chip follows pans/zooms. */
  renderTick: number;
}

/**
 * TradingView's countdown to the current bar's close, rendered on the price
 * axis right below the last-price label.
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

  // Below the label normally; above it when the price sits at the very bottom.
  let top = (y as number) + LABEL_HALF_H;
  if (top + CHIP_H > mainPaneHeight) top = (y as number) - LABEL_HALF_H - CHIP_H;
  if (top < 0) return null;

  const remaining = secondsToBarClose(last.time, timeframe, now);
  const up = last.close >= last.open;

  return (
    <div
      className="pointer-events-none absolute z-10 flex items-center justify-center rounded-sm text-[10px] font-semibold tabular-nums leading-none text-white"
      style={{
        left: plotW + 1,
        top,
        width: axisW - 2,
        height: CHIP_H,
        backgroundColor: up ? chartColors.bodyUp : chartColors.bodyDown,
      }}
      title="Time left until the current bar closes"
    >
      {formatCountdown(remaining)}
    </div>
  );
}
