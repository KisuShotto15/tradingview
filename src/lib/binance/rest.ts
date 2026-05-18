import type { Candle, SymbolInfo, Ticker24h, Timeframe } from "./types";

const SPOT_BASE = "https://api.binance.com/api/v3";
const FUTURES_BASE = "https://fapi.binance.com/fapi/v1";

/** Symbols ending in ".P" are USDT-M perpetual futures (e.g. BTCUSDT.P). */
export function isPerp(s: string): boolean {
  return s.toUpperCase().endsWith(".P");
}
/** Strip the .P suffix to get the raw Binance ticker. */
export function cleanSym(s: string): string {
  return s.toUpperCase().replace(/\.P$/, "");
}
function restBase(s: string): string {
  return isPerp(s) ? FUTURES_BASE : SPOT_BASE;
}

export async function fetchKlines(
  symbol: string,
  interval: Timeframe,
  limit = 1000,
): Promise<Candle[]> {
  const sym = cleanSym(symbol);
  const url = `${restBase(symbol)}/klines?symbol=${sym}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`klines ${res.status}`);
  const data = (await res.json()) as unknown[][];
  return data.map((k) => ({
    time: Math.floor((k[0] as number) / 1000),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
    isFinal: true,
  }));
}

export async function fetchTicker24h(symbol: string): Promise<Ticker24h> {
  const sym = cleanSym(symbol);
  const url = `${restBase(symbol)}/ticker/24hr?symbol=${sym}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ticker ${res.status}`);
  const t = await res.json();
  return {
    symbol: t.symbol,
    lastPrice: parseFloat(t.lastPrice),
    priceChange: parseFloat(t.priceChange),
    priceChangePercent: parseFloat(t.priceChangePercent),
    highPrice: parseFloat(t.highPrice),
    lowPrice: parseFloat(t.lowPrice),
    volume: parseFloat(t.volume),
    quoteVolume: parseFloat(t.quoteVolume),
  };
}

export async function fetchTickers24h(symbols: string[]): Promise<Ticker24h[]> {
  // Split by market so we can hit the right endpoint with one batch each
  const spot = symbols.filter((s) => !isPerp(s));
  const perp = symbols.filter((s) => isPerp(s));
  const results: Ticker24h[] = [];

  async function batch(syms: string[], base: string, keepSuffix: (s: string) => string) {
    if (syms.length === 0) return;
    const cleaned = syms.map((s) => cleanSym(s));
    const arr = JSON.stringify(cleaned);
    const url = `${base}/ticker/24hr?symbols=${encodeURIComponent(arr)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`tickers ${res.status}`);
    const data = await res.json();
    const items = data.map((t: Record<string, string>) => ({
      symbol: keepSuffix(t.symbol),
      lastPrice: parseFloat(t.lastPrice),
      priceChange: parseFloat(t.priceChange),
      priceChangePercent: parseFloat(t.priceChangePercent),
      highPrice: parseFloat(t.highPrice),
      lowPrice: parseFloat(t.lowPrice),
      volume: parseFloat(t.volume),
      quoteVolume: parseFloat(t.quoteVolume),
    }));
    results.push(...items);
  }

  await Promise.all([
    batch(spot, SPOT_BASE, (s) => s),
    // Futures endpoint also doesn't return ".P" — we add it back so callers
    // that subscribed using "BTCUSDT.P" can match the returned symbol.
    batch(perp, FUTURES_BASE, (s) => `${s}.P`),
  ]);

  return results;
}

let cachedSpot: SymbolInfo[] | null = null;
let cachedPerp: SymbolInfo[] | null = null;

export async function fetchExchangeSymbols(): Promise<SymbolInfo[]> {
  if (cachedSpot && cachedPerp) return [...cachedSpot, ...cachedPerp];
  const [spotRes, perpRes] = await Promise.all([
    fetch(`${SPOT_BASE}/exchangeInfo`, { cache: "force-cache" }),
    fetch(`${FUTURES_BASE}/exchangeInfo`, { cache: "force-cache" }),
  ]);
  if (!spotRes.ok) throw new Error(`exchangeInfo spot ${spotRes.status}`);
  if (!perpRes.ok) throw new Error(`exchangeInfo perp ${perpRes.status}`);
  const spotData = await spotRes.json();
  const perpData = await perpRes.json();
  cachedSpot = spotData.symbols
    .filter(
      (s: { status: string; quoteAsset: string }) =>
        s.status === "TRADING" && s.quoteAsset === "USDT",
    )
    .map(
      (s: { symbol: string; baseAsset: string; quoteAsset: string; status: string }) => ({
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        status: s.status,
      }),
    );
  cachedPerp = perpData.symbols
    .filter(
      (s: { status: string; quoteAsset: string; contractType?: string }) =>
        s.status === "TRADING" &&
        s.quoteAsset === "USDT" &&
        (s.contractType === "PERPETUAL" || !s.contractType),
    )
    .map(
      (s: { symbol: string; baseAsset: string; quoteAsset: string; status: string }) => ({
        symbol: `${s.symbol}.P`,
        baseAsset: s.baseAsset,
        quoteAsset: `${s.quoteAsset} (Perp)`,
        status: s.status,
      }),
    );
  return [...(cachedSpot ?? []), ...(cachedPerp ?? [])];
}
