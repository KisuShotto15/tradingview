/**
 * What the price pane's indicator lines are worth at a given time, for the
 * magnet to snap to — TradingView's "Snap to indicators", added to its magnet
 * in March 2025 ("now you can use it for a more precise alignment of drawings
 * to indicators").
 *
 * A registry rather than an import, for the same reason as the viewport
 * applier and the crosshair aimer: only the live chart knows which studies are
 * on, what they currently compute and which of them are visible, and the
 * drawing code that needs the answer must not depend on the chart component.
 *
 * Only main-pane overlays belong here. A sub-pane study (RSI, MACD) is drawn
 * against its own scale, and no drawing in this app lives in those panes, so
 * offering their values would snap a price to a number that is not a price.
 */

/** A study's line, as the chart computed it. Must be sorted by time. */
export interface LevelSeries {
  time: number;
  value: number;
}

export type IndicatorLevelsProvider = (time: number) => number[];

let provider: IndicatorLevelsProvider | null = null;

/** The focused chart publishes its overlay values here; null while none does. */
export function registerIndicatorLevels(fn: IndicatorLevelsProvider | null): void {
  provider = fn;
}

/** Every visible overlay's value at `time`, or nothing if no chart is live. */
export function indicatorLevelsAt(time: number): number[] {
  return provider ? provider(time) : [];
}

/**
 * The series' value at `time`, by binary search, or null when `time` is not a
 * point of it.
 *
 * Exact match only, deliberately: these arrays are computed per candle from
 * the same bars the magnet is snapping over, so the cursor's time either is
 * one of their points or is off the end of the study (an EMA has no value for
 * its first `period` bars, and an anchored VWAP none before its anchor).
 * Interpolating would invent a level there and the magnet would snap a point
 * onto a line that is not drawn.
 */
export function valueAtTime(series: readonly LevelSeries[], time: number): number | null {
  let lo = 0;
  let hi = series.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = series[mid].time;
    if (t === time) return Number.isFinite(series[mid].value) ? series[mid].value : null;
    if (t < time) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}
