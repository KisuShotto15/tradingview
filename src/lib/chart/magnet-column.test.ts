import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import type { ISeriesApi } from "lightweight-charts";
import { MAGNET_RADIUS_PX, magnetRadius } from "./magnet";
import { snapToOHLC } from "./snap";
import type { Candle } from "@/lib/binance/types";

/**
 * The magnet, stated in the units the user feels.
 *
 * Two gates, pinned here at a realistic scale: the bar's column decides *which*
 * candle, and the candle's own span widened by the pixel reach decides whether
 * the cursor is near enough to grab it at all. Each has been wrong on its own.
 * A reach measured from the *levels* (14px, then 30px) left the magnet silent
 * wherever you were not already on one — on a zoomed-out chart a whole bar is
 * a few pixels tall, so that is almost everywhere. Dropping the vertical gate
 * instead turned the snap into a teleport: a finger aiming at empty space on a
 * phone was pulled 147px to a bar's extreme at the top of the screen.
 */

/** A price scale with a fixed price-per-pixel, as a candlestick series. */
function scale(priceAtTop: number, pricePerPx: number): ISeriesApi<"Candlestick"> {
  return {
    coordinateToPrice: (y: number) => priceAtTop - y * pricePerPx,
  } as unknown as ISeriesApi<"Candlestick">;
}

function candle(time: number, o: number, h: number, l: number, c: number): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: 1, isFinal: true };
}

describe("magnetRadius", () => {
  it("converts the pixel reach through the series' own scale", () => {
    // 2 price units per pixel → the fine-pointer reach in price terms.
    expect(magnetRadius(scale(1000, 2), 100)).toBe(MAGNET_RADIUS_PX.fine * 2);
  });

  it("is undefined without a series, which leaves the snap unbounded", () => {
    expect(magnetRadius(null, 100)).toBe(undefined);
  });

  it("gives a coarse pointer the wider reach", () => {
    expect(MAGNET_RADIUS_PX.coarse).toBeGreaterThan(MAGNET_RADIUS_PX.fine);
  });
});

describe("the magnet over a dense chart", () => {
  // 0.75 price units per pixel, and a bar whose whole high-low span is 20
  // units — about 27 screen pixels, which is an ordinary bar on a zoomed-out
  // chart and the case every vertical reach got wrong.
  const pricePerPx = 0.75;
  const bars = [
    candle(0, 60000, 60010, 59990, 60000),
    candle(300, 60000, 60010, 59990, 60000),
  ];
  const bar = bars[1];
  const px = (n: number) => n * pricePerPx;

  // The reach a fine pointer gets, in price units at this scale.
  const reach = px(MAGNET_RADIUS_PX.fine);

  it("grabs the bar from anywhere on it, however tall the wick", () => {
    // The span itself needs no reach: every height between low and high, and
    // the levels themselves, grab the bar.
    for (const p of [bar.low, bar.low + 5, 60000, bar.high - 5, bar.high]) {
      expect(snapToOHLC(p, 300, bars, reach)).not.toBe(null);
    }
  });

  it("keeps pulling for the reach beyond the span, at either end", () => {
    for (const offsetPx of [1, 10, MAGNET_RADIUS_PX.fine - 1]) {
      expect(snapToOHLC(bar.low - px(offsetPx), 300, bars, reach)).toBe(bar.low);
      expect(snapToOHLC(bar.high + px(offsetPx), 300, bars, reach)).toBe(bar.high);
    }
  });

  it("lets go past the reach, so the cursor is never dragged across the pane", () => {
    for (const offsetPx of [MAGNET_RADIUS_PX.fine + 1, 100, 400]) {
      expect(snapToOHLC(bar.low - px(offsetPx), 300, bars, reach)).toBe(null);
      expect(snapToOHLC(bar.high + px(offsetPx), 300, bars, reach)).toBe(null);
    }
  });

  it("picks the nearest of the four levels", () => {
    expect(snapToOHLC(bar.low + px(2), 300, bars, reach)).toBe(bar.low);
    expect(snapToOHLC(bar.high - px(2), 300, bars, reach)).toBe(bar.high);
  });

  it("lets the cursor move freely past the last bar", () => {
    // Half a bar past the last bar's centre is still its column; beyond that
    // there is no candle under the cursor.
    // 60008 is nearer the high than the body, so there is no tie to settle.
    expect(snapToOHLC(60008, 450, bars, reach)).toBe(60010);
    expect(snapToOHLC(60008, 451, bars, reach)).toBe(null);
  });
});
