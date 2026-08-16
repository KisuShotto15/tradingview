import { lookupCatalog, type SourceKind, type SymbolEntry } from "./catalog";
import { hasBybitPrefix, stripExchangePrefix } from "./prefix";
import { isSyntheticExpression } from "@/lib/binance/synthetic";

export type ResolvedSource =
  | { kind: "binance"; symbol: string }
  | { kind: "bybit"; providerSymbol: string; entry: SymbolEntry }
  | { kind: "synthetic"; expression: string }
  | { kind: "yahoo"; providerSymbol: string; entry: SymbolEntry }
  | { kind: "fred"; providerSymbol: string; entry: SymbolEntry }
  | { kind: "coingecko"; providerSymbol: string; entry: SymbolEntry };

/**
 * Decide which data provider to use for a given ticker.
 *
 * Order of resolution:
 *   1. Synthetic expressions (contain operators + at least one symbol token)
 *   2. Explicit catalog entry (stocks, indices, futures, dominances, FRED)
 *   3. Default fallback: Binance spot/perp
 */
export function resolveSource(rawSymbol: string): ResolvedSource {
  const s = rawSymbol.trim().toUpperCase();

  // Explicit `BYBIT:` prefix always routes to Bybit data (works even before the
  // dynamic catalog has loaded, e.g. right after a reload).
  if (hasBybitPrefix(s)) {
    const providerSymbol = stripExchangePrefix(s).replace(/\.P$/, "");
    const entry: SymbolEntry = {
      ticker: s,
      providerSymbol,
      source: "bybit",
      category: "Crypto",
      description: `${providerSymbol} Perpetual · Bybit`,
    };
    return { kind: "bybit", providerSymbol, entry };
  }

  if (isSyntheticExpression(s)) return { kind: "synthetic", expression: s };

  const entry = lookupCatalog(s);
  if (entry) {
    switch (entry.source) {
      case "yahoo":
        return { kind: "yahoo", providerSymbol: entry.providerSymbol, entry };
      case "fred":
        return { kind: "fred", providerSymbol: entry.providerSymbol, entry };
      case "coingecko":
        return { kind: "coingecko", providerSymbol: entry.providerSymbol, entry };
      case "bybit":
        return { kind: "bybit", providerSymbol: entry.providerSymbol, entry };
      case "binance":
        return { kind: "binance", symbol: entry.providerSymbol };
    }
  }
  return { kind: "binance", symbol: s };
}

/** Convenience: return just the source kind label. */
export function sourceKindOf(rawSymbol: string): SourceKind | "synthetic" {
  return resolveSource(rawSymbol).kind;
}
