import type { Candle } from "@/lib/binance/types";
import type { KeyLevelsConfig } from "@/lib/store/chart-store";

/**
 * Key Levels indicator — produces a list of horizontal price levels for a chart
 * overlay (Daily/Weekly/Monthly/Quarterly/Yearly opens, previous H/L/Mid, Monday
 * range, 4H levels). Adapted from the Pine Script published by @gunebakan.
 *
 * Each emitted level has an absolute price, an anchor time (when its source
 * period began) and a short label.
 */

export interface KeyLevel {
  /** Price at which the horizontal line is drawn. */
  price: number;
  /** Anchor time (unix seconds) — the start of the period the level represents. */
  startTime: number;
  /** Short label rendered at the right edge of the line. */
  label: string;
  /** Fill color (CSS). */
  color: string;
  /** Tooltip when hovered (longer description). */
  tooltip: string;
}

interface PeriodAgg {
  open: number;
  high: number;
  low: number;
  close: number;
  startTime: number; // unix seconds at the start of the period
}

/** Floor a unix timestamp (seconds) to the start of its UTC day. */
function floorDay(ts: number): number {
  const d = new Date(ts * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000);
}

/** Floor to the start of the ISO week (Monday). */
function floorWeek(ts: number): number {
  const day = floorDay(ts);
  const d = new Date(day * 1000);
  const dow = d.getUTCDay(); // 0=Sun .. 6=Sat
  const back = dow === 0 ? 6 : dow - 1;
  return day - back * 86400;
}

function floorMonth(ts: number): number {
  const d = new Date(ts * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
}

function floorQuarter(ts: number): number {
  const d = new Date(ts * 1000);
  const q = Math.floor(d.getUTCMonth() / 3) * 3;
  return Math.floor(Date.UTC(d.getUTCFullYear(), q, 1) / 1000);
}

function floorYear(ts: number): number {
  const d = new Date(ts * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), 0, 1) / 1000);
}

function floor4H(ts: number): number {
  return Math.floor(ts / (4 * 3600)) * (4 * 3600);
}

