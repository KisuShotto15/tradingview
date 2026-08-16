"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { useMobileStore } from "@/lib/store/mobile-store";
import { useTradingStore } from "@/lib/store/trading-store";
import { fetchTickers24h, cleanSym } from "@/lib/binance/rest";
import { fetchBybitTickers24h } from "@/lib/bybit/public";
import { resolveSource } from "@/lib/symbols/source";
import { stripExchangePrefix } from "@/lib/symbols/prefix";
import { getBaseAsset } from "@/components/watchlist/CoinIcon";
import type { Ticker24h } from "@/lib/binance/types";
import type { Position } from "@/lib/binance/trading-types";
import { formatPrice, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Mobile watchlist screen — vertical list of pinned symbols with live ticker.
 * Renders both symbol rows and label/separator headers.
 */
export function WatchlistScreen() {
  const watchlists = useChartStore((s) => s.watchlists);
  const activeId = useChartStore((s) => s.activeWatchlistId);
  const setActiveWatchlist = useChartStore((s) => s.setActiveWatchlist);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const setTab = useMobileStore((s) => s.setTab);
  const openSheet = useMobileStore((s) => s.openSheet);

  const allPositions = useTradingStore((s) => s.allPositions);
  const tradingExchange = useTradingStore((s) => s.exchange);

  const active = watchlists.find((w) => w.id === activeId) ?? watchlists[0];
  const items = active?.items ?? [];

  const symbols = useMemo(
    () => items.filter((i) => i.type === "symbol").map((i) => i.value),
    [items],
  );

  const positionsBySymbol = useMemo(() => {
    const map = new Map<string, Position>();
    for (const p of allPositions) {
      if (p.positionAmt !== 0) map.set(p.symbol, p);
    }
    return map;
  }, [allPositions]);

  const [tickers, setTickers] = useState<Map<string, Ticker24h>>(new Map());

  useEffect(() => {
    if (symbols.length === 0) return;
    let cancelled = false;
    const bybitSyms = symbols.filter((s) => resolveSource(s).kind === "bybit");
    const binanceSyms = symbols.filter((s) => resolveSource(s).kind !== "bybit");
    const load = () => {
      Promise.all([
        binanceSyms.length ? fetchTickers24h(binanceSyms).catch(() => []) : Promise.resolve([]),
        bybitSyms.length ? fetchBybitTickers24h(bybitSyms).catch(() => []) : Promise.resolve([]),
      ]).then(([binance, bybit]) => {
        if (cancelled) return;
        const m = new Map<string, Ticker24h>();
        for (const t of binance) m.set(t.symbol, t);
        for (const t of bybit) {
          m.set(t.symbol, {
            symbol: t.symbol,
            lastPrice: t.lastPrice,
            priceChange: 0,
            priceChangePercent: t.priceChangePercent,
            highPrice: 0,
            lowPrice: 0,
            volume: 0,
            quoteVolume: 0,
          });
        }
        setTickers(m);
      });
    };
    load();
    const id = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbols]);

  function open(symbol: string) {
    setSymbol(symbol);
    setTab("chart");
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header — list switcher */}
      <header className="flex shrink-0 items-center gap-2 border-b border-tv-border px-3 py-2">
        <select
          value={activeId}
          onChange={(e) => setActiveWatchlist(e.target.value)}
          className="flex-1 rounded border border-tv-border bg-tv-panel px-2 py-1.5 text-xs"
        >
          {watchlists.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <button
          onClick={() => openSheet("symbolSearch")}
          className="rounded p-1.5 text-tv-text-muted hover:bg-tv-panel-hover"
          aria-label="Search symbols"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          onClick={() => openSheet("symbolSearch")}
          className="rounded p-1.5 text-tv-text-muted hover:bg-tv-panel-hover"
          aria-label="Add symbol"
        >
          <Plus className="h-4 w-4" />
        </button>
      </header>

      {/* Rows */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-tv-text-muted">
            Empty list. Tap the + button to add symbols.
          </div>
        ) : (
          <ul>
            {items.map((item) => {
              if (item.type === "label") {
                return (
                  <li
                    key={item.id}
                    className="border-b border-tv-border/40 bg-tv-bg/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted"
                  >
                    {item.value}
                  </li>
                );
              }

              const s = item.value;
              const displaySymbol = stripExchangePrefix(s);
              // Only badge when this row's market matches the connected
              // trading exchange (see Watchlist.tsx for why).
              const rowMatchesExchange = resolveSource(s).kind === tradingExchange;
              const openPosition = rowMatchesExchange ? positionsBySymbol.get(cleanSym(s)) : undefined;
              const posSide = openPosition?.side === "LONG" || openPosition?.side === "SHORT"
                ? openPosition.side
                : null;
              const t = tickers.get(s);
              const pct = t?.priceChangePercent ?? 0;
              const up = pct >= 0;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => open(s)}
                    className="flex w-full items-center justify-between border-b border-tv-border/60 px-3 py-2.5 text-left active:bg-tv-panel-hover"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        {posSide ? getBaseAsset(displaySymbol) : displaySymbol}
                        {posSide && <PositionSideBadge side={posSide} />}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                        {resolveSource(s).kind === "bybit" ? "Bybit" : "Binance"}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-mono text-sm tabular-nums">
                        {t ? formatPrice(t.lastPrice) : "—"}
                      </span>
                      <span className={cn(
                        "rounded px-1.5 py-px font-mono text-[10px] tabular-nums",
                        up ? "bg-tv-green/15 text-tv-green" : "bg-tv-red/15 text-tv-red",
                      )}>
                        {t ? formatPct(pct) : "—"}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Hollow circle badge marking an open Long/Short position on a watchlist row. */
function PositionSideBadge({ side }: { side: "LONG" | "SHORT" }) {
  const isLong = side === "LONG";
  const color = isLong ? "#2962ff" : "#ef5350";
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold"
      style={{ borderColor: color, color }}
    >
      {isLong ? "L" : "S"}
    </span>
  );
}
