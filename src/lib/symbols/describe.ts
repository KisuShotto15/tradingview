import { lookupCatalog } from "./catalog";
import { stripExchangePrefix } from "./prefix";

/**
 * Longest-first so "BTCUSDT" matches USDT, not USD, and "ETHBTC" still works.
 * Mirrors the list `CoinIcon`'s `getBaseAsset` splits on.
 */
const QUOTES = ["USDT", "USDC", "BUSD", "TUSD", "FDUSD", "USD", "BTC", "ETH", "BNB", "EUR", "TRY"];

/** Common base assets whose full name is worth spelling out, as a venue list
 *  would. Anything missing simply shows its ticker, which is still correct. */
const NAMES: Record<string, string> = {
  BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", BNB: "BNB", XRP: "XRP",
  DOGE: "Dogecoin", ADA: "Cardano", AVAX: "Avalanche", LINK: "Chainlink",
  MATIC: "Polygon", DOT: "Polkadot", LTC: "Litecoin", TRX: "TRON",
  SHIB: "Shiba Inu", UNI: "Uniswap", ATOM: "Cosmos", XLM: "Stellar",
  NEAR: "NEAR Protocol", APT: "Aptos", ARB: "Arbitrum", OP: "Optimism",
  SUI: "Sui", INJ: "Injective", TIA: "Celestia", SEI: "Sei", FIL: "Filecoin",
  ETC: "Ethereum Classic", BCH: "Bitcoin Cash", HBAR: "Hedera", ICP: "Internet Computer",
  USDT: "TetherUS", USDC: "USD Coin",
};

/**
 * The long-form subtitle for a watchlist or search row — "Bitcoin / TetherUS
 * PERPETUAL" rather than just the venue name.
 *
 * A venue name alone ("BINANCE") is the same string on nearly every row, so it
 * carries no information while occupying the one line that could tell you what
 * the ticker actually is. This is what TradingView puts there, and the reason
 * its watchlist scans faster than a column of identical subtitles.
 *
 * Pure and dependency-light on purpose: it runs once per row on every render
 * of a list that can hold hundreds of symbols.
 */
export function describeSymbol(ticker: string): string {
  // A catalog entry (curated stocks/macro, or a Bybit perp from the dynamic
  // registry) already carries a human description; prefer it.
  const entry = lookupCatalog(ticker);
  if (entry?.description) return entry.description;

  const bare = stripExchangePrefix(ticker);
  const perp = bare.endsWith(".P");
  const sym = perp ? bare.slice(0, -2) : bare;

  for (const q of QUOTES) {
    if (sym.length > q.length && sym.endsWith(q)) {
      const base = sym.slice(0, -q.length);
      const left = NAMES[base] ?? base;
      const right = NAMES[q] ?? q;
      return `${left} / ${right}${perp ? " PERPETUAL" : ""}`;
    }
  }
  return NAMES[sym] ?? sym;
}
