/**
 * Remembering where the user was looking, across a data refetch or a restart.
 *
 * Two things kept losing it. A refetch replaces the whole candle array through
 * `setData`, and the logical range that survives that points at *different*
 * bars, so the chart jumps. And on a cold start — the phone evicting the app,
 * a reload — there was nothing to go back to at all: every launch landed on
 * the right edge at the default zoom, however far back the user had scrolled.
 *
 * What is stored is deliberately not the logical range. Logical indices are
 * positions in whatever array is loaded, and the array changes under them.
 * Stored instead:
 *
 * - `span`, how many bars are on screen — that is the zoom, and it is the one
 *   number that means the same thing against any array.
 * - `fromTime`, the timestamp at the left edge, so a window over history comes
 *   back over the same history.
 * - `rightOffset`, how many bars of empty space sat to the right of the last
 *   candle. At the right edge that gap *is* the position, and it is what has
 *   to be reproduced rather than a timestamp that no longer exists.
 *
 * Restoring prefers the timestamp and falls back to the right-edge gap, which
 * is what "where I was" means in each case.
 */

export interface SavedViewport {
  /** Bars visible across the pane. Fractional: a partial bar is still zoom. */
  span: number;
  /** Timestamp at the left edge, or null when it sat past the last bar. */
  fromTime: number | null;
  /** Bars of whitespace to the right of the last candle. */
  rightOffset: number;
}

export interface LogicalRange {
  from: number;
  to: number;
}

/** Not worth restoring, and cheap insurance against a garbled store. */
function sane(v: SavedViewport | null): v is SavedViewport {
  return (
    !!v &&
    Number.isFinite(v.span) &&
    v.span > 0 &&
    v.span < 100_000 &&
    Number.isFinite(v.rightOffset) &&
    (v.fromTime === null || Number.isFinite(v.fromTime))
  );
}

/**
 * Turn the chart's current logical range into something that survives the
 * array being replaced. `times` is the candle timestamps, ascending.
 */
export function captureViewport(
  range: LogicalRange | null,
  times: number[],
): SavedViewport | null {
  if (!range || times.length === 0) return null;
  const span = range.to - range.from;
  if (!Number.isFinite(span) || span <= 0) return null;

  const lastIdx = times.length - 1;
  const fromIdx = Math.round(range.from);
  const fromTime = fromIdx >= 0 && fromIdx <= lastIdx ? times[fromIdx] : null;

  return { span, fromTime, rightOffset: range.to - lastIdx };
}

/**
 * Rebuild a logical range for the array now loaded.
 *
 * Returns null when there is nothing sensible to restore, which leaves
 * lightweight-charts' own default (the right edge) in place.
 */
export function restoreViewport(
  saved: SavedViewport | null,
  times: number[],
): LogicalRange | null {
  if (!sane(saved) || times.length === 0) return null;
  const lastIdx = times.length - 1;

  if (saved.fromTime !== null) {
    const idx = nearestIndex(times, saved.fromTime);
    if (idx !== null) return { from: idx, to: idx + saved.span };
  }

  // The left edge was past the data (the user was parked at the right edge
  // with whitespace); reproduce the gap instead.
  const to = lastIdx + saved.rightOffset;
  return { from: to - saved.span, to };
}

/** Index of the candle closest to `time`, by binary search. */
function nearestIndex(times: number[], time: number): number | null {
  if (times.length === 0) return null;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  // `lo` is the first index at or after `time`; the one before may be closer.
  if (lo > 0 && Math.abs(times[lo - 1] - time) < Math.abs(times[lo] - time)) {
    return lo - 1;
  }
  return lo;
}

/**
 * True when two candle arrays are the same as far as the chart is concerned.
 *
 * A refetch that brings back exactly what is already drawn still costs a full
 * `setData` on every series plus every indicator recomputed, and that is what
 * made coming back to the app feel like the chart was rebuilding itself. Same
 * length, same first and last bar, same last close is enough: candles only
 * ever change at the right edge.
 */
export function sameCandles(
  a: { time: number; close: number }[],
  b: { time: number; close: number }[],
): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  const lastA = a[a.length - 1];
  const lastB = b[b.length - 1];
  return (
    a[0].time === b[0].time &&
    lastA.time === lastB.time &&
    lastA.close === lastB.close
  );
}
