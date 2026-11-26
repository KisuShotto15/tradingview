/**
 * Repairing a frozen chart with a tail instead of a reload.
 *
 * When the newest bar's close is already in the past and no successor has
 * arrived, something is missing. The old repair refetched 1000 bars and
 * `setData`'d every series plus every indicator for it, which is both the
 * heaviest thing the chart can do and — on a thin symbol, where the exchange
 * genuinely has no newer bar and so the staleness check never stops being
 * true — something it did every five seconds, forever. That is what read as
 * "the chart reloaded itself" and flickered.
 *
 * The hole is bounded, though: candle history never changes, so the only bars
 * that can be missing are the ones that closed since the newest one held. A
 * tail of that size, spliced in per bar, fills exactly the same hole for a
 * fraction of the work — and when the exchange has nothing newer, splicing an
 * unchanged tail costs nothing at all.
 *
 * These are the pure pieces of that decision, kept here so they can be tested
 * without a chart.
 */

export interface BarLike {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * How many bars should have closed since the bar opening at `lastBarTime` but
 * have not arrived. 0 while that bar is still forming.
 */
export function missingBars(lastBarTime: number, tfSec: number, nowSec: number): number {
  if (!Number.isFinite(lastBarTime) || !Number.isFinite(nowSec) || tfSec <= 0) return 0;
  const closedAt = lastBarTime + tfSec;
  if (nowSec <= closedAt) return 0;
  return Math.ceil((nowSec - closedAt) / tfSec);
}

/**
 * Whether a fetched tail can be spliced onto an array ending at `lastBarTime`.
 *
 * It can when the tail reaches back far enough to touch what is already held:
 * its oldest bar must be no later than the bar immediately after ours. A tail
 * that starts beyond that leaves a gap in the middle, which per-bar updates
 * cannot fill — only a full refetch can.
 */
export function tailConnects(
  lastBarTime: number | null,
  tailFirstTime: number,
  tfSec: number,
): boolean {
  if (lastBarTime === null) return false;
  return tailFirstTime <= lastBarTime + tfSec;
}

function sameBar(a: BarLike, b: BarLike): boolean {
  return (
    a.time === b.time &&
    a.open === b.open &&
    a.high === b.high &&
    a.low === b.low &&
    a.close === b.close &&
    a.volume === b.volume
  );
}

/**
 * True when splicing `tail` would change nothing that is drawn.
 *
 * Mirrors what the splice itself can do: it patches the bar that matches the
 * newest one held, appends anything newer, and skips the rest, because candle
 * history never changes. So nothing happens when the tail carries no bar past
 * our newest and the one matching it is identical.
 *
 * Worth asking because the splice recomputes every indicator over the whole
 * array, and the stale-bar check keeps firing on a symbol the exchange has
 * nothing new for: without this, "nothing has changed" still cost a full pass
 * over every study every five seconds.
 */
export function tailIsNoop(arr: BarLike[], tail: BarLike[]): boolean {
  if (tail.length === 0) return true;
  if (arr.length === 0) return false;
  const held = arr[arr.length - 1];
  for (const bar of tail) {
    if (bar.time > held.time) return false;
    if (bar.time === held.time && !sameBar(held, bar)) return false;
  }
  return true;
}
