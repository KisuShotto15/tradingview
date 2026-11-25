import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import type { ISeriesApi } from "lightweight-charts";
import { MAGNET_RADIUS_PX, magnetRadius } from "./magnet";
import { snapToOHLC } from "./snap";
import type { Candle } from "@/lib/binance/types";

/**
 * How far the magnet reaches, stated in the units the user actually feels:
 * pixels on screen.
 *
 * The reach lives in two halves that are easy to change independently and
 * then be surprised by — `MAGNET_RADIUS_PX`, and `snapToOHLC` measuring from
 * the candle's span rather than from the level. The reach was 14px, which on
 * a chart dense enough that a candle is a few pixels tall left a catchment
 * narrower than the gap a hand naturally misses by, so the magnet read as
 * broken. These cases fix the combined result at a realistic scale.
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

  it("is undefined without a series, leaving the magnet unbounded", () => {
    expect(magnetRadius(null, 100)).toBe(undefined);
  });
});

describe("the magnet's reach on screen", () => {
  // A dense, realistic chart: 0.75 price units per pixel, and a candle whose
  // whole high-low span is only 20 units — about 27 screen pixels.
  const pricePerPx = 0.75;
  const series = scale(60400, pricePerPx);
  const bar = candle(100, 60000, 60010, 59990, 60000);
  const px = (n: number) => n * pricePerPx;

  /** Does a click `offsetPx` below the candle's low get pulled to a level? */
  function snapsFromBelow(offsetPx: number): boolean {
    const y = 500;
    const price = bar.low - px(offsetPx);
    return snapToOHLC(price, 100, [bar], magnetRadius(series, y)) !== null;
  }

  it("grabs a click well clear of the candle", () => {
    expect(snapsFromBelow(10)).toBe(true);
    expect(snapsFromBelow(25)).toBe(true);
    // The old 14px reach stopped here; this is the gap being closed.
    expect(snapsFromBelow(29)).toBe(true);
  });

  it("still declines a click that is nowhere near the candle", () => {
    expect(snapsFromBelow(40)).toBe(false);
    expect(snapsFromBelow(120)).toBe(false);
  });

  it("picks the nearest of the four levels once it has engaged", () => {
    // Just under the low → the low, not the open/close 10 units above it.
    expect(snapToOHLC(bar.low - px(5), 100, [bar], magnetRadius(series, 500))).toBe(bar.low);
    // Just over the high → the high.
    expect(snapToOHLC(bar.high + px(5), 100, [bar], magnetRadius(series, 500))).toBe(bar.high);
  });

  it("gives a coarse pointer the wider reach", () => {
    expect(MAGNET_RADIUS_PX.coarse).toBeGreaterThan(MAGNET_RADIUS_PX.fine);
  });
});
