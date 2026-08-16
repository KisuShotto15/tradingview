/**
 * Chart-scale bridge for keyboard nudging.
 *
 * Moving a drawing with the arrow keys needs to know what one screen pixel is
 * worth in price, which only the live chart instance can answer. PriceChart
 * registers a probe here (same approach as the viewport applier used by
 * undo/redo) so the global shortcut handler can nudge without holding a chart
 * reference of its own.
 */

/** Price distance covered by one vertical pixel, or null if unavailable. */
let _pricePerPixel: (() => number | null) | null = null;

export function registerPricePerPixel(fn: () => number | null) {
  _pricePerPixel = fn;
}

export function getPricePerPixel(): number | null {
  return _pricePerPixel?.() ?? null;
}
