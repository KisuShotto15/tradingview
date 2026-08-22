"use client";

import { CoinIcon } from "@/components/watchlist/CoinIcon";
import { ExchangeLogo } from "@/components/symbols/ExchangeLogo";
import type { Category, SourceKind } from "@/lib/symbols/catalog";

/** Sources/categories whose tickers exist in the crypto icon CDN. */
function isCoin(source: SourceKind | "synthetic", category?: Category): boolean {
  if (source === "binance" || source === "bybit") return true;
  return category === "Crypto" || category === "Dominance";
}

interface Props {
  /** Ticker as charted, decorations included (`BYBIT:SOLUSDT.P`). */
  symbol: string;
  source: SourceKind | "synthetic";
  category?: Category;
  size?: number;
}

/**
 * A symbol's asset icon with its venue's mark pinned to the corner — the
 * avatar TradingView puts in front of every search result.
 *
 * The dominance tickers (`BTC.D`) are stripped down to the coin before the
 * icon lookup; `CoinIcon` only knows to drop the `.P` perpetual suffix, and
 * `btc.d` isn't a slug the icon set has.
 */
export function SymbolIcon({ symbol, source, category, size = 22 }: Props) {
  const coin = isCoin(source, category);
  const badge = Math.max(9, Math.round(size * 0.5));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <CoinIcon symbol={symbol.replace(/\.D$/, "")} size={size} remote={coin} />
      <span className="absolute -bottom-0.5 -right-0.5">
        <ExchangeLogo source={source} size={badge} />
      </span>
    </div>
  );
}
