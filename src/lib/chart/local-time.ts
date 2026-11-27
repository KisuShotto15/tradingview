/**
 * Chart time in the viewer's own time zone.
 *
 * lightweight-charts treats every timestamp as UTC: tick marks fall on UTC
 * hour and day boundaries and every label reads UTC, so a trader in Caracas
 * (UTC-4) saw 13:00 on a candle that opened at 09:00 their time. The library's
 * documented fix is to shift every timestamp by the zone's offset before it
 * goes in, but the chart's times are shared with too much — drawings, alerts,
 * replay, the bar countdown, trade fills — that would each have to shift and
 * unshift in step. Instead the chart is created with a horizontal scale
 * behaviour (`createChartEx`) that leaves the data alone and only *reads* it
 * in the zone: tick weights (which marks are day boundaries, which are hours)
 * and every label. Everything else keeps working in real UTC seconds.
 *
 * Daily and longer bars stay in UTC on purpose. A crypto daily candle is the
 * exchange's UTC day; read in UTC-4 it would open at 20:00 the evening before
 * and every date on the axis would be one day early.
 *
 * Pure apart from `Intl`, so it is unit tested with a fixed zone.
 */

/** Tick weights, mirroring lightweight-charts' `TickMarkWeight` values. */
export const W = {
  LessThanSecond: 0,
  Second: 10,
  Minute1: 20,
  Minute5: 21,
  Minute30: 22,
  Hour1: 30,
  Hour3: 31,
  Hour6: 32,
  Hour12: 33,
  Day: 50,
  Month: 60,
  Year: 70,
} as const;

const INTRADAY_DIVISORS: { div: number; weight: number }[] = [
  { div: 1, weight: W.Second },
  { div: 60, weight: W.Minute1 },
  { div: 300, weight: W.Minute5 },
  { div: 1800, weight: W.Minute30 },
  { div: 3600, weight: W.Hour1 },
  { div: 3 * 3600, weight: W.Hour3 },
  { div: 6 * 3600, weight: W.Hour6 },
  { div: 12 * 3600, weight: W.Hour12 },
];

/** The browser's zone, e.g. "America/Caracas". */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, number>();

/**
 * Seconds to add to a UTC timestamp to get the zone's wall-clock time.
 *
 * Cached per zone and UTC hour: `formatToParts` is far too slow to call for
 * each of 2000 bars on every data update, and an offset only changes on the
 * hour (the same reasoning, and the same trick, as `vwap.ts`).
 */
export function zoneOffsetSec(timeSec: number, tz: string): number {
  if (tz === "UTC") return 0;
  const bucket = Math.floor(timeSec / 3600);
  const key = `${tz}|${bucket}`;
  const cached = offsetCache.get(key);
  if (cached !== undefined) return cached;
  let fmt = fmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(tz, fmt);
  }
  const probe = bucket * 3600;
  const p = Object.fromEntries(
    fmt.formatToParts(new Date(probe * 1000)).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  // Some ICU builds render midnight as "24" under hour12:false.
  const wall = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  ) / 1000;
  const offset = wall - probe;
  if (offsetCache.size > 20_000) offsetCache.clear();
  offsetCache.set(key, offset);
  return offset;
}

/** A Date whose UTC fields read the zone's wall clock. */
function wallDate(timeSec: number, tz: string): Date {
  return new Date((timeSec + zoneOffsetSec(timeSec, tz)) * 1000);
}

/** lightweight-charts' `weightByTime`, on the zone's wall clock. */
export function weightBetween(cur: number, prev: number, tz: string): number {
  const c = wallDate(cur, tz);
  const p = wallDate(prev, tz);
  if (c.getUTCFullYear() !== p.getUTCFullYear()) return W.Year;
  if (c.getUTCMonth() !== p.getUTCMonth()) return W.Month;
  if (c.getUTCDate() !== p.getUTCDate()) return W.Day;
  const cw = c.getTime() / 1000;
  const pw = p.getTime() / 1000;
  for (let i = INTRADAY_DIVISORS.length - 1; i >= 0; --i) {
    const { div, weight } = INTRADAY_DIVISORS[i];
    if (Math.floor(pw / div) !== Math.floor(cw / div)) return weight;
  }
  return W.LessThanSecond;
}

/** The mutable slice of lightweight-charts' `TimeScalePoint` this needs. */
export interface WeightedPoint {
  timeWeight: number;
  readonly originalTime: unknown;
}

/**
 * lightweight-charts' `fillWeightsForPoints`, on the zone's wall clock.
 * Returns false (and touches nothing) if a point's time is not a plain UTC
 * timestamp, so the caller can fall back to the library's own.
 */
export function fillWeights(points: WeightedPoint[], startIndex: number, tz: string): boolean {
  if (points.length === 0) return true;
  for (let i = Math.max(0, startIndex - 1); i < points.length; i++) {
    if (typeof points[i].originalTime !== "number") return false;
  }
  const t = (i: number) => points[i].originalTime as number;
  let prev: number | null = startIndex === 0 ? null : t(startIndex - 1);
  let total = 0;
  for (let i = startIndex; i < points.length; i++) {
    const cur = t(i);
    if (prev !== null) points[i].timeWeight = weightBetween(cur, prev, tz);
    total += cur - (prev ?? cur);
    prev = cur;
  }
  if (startIndex === 0 && points.length > 1) {
    // Guess the first point's weight from an imagined predecessor one
    // average spacing back, as the library does.
    const avg = Math.ceil(total / (points.length - 1));
    points[0].timeWeight = weightBetween(t(0), t(0) - avg, tz);
  }
  return true;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** lightweight-charts' `TickMarkType`: Year, Month, DayOfMonth, Time, TimeWithSeconds. */
export function formatTick(timeSec: number, tickMarkType: number, tz: string): string {
  const d = wallDate(timeSec, tz);
  switch (tickMarkType) {
    case 0:
      return String(d.getUTCFullYear());
    case 1:
      return MONTHS[d.getUTCMonth()];
    case 2:
      return String(d.getUTCDate());
    case 4:
      return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    default:
      return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }
}

/** The crosshair's time label: `27 Nov '26   13:11`, or the date alone for daily bars. */
export function formatCrosshairTime(timeSec: number, tz: string, withTime: boolean): string {
  const d = wallDate(timeSec, tz);
  const date = `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} '${pad(d.getUTCFullYear() % 100)}`;
  if (!withTime) return date;
  return `${date}   ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** lightweight-charts' `weightToTickMarkType`. */
export function tickMarkTypeFor(weight: number, timeVisible: boolean, secondsVisible: boolean): number {
  if (weight >= W.Year) return 0;
  if (weight >= W.Month) return 1;
  if (weight >= W.Day) return 2;
  if (weight >= W.Minute1) return timeVisible ? 3 : 2;
  return timeVisible ? (secondsVisible ? 4 : 3) : 2;
}
