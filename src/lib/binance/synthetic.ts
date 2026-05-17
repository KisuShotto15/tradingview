/**
 * Synthetic symbol expressions.
 *
 * Supports arithmetic over Binance trading pairs:
 *   BTCUSDT+ETHUSDT
 *   BTCUSDT/ETHUSDT
 *   (BTCUSDT+ETHUSDT)/2
 *   BTCUSDT-ETHUSDT
 *
 * The expression is applied separately to open/high/low/close per timestamp.
 * Strictly speaking max(A+B) != max(A)+max(B), but this matches how TradingView
 * renders synthetic candles and works well for visualization.
 */

import type { Candle, Timeframe } from "./types";
import { fetchKlines } from "./rest";

const OPS = /[+\-*/()]/;
const NUMBERS_ONLY = /^[\d\s+\-*/(). ]+$/;
/** A token is a sequence of uppercase letters and digits (a Binance symbol). */
const SYMBOL_TOKEN = /\b[A-Z][A-Z0-9]*\b/g;

/**
 * An expression is considered "synthetic" if it contains any binary operator
 * AND at least one symbol-looking token. Plain "BTCUSDT" is NOT synthetic.
 */
export function isSyntheticExpression(s: string): boolean {
  if (!s) return false;
  return OPS.test(s) && SYMBOL_TOKEN.test(s);
}

/** Extract the unique symbol tokens from the expression, sorted. */
export function extractSymbols(expr: string): string[] {
  const matches = expr.match(SYMBOL_TOKEN) ?? [];
  return Array.from(new Set(matches.map((s) => s.toUpperCase())));
}

/** Sanity-check the expression: only allowed characters. */
function validate(expr: string): void {
  // Allowed: letters, digits, whitespace, + - * / ( ) and dot for decimals
  if (!/^[A-Za-z0-9\s+\-*/().]+$/.test(expr)) {
    throw new Error("Expression has invalid characters");
  }
}

/**
 * Substitute symbol tokens with numeric values and evaluate.
 * After substitution the expression must contain only numbers and operators.
 */
function evaluateExpr(expr: string, values: Record<string, number>): number {
  validate(expr);
  let safe = expr.toUpperCase();
  // Replace symbols with their values, longest first so substrings don't collide
  const symbols = Object.keys(values).sort((a, b) => b.length - a.length);
  for (const sym of symbols) {
    safe = safe.replace(new RegExp(`\\b${sym}\\b`, "g"), String(values[sym]));
  }
  if (!NUMBERS_ONLY.test(safe)) {
    throw new Error(`Unresolved symbols in expression: ${safe}`);
  }
  // Force-evaluate; safe because we validated character class
  return new Function(`return (${safe});`)() as number;
}

/** Build synthetic candles by evaluating the expression on each timestamp. */
export async function fetchSyntheticKlines(
  expr: string,
  interval: Timeframe,
  limit = 1000,
): Promise<Candle[]> {
  const symbols = extractSymbols(expr);
  if (symbols.length === 0) throw new Error("No symbols in expression");

  const klinesArr = await Promise.all(
    symbols.map((s) => fetchKlines(s, interval, limit)),
  );

  // time → symbol → candle
  const byTime = new Map<number, Map<string, Candle>>();
  for (let i = 0; i < symbols.length; i++) {
    for (const k of klinesArr[i]) {
      if (!byTime.has(k.time)) byTime.set(k.time, new Map());
      byTime.get(k.time)!.set(symbols[i], k);
    }
  }

  const times = Array.from(byTime.keys()).sort((a, b) => a - b);
  const result: Candle[] = [];
  for (const t of times) {
    const m = byTime.get(t)!;
    if (m.size !== symbols.length) continue;
    const opens: Record<string, number> = {};
    const highs: Record<string, number> = {};
    const lows: Record<string, number> = {};
    const closes: Record<string, number> = {};
    let totalVol = 0;
    for (const sym of symbols) {
      const k = m.get(sym)!;
      opens[sym] = k.open;
      highs[sym] = k.high;
      lows[sym] = k.low;
      closes[sym] = k.close;
      totalVol += k.volume;
    }
    try {
      const o = evaluateExpr(expr, opens);
      const h = evaluateExpr(expr, highs);
      const l = evaluateExpr(expr, lows);
      const c = evaluateExpr(expr, closes);
      if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) continue;
      // High/low might be swapped if expression has subtractions; normalize
      const realHigh = Math.max(o, h, l, c);
      const realLow = Math.min(o, h, l, c);
      result.push({
        time: t,
        open: o,
        high: realHigh,
        low: realLow,
        close: c,
        volume: totalVol,
        isFinal: true,
      });
    } catch {
      continue;
    }
  }
  return result;
}

/** Compute the latest synthetic candle from a snapshot of component candles. */
export function evaluateCandleAt(
  expr: string,
  components: Map<string, Candle>,
): Candle | null {
  const symbols = extractSymbols(expr);
  if (symbols.some((s) => !components.has(s))) return null;
  const opens: Record<string, number> = {};
  const highs: Record<string, number> = {};
  const lows: Record<string, number> = {};
  const closes: Record<string, number> = {};
  let totalVol = 0;
  let time = 0;
  for (const sym of symbols) {
    const k = components.get(sym)!;
    opens[sym] = k.open;
    highs[sym] = k.high;
    lows[sym] = k.low;
    closes[sym] = k.close;
    totalVol += k.volume;
    time = Math.max(time, k.time);
  }
  try {
    const o = evaluateExpr(expr, opens);
    const h = evaluateExpr(expr, highs);
    const l = evaluateExpr(expr, lows);
    const c = evaluateExpr(expr, closes);
    if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) return null;
    return {
      time,
      open: o,
      high: Math.max(o, h, l, c),
      low: Math.min(o, h, l, c),
      close: c,
      volume: totalVol,
      isFinal: false,
    };
  } catch {
    return null;
  }
}