/** Group candles by the given period-start function and produce sorted aggregates. */
function aggregate(candles: Candle[], floor: (t: number) => number): PeriodAgg[] {
  const buckets = new Map<number, PeriodAgg>();
  for (const c of candles) {
    const start = floor(c.time);
    const prev = buckets.get(start);
    if (!prev) {
      buckets.set(start, { open: c.open, high: c.high, low: c.low, close: c.close, startTime: start });
    } else {
      if (c.high > prev.high) prev.high = c.high;
      if (c.low < prev.low) prev.low = c.low;
      prev.close = c.close;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.startTime - b.startTime);
}

/** Pull the current and previous bucket; safe with sparse data. */
function lastTwo(buckets: PeriodAgg[]): { curr: PeriodAgg | null; prev: PeriodAgg | null } {
  if (buckets.length === 0) return { curr: null, prev: null };
  return {
    curr: buckets[buckets.length - 1],
    prev: buckets.length > 1 ? buckets[buckets.length - 2] : null,
  };
}

/** Find the most recent Monday bucket (current week's Monday day). */
function findMonday(candles: Candle[]): PeriodAgg | null {
  if (candles.length === 0) return null;
  const lastTime = candles[candles.length - 1].time;
  const mondayStart = floorWeek(lastTime); // start of current week = Monday
  const mondayEnd = mondayStart + 86400;
  let open = NaN, high = -Infinity, low = Infinity, close = NaN;
  for (const c of candles) {
    if (c.time < mondayStart) continue;
    if (c.time >= mondayEnd) break;
    if (isNaN(open)) open = c.open;
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
    close = c.close;
  }
  if (isNaN(open)) return null;
  return { open, high, low, close, startTime: mondayStart };
}

export function computeKeyLevels(
  candles: Candle[],
  cfg: KeyLevelsConfig,
): KeyLevel[] {
  if (candles.length === 0) return [];

  const daily = aggregate(candles, floorDay);
  const weekly = aggregate(candles, floorWeek);
  const monthly = aggregate(candles, floorMonth);
  const quarterly = aggregate(candles, floorQuarter);
  const yearly = aggregate(candles, floorYear);
  const fourH = aggregate(candles, floor4H);
  const monday = findMonday(candles);

  const out: KeyLevel[] = [];

  // ── DAILY
  const d = lastTwo(daily);
  if (d.curr) {
    if (cfg.daily.open) {
      out.push({ price: d.curr.open, startTime: d.curr.startTime, label: "DO", color: cfg.daily.color, tooltip: "Daily Open" });
    }
  }
  if (d.prev) {
    if (cfg.daily.prevOpen) out.push({ price: d.prev.open, startTime: d.prev.startTime, label: "PDO", color: cfg.daily.color, tooltip: "Previous Daily Open" });
    if (cfg.daily.prevHL) {
      out.push({ price: d.prev.high, startTime: d.prev.startTime, label: "PDH", color: cfg.daily.color, tooltip: "Previous Daily High" });
      out.push({ price: d.prev.low,  startTime: d.prev.startTime, label: "PDL", color: cfg.daily.color, tooltip: "Previous Daily Low" });
    }
    if (cfg.daily.prevMid) {
      out.push({ price: (d.prev.high + d.prev.low) / 2, startTime: d.prev.startTime, label: "PDM", color: cfg.daily.color, tooltip: "Previous Day Mid" });
    }
  }

  // ── MONDAY RANGE
  if (monday) {
    if (cfg.monday.range) {
      out.push({ price: monday.high, startTime: monday.startTime, label: "MondayH", color: cfg.monday.color, tooltip: "Monday High" });
      out.push({ price: monday.low,  startTime: monday.startTime, label: "MondayL", color: cfg.monday.color, tooltip: "Monday Low" });
    }
    if (cfg.monday.mid) {
      out.push({ price: (monday.high + monday.low) / 2, startTime: monday.startTime, label: "MondayM", color: cfg.monday.color, tooltip: "Monday Mid" });
    }
  }

  // ── WEEKLY
  const w = lastTwo(weekly);
  if (w.curr && cfg.weekly.open) {
    out.push({ price: w.curr.open, startTime: w.curr.startTime, label: "WO", color: cfg.weekly.color, tooltip: "Weekly Open" });
  }
  if (w.prev) {
    if (cfg.weekly.prevOpen) out.push({ price: w.prev.open, startTime: w.prev.startTime, label: "PWO", color: cfg.weekly.color, tooltip: "Previous Weekly Open" });
    if (cfg.weekly.prevHL) {
      out.push({ price: w.prev.high, startTime: w.prev.startTime, label: "PWH", color: cfg.weekly.color, tooltip: "Previous Weekly High" });
      out.push({ price: w.prev.low,  startTime: w.prev.startTime, label: "PWL", color: cfg.weekly.color, tooltip: "Previous Weekly Low" });
    }
    if (cfg.weekly.prevMid) {
      out.push({ price: (w.prev.high + w.prev.low) / 2, startTime: w.prev.startTime, label: "PWM", color: cfg.weekly.color, tooltip: "Previous Weekly Mid" });
    }
  }

  // ── MONTHLY
  const m = lastTwo(monthly);
  if (m.curr && cfg.monthly.open) {
    out.push({ price: m.curr.open, startTime: m.curr.startTime, label: "MO", color: cfg.monthly.color, tooltip: "Monthly Open" });
  }
  if (m.prev) {
    if (cfg.monthly.prevOpen) out.push({ price: m.prev.open, startTime: m.prev.startTime, label: "PMO", color: cfg.monthly.color, tooltip: "Previous Monthly Open" });
    if (cfg.monthly.prevHL) {
      out.push({ price: m.prev.high, startTime: m.prev.startTime, label: "PMH", color: cfg.monthly.color, tooltip: "Previous Monthly High" });
      out.push({ price: m.prev.low,  startTime: m.prev.startTime, label: "PML", color: cfg.monthly.color, tooltip: "Previous Monthly Low" });
    }
    if (cfg.monthly.prevMid) {
      out.push({ price: (m.prev.high + m.prev.low) / 2, startTime: m.prev.startTime, label: "PMM", color: cfg.monthly.color, tooltip: "Previous Monthly Mid" });
    }
  }

  // ── QUARTERLY
  const q = lastTwo(quarterly);
  if (q.curr && cfg.quarterly.open) {
    out.push({ price: q.curr.open, startTime: q.curr.startTime, label: "QO", color: cfg.quarterly.color, tooltip: "Quarterly Open" });
  }
  if (q.prev) {
    if (cfg.quarterly.prevOpen) out.push({ price: q.prev.open, startTime: q.prev.startTime, label: "PQO", color: cfg.quarterly.color, tooltip: "Previous Quarterly Open" });
    if (cfg.quarterly.prevHL) {
      out.push({ price: q.prev.high, startTime: q.prev.startTime, label: "PQH", color: cfg.quarterly.color, tooltip: "Previous Quarterly High" });
      out.push({ price: q.prev.low,  startTime: q.prev.startTime, label: "PQL", color: cfg.quarterly.color, tooltip: "Previous Quarterly Low" });
    }
    if (cfg.quarterly.prevMid) {
      out.push({ price: (q.prev.high + q.prev.low) / 2, startTime: q.prev.startTime, label: "PQM", color: cfg.quarterly.color, tooltip: "Previous Quarterly Mid" });
    }
  }

  // ── YEARLY
  const y = lastTwo(yearly);
  if (y.curr) {
    if (cfg.yearly.open)   out.push({ price: y.curr.open, startTime: y.curr.startTime, label: "YO", color: cfg.yearly.color, tooltip: "Yearly Open" });
    if (cfg.yearly.currHL) {
      out.push({ price: y.curr.high, startTime: y.curr.startTime, label: "YH", color: cfg.yearly.color, tooltip: "Current Year High" });
      out.push({ price: y.curr.low,  startTime: y.curr.startTime, label: "YL", color: cfg.yearly.color, tooltip: "Current Year Low" });
    }
    if (cfg.yearly.currMid) {
      out.push({ price: (y.curr.high + y.curr.low) / 2, startTime: y.curr.startTime, label: "YM", color: cfg.yearly.color, tooltip: "Current Year Mid" });
    }
  }
  if (y.prev && cfg.yearly.prevOpen) {
    out.push({ price: y.prev.open, startTime: y.prev.startTime, label: "PYO", color: cfg.yearly.color, tooltip: "Previous Yearly Open" });
  }

  // ── 4H
  const fh = lastTwo(fourH);
  if (fh.curr && cfg.fourHour.open) {
    out.push({ price: fh.curr.open, startTime: fh.curr.startTime, label: "4hO", color: cfg.fourHour.color, tooltip: "4H Open" });
  }
  if (fh.prev) {
    if (cfg.fourHour.prevHL) {
      out.push({ price: fh.prev.high, startTime: fh.prev.startTime, label: "P4hH", color: cfg.fourHour.color, tooltip: "Previous 4H High" });
      out.push({ price: fh.prev.low,  startTime: fh.prev.startTime, label: "P4hL", color: cfg.fourHour.color, tooltip: "Previous 4H Low" });
    }
    if (cfg.fourHour.prevMid) {
      out.push({ price: (fh.prev.high + fh.prev.low) / 2, startTime: fh.prev.startTime, label: "P4hM", color: cfg.fourHour.color, tooltip: "Previous 4H Mid" });
    }
  }

  return out;
}
