"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";

/** Diameter in CSS pixels. Small enough not to sit on the candles it marks. */
const SIZE = 24;

/**
 * The touch-only "+" parked on the price scale at the crosshair's level.
 *
 * It is a component of its own, with its own crosshair subscription, for one
 * reason: the crosshair fires on every touch-move, and routing that through
 * `PriceChart`'s state would re-render the whole chart at finger frequency.
 * Here the position is written straight to the node's style and only the
 * show/hide transition goes through React — one state change per gesture
 * instead of one per pixel.
 *
 * Visibility follows the crosshair exactly. lightweight-charts keeps the
 * crosshair up after the finger lifts (which is what makes the button
 * tappable at all) and sends a single point-less crosshair event when it is
 * dismissed — a tap elsewhere, a pan. That event is the hide signal; there is
 * no parked default position, so the button exists only while there is a
 * level to act on.
 */
export function AxisPlusButton({
  chart,
  candleSeries,
  containerWidth,
  mainPaneHeight,
  onPick,
}: {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
  containerWidth: number;
  mainPaneHeight: number;
  onPick: (price: number) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  /** Latest crosshair level. Written on every move, read on click. */
  const posRef = useRef<{ y: number; price: number } | null>(null);
  const [visible, setVisible] = useState(false);
  // Mirrors `visible` for the subscription, which is created once and would
  // otherwise close over the first render's value.
  const visibleRef = useRef(false);

  useEffect(() => {
    if (!chart || !candleSeries) return;

    const place = (y: number) => {
      const el = btnRef.current;
      if (el) el.style.top = `${y - SIZE / 2}px`;
    };

    const handler = (param: { point?: { x: number; y: number }; sourceEvent?: unknown }) => {
      if (param.point) {
        const price = candleSeries.coordinateToPrice(param.point.y);
        if (price === null || !isFinite(price as number)) return;
        posRef.current = { y: param.point.y, price: price as number };
        place(param.point.y);
        // `sourceEvent` is what separates "the user put the crosshair here"
        // from the crosshair events the library emits when the data changes
        // under a stale position — dozens of those arrive at load, and
        // showing the button for them would park it on a chart nobody has
        // touched. Once it is up, those same events keep it in place.
        if (!visibleRef.current && param.sourceEvent) {
          visibleRef.current = true;
          setVisible(true);
        }
      } else if (visibleRef.current) {
        visibleRef.current = false;
        setVisible(false);
      }
    };

    chart.subscribeCrosshairMove(handler);
    return () => {
      chart.unsubscribeCrosshairMove(handler);
    };
  }, [chart, candleSeries]);

  // The node does not exist yet on the render that turns `visible` on, so the
  // first position is applied here rather than from the handler.
  useLayoutEffect(() => {
    const pos = posRef.current;
    if (visible && pos && btnRef.current) {
      btnRef.current.style.top = `${pos.y - SIZE / 2}px`;
    }
  }, [visible]);

  if (!visible || !chart) return null;

  const plotW = chart.timeScale().width();
  if (plotW <= 0 || containerWidth - plotW < 24 || mainPaneHeight <= 0) return null;

  return (
    <button
      ref={btnRef}
      type="button"
      aria-label="Actions at this price"
      onClick={() => {
        const pos = posRef.current;
        if (pos) onPick(pos.price);
      }}
      className="pointer-events-auto absolute z-20 flex items-center justify-center rounded-full border border-tv-border bg-tv-panel/95 text-tv-text shadow-md active:bg-tv-panel-hover"
      style={{ left: plotW - SIZE - 2, width: SIZE, height: SIZE, top: 0 }}
    >
      <Plus className="h-3 w-3" />
    </button>
  );
}
