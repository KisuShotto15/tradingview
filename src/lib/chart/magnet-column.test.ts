import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import type { ISeriesApi } from "lightweight-charts";
import { MAGNET_RADIUS_PX, magnetRadius } from "./magnet";
import { snapToOHLC } from "./snap";
import type { Candle } from "@/lib/binance/types";

/**
 * The magnet, stated in the units the user feels.
 *
 * `magnetRadius` still converts a pixel reach into price, because the
 * drawings' levels are still bounded by it — but the candle is not, and these
 * cases pin that down at a realistic scale. The reach was 14px and then 30px,
 * and both were wrong in the same way: on a dense chart a bar is a few pixels
 * tall, so any vertical gate left the magnet silent wherever you were not
 * already on a level.
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

  it("is undefined without a series, leaving the drawings' levels unbounded", () => {
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

  it("grabs the bar from any height in its column", () => {
    for (const offsetPx of [5, 20, 40, 100, 400]) {
      expect(snapToOHLC(bar.low - px(offsetPx), 300, bars)).toBe(bar.low);
      expect(snapToOHLC(bar.high + px(offsetPx), 300, bars)).toBe(bar.high);
    }
  });

  it("picks the nearest of the four levels", () => {
    expect(snapToOHLC(bar.low + px(2), 300, bars)).toBe(bar.low);
    expect(snapToOHLC(bar.high - px(2), 300, bars)).toBe(bar.high);
  });

  it("lets the cursor move freely past the last bar", () => {
    // Half a bar past the last bar's centre is still its column; beyond that
    // there is no candle under the cursor.
    // 60008 is nearer the high than the body, so there is no tie to settle.
    expect(snapToOHLC(60008, 450, bars)).toBe(60010);
    expect(snapToOHLC(60008, 451, bars)).toBe(null);
  });
});
