/**
 * Catalog of non-Binance symbols and their data source.
 *
 * Each entry maps a user-facing ticker (what the user types / sees on the chart)
 * to the provider-specific symbol used to fetch data.
 *
 * Source kinds:
 *  - "yahoo"     → US stocks, futures, indices via Yahoo Finance v8 chart endpoint
 *  - "fred"      → FRED macro series (M2, balance sheet, etc) via fredgraph.csv
 *  - "coingecko" → Crypto market dominance, calculated from market cap snapshots
 *  - "binance"   → Default fallback for anything else (handled outside this catalog)
 */

export type SourceKind = "binance" | "yahoo" | "fred" | "coingecko";

export type Category = "Crypto" | "Stock" | "Index" | "Futures" | "Macro" | "Dominance";

export interface SymbolEntry {
  /** Ticker as the user types it (uppercase). */
  ticker: string;
  /** Provider-specific symbol used in the actual API call. */
  providerSymbol: string;
  /** Data source. */
  source: SourceKind;
  /** Display category (used by the picker). */
  category: Category;
  /** Human-readable description. */
  description: string;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Stocks (Yahoo Finance)                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

const STOCKS: SymbolEntry[] = [
  { ticker: "AAPL",  providerSymbol: "AAPL",  source: "yahoo", category: "Stock", description: "Apple Inc." },
  { ticker: "MSFT",  providerSymbol: "MSFT",  source: "yahoo", category: "Stock", description: "Microsoft Corp." },
  { ticker: "GOOGL", providerSymbol: "GOOGL", source: "yahoo", category: "Stock", description: "Alphabet Inc. Class A" },
  { ticker: "GOOG",  providerSymbol: "GOOG",  source: "yahoo", category: "Stock", description: "Alphabet Inc. Class C" },
  { ticker: "AMZN",  providerSymbol: "AMZN",  source: "yahoo", category: "Stock", description: "Amazon.com Inc." },
  { ticker: "META",  providerSymbol: "META",  source: "yahoo", category: "Stock", description: "Meta Platforms Inc." },
  { ticker: "TSLA",  providerSymbol: "TSLA",  source: "yahoo", category: "Stock", description: "Tesla Inc." },
  { ticker: "NVDA",  providerSymbol: "NVDA",  source: "yahoo", category: "Stock", description: "NVIDIA Corp." },
  { ticker: "AMD",   providerSymbol: "AMD",   source: "yahoo", category: "Stock", description: "Advanced Micro Devices" },
  { ticker: "NFLX",  providerSymbol: "NFLX",  source: "yahoo", category: "Stock", description: "Netflix Inc." },
  { ticker: "COIN",  providerSymbol: "COIN",  source: "yahoo", category: "Stock", description: "Coinbase Global Inc." },
  { ticker: "MSTR",  providerSymbol: "MSTR",  source: "yahoo", category: "Stock", description: "MicroStrategy Inc." },
  { ticker: "PYPL",  providerSymbol: "PYPL",  source: "yahoo", category: "Stock", description: "PayPal Holdings Inc." },
  { ticker: "JPM",   providerSymbol: "JPM",   source: "yahoo", category: "Stock", description: "JPMorgan Chase & Co." },
  { ticker: "BAC",   providerSymbol: "BAC",   source: "yahoo", category: "Stock", description: "Bank of America Corp." },
  { ticker: "GS",    providerSymbol: "GS",    source: "yahoo", category: "Stock", description: "Goldman Sachs Group" },
];

/* ────────────────────────────────────────────────────────────────────────── */
/* ETFs / Indices (Yahoo Finance — index symbols are prefixed with ^)         */
/* ────────────────────────────────────────────────────────────────────────── */

const INDICES: SymbolEntry[] = [
  { ticker: "SPY",  providerSymbol: "SPY",   source: "yahoo", category: "Index", description: "SPDR S&P 500 ETF" },
  { ticker: "QQQ",  providerSymbol: "QQQ",   source: "yahoo", category: "Index", description: "Invesco QQQ Trust (Nasdaq-100)" },
  { ticker: "IWM",  providerSymbol: "IWM",   source: "yahoo", category: "Index", description: "iShares Russell 2000 ETF" },
  { ticker: "DIA",  providerSymbol: "DIA",   source: "yahoo", category: "Index", description: "SPDR Dow Jones Industrial Average ETF" },
  { ticker: "SPX",  providerSymbol: "^GSPC", source: "yahoo", category: "Index", description: "S&P 500 Index" },
  { ticker: "NDX",  providerSymbol: "^NDX",  source: "yahoo", category: "Index", description: "Nasdaq-100 Index" },
  { ticker: "DJI",  providerSymbol: "^DJI",  source: "yahoo", category: "Index", description: "Dow Jones Industrial Average" },
  { ticker: "RUT",  providerSymbol: "^RUT",  source: "yahoo", category: "Index", description: "Russell 2000 Index" },
  { ticker: "VIX",  providerSymbol: "^VIX",  source: "yahoo", category: "Index", description: "CBOE Volatility Index" },
  { ticker: "DXY",  providerSymbol: "DX-Y.NYB", source: "yahoo", category: "Index", description: "US Dollar Index" },
];

/* ────────────────────────────────────────────────────────────────────────── */
/* Futures (Yahoo Finance — front-month contracts, TradingView "X1!" style)   */
/* ────────────────────────────────────────────────────────────────────────── */

const FUTURES: SymbolEntry[] = [
  { ticker: "CL1!", providerSymbol: "CL=F", source: "yahoo", category: "Futures", description: "Crude Oil WTI Front Month" },
  { ticker: "GC1!", providerSymbol: "GC=F", source: "yahoo", category: "Futures", description: "Gold Front Month" },
  { ticker: "SI1!", providerSymbol: "SI=F", source: "yahoo", category: "Futures", description: "Silver Front Month" },
  { ticker: "NG1!", providerSymbol: "NG=F", source: "yahoo", category: "Futures", description: "Natural Gas Front Month" },
  { ticker: "ES1!", providerSymbol: "ES=F", source: "yahoo", category: "Futures", description: "E-mini S&P 500 Front Month" },
  { ticker: "NQ1!", providerSymbol: "NQ=F", source: "yahoo", category: "Futures", description: "E-mini Nasdaq-100 Front Month" },
  { ticker: "YM1!", providerSymbol: "YM=F", source: "yahoo", category: "Futures", description: "E-mini Dow Front Month" },
  { ticker: "RTY1!",providerSymbol: "RTY=F",source: "yahoo", category: "Futures", description: "E-mini Russell 2000 Front Month" },
  { ticker: "ZN1!", providerSymbol: "ZN=F", source: "yahoo", category: "Futures", description: "10-Year T-Note Front Month" },
  { ticker: "ZB1!", providerSymbol: "ZB=F", source: "yahoo", category: "Futures", description: "30-Year T-Bond Front Month" },
];

/* ────────────────────────────────────────────────────────────────────────── */
/* Crypto market dominance (CoinGecko, computed from market cap snapshots)    */
/* ────────────────────────────────────────────────────────────────────────── */

const DOMINANCES: SymbolEntry[] = [
  { ticker: "BTC.D",  providerSymbol: "bitcoin",      source: "coingecko", category: "Dominance", description: "Bitcoin market dominance %" },
  { ticker: "ETH.D",  providerSymbol: "ethereum",     source: "coingecko", category: "Dominance", description: "Ethereum market dominance %" },
  { ticker: "USDT.D", providerSymbol: "tether",       source: "coingecko", category: "Dominance", description: "Tether market dominance %" },
  { ticker: "USDC.D", providerSymbol: "usd-coin",     source: "coingecko", category: "Dominance", description: "USD Coin market dominance %" },
  { ticker: "SOL.D",  providerSymbol: "solana",       source: "coingecko", category: "Dominance", description: "Solana market dominance %" },
  { ticker: "BNB.D",  providerSymbol: "binancecoin",  source: "coingecko", category: "Dominance", description: "BNB market dominance %" },
  { ticker: "TOTAL",  providerSymbol: "total",        source: "coingecko", category: "Dominance", description: "Total crypto market cap" },
  { ticker: "TOTAL2", providerSymbol: "total2",       source: "coingecko", category: "Dominance", description: "Total crypto market cap excluding BTC" },
  { ticker: "TOTAL3", providerSymbol: "total3",       source: "coingecko", category: "Dominance", description: "Total crypto market cap excluding BTC and ETH" },
];

/* ────────────────────────────────────────────────────────────────────────── */
/* FRED macro series (fredgraph.csv, no API key required)                     */
/* ────────────────────────────────────────────────────────────────────────── */

const MACRO: SymbolEntry[] = [
  { ticker: "USM2",     providerSymbol: "M2SL",     source: "fred", category: "Macro", description: "US M2 Money Supply (seasonally adjusted)" },
  { ticker: "USM1",     providerSymbol: "M1SL",     source: "fred", category: "Macro", description: "US M1 Money Supply (seasonally adjusted)" },
  { ticker: "WALCL",    providerSymbol: "WALCL",    source: "fred", category: "Macro", description: "Federal Reserve total assets (balance sheet)" },
  { ticker: "CIVPART",  providerSymbol: "CIVPART",  source: "fred", category: "Macro", description: "US Civilian Labor Force Participation Rate" },
  { ticker: "UNRATE",   providerSymbol: "UNRATE",   source: "fred", category: "Macro", description: "US Unemployment Rate" },
  { ticker: "CPIAUCSL", providerSymbol: "CPIAUCSL", source: "fred", category: "Macro", description: "US Consumer Price Index (urban, SA)" },
  { ticker: "GDP",      providerSymbol: "GDP",      source: "fred", category: "Macro", description: "US Gross Domestic Product" },
  { ticker: "DGS10",    providerSymbol: "DGS10",    source: "fred", category: "Macro", description: "10-Year Treasury Constant Maturity Rate" },
  { ticker: "DGS2",     providerSymbol: "DGS2",     source: "fred", category: "Macro", description: "2-Year Treasury Constant Maturity Rate" },
  { ticker: "T10Y2Y",   providerSymbol: "T10Y2Y",   source: "fred", category: "Macro", description: "10-Year minus 2-Year Treasury spread" },
  { ticker: "DFF",      providerSymbol: "DFF",      source: "fred", category: "Macro", description: "Federal Funds Effective Rate" },
  { ticker: "RRPONTSYD",providerSymbol: "RRPONTSYD",source: "fred", category: "Macro", description: "Overnight Reverse Repo (Fed RRP)" },
  // USBCOI maps to the OECD US Composite Leading Indicator (amplitude adjusted).
  // The true ISM PMI (35-65 scale) is no longer available free on FRED (NAPM /
  // NAPMPMI return 404 — discontinued for copyright). The legacy OECD BCI series
  // BSCICP03USM665S is frozen at 2024-01; USALOLITOAASTSAM is the current,
  // still-updated proxy on the same ~100 normalized scale.
  { ticker: "USBCOI",   providerSymbol: "USALOLITOAASTSAM", source: "fred", category: "Macro", description: "US Composite Leading Indicator (OECD, amplitude adjusted)" },
  { ticker: "USEPU",    providerSymbol: "USEPUINDXD",     source: "fred", category: "Macro", description: "US Economic Policy Uncertainty Index" },
];

/* ────────────────────────────────────────────────────────────────────────── */

export const CATALOG: SymbolEntry[] = [
  ...STOCKS,
  ...INDICES,
  ...FUTURES,
  ...DOMINANCES,
  ...MACRO,
];

const BY_TICKER = new Map<string, SymbolEntry>(
  CATALOG.map((e) => [e.ticker.toUpperCase(), e]),
);

/** Look up a non-Binance catalog entry by user-facing ticker. */
export function lookupCatalog(ticker: string): SymbolEntry | null {
  return BY_TICKER.get(ticker.toUpperCase()) ?? null;
}
