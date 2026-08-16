import type { Drawing, Point } from "./types";

/**
 * Shift a drawing by a time/price delta, returning the moved copy.
 *
 * Every anchor a drawing owns moves together, so the shape is preserved — this
 * is a translation, never a resize. Kinds that are unbounded on an axis ignore
 * that axis: a horizontal line has no time, a vertical line has no price.
 *
 * Pure, so it can back both keyboard nudging and any future programmatic move.
 */
export function translateDrawing(d: Drawing, dt: number, dp: number): Drawing {
  const p = (pt: Point): Point => ({ time: pt.time + dt, price: pt.price + dp });
  const pts = (list: Point[]): Point[] => list.map(p);

  switch (d.kind) {
    // Single-axis shapes: the other axis spans the whole chart.
    case "hline":
      return { ...d, price: d.price + dp };
    case "vline":
      return { ...d, time: d.time + dt };
    case "date-range":
      return { ...d, timeA: d.timeA + dt, timeB: d.timeB + dt };

    case "hray":
      return { ...d, anchor: p(d.anchor) };
    case "text":
      return { ...d, anchor: p(d.anchor) };
    case "callout":
      return { ...d, anchor: p(d.anchor), target: p(d.target) };

    case "trendline":
    case "ray":
    case "arrow":
    case "rectangle":
      return { ...d, a: p(d.a), b: p(d.b) };
    case "fib-retracement":
      return { ...d, a: p(d.a), b: p(d.b) };

    case "parallel-channel":
    case "fib-extension":
    case "pitchfork":
      return { ...d, a: p(d.a), b: p(d.b), c: p(d.c) };

    case "price-range":
      return {
        ...d,
        priceA: d.priceA + dp,
        priceB: d.priceB + dp,
        timeA: d.timeA + dt,
        timeB: d.timeB + dt,
      };

    case "long":
    case "short":
      return {
        ...d,
        entry: d.entry + dp,
        stop: d.stop + dp,
        target: d.target + dp,
        timeA: d.timeA + dt,
        timeB: d.timeB + dt,
      };

    case "brush":
    case "highlighter":
      return {
        ...d,
        points: pts(d.points),
        // Logicals are bar indices cached for pixel-accurate rendering; drop
        // them so the moved shape is re-derived from the shifted times rather
        // than snapping back to the old x positions.
        logicals: undefined,
      };
    case "xabcd":
      return { ...d, points: pts(d.points) };
  }
}
