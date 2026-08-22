import type { Timeframe } from "@/lib/binance/types";
import { timeframeToSeconds } from "@/lib/chart/coords";

/**
 * When the bar that opened at `barOpenSec` closes, in epoch seconds.
 *
 * Every timeframe but "1M" is a fixed number of seconds, so the close is just
 * open + interval. Months are not: `timeframeToSeconds("1M")` is a 30-day
 * approximation used for pixel math, and adding it to a bar open would drift
 * the countdown by up to a day and a half. Calendar arithmetic in UTC (the
 * boundary both Binance and Bybit align monthly bars to) is exact.
 */
export function barCloseTime(barOpenSec: number, tf: Timeframe): number {
  if (tf === "1M") {
    const d = new Date(barOpenSec * 1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
  }
  return barOpenSec + timeframeToSeconds(tf);
}

/** Seconds left until the current bar closes, floored at 0. */
export function secondsToBarClose(
  barOpenSec: number,
  tf: Timeframe,
  nowMs: number,
): number {
  return Math.max(0, Math.ceil(barCloseTime(barOpenSec, tf) - nowMs / 1000));
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * TradingView's bar-close clock: `mm:ss` inside the hour, `h:mm:ss` inside the
 * day, and a leading day count above that (a weekly bar spends most of its
 * life there).
 */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (days > 0) return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(secs)}`;
  return `${pad(minutes)}:${pad(secs)}`;
}
