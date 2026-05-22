"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { useMobileStore } from "@/lib/store/mobile-store";
import { fetchTickers24h } from "@/lib/binance/rest";
import type { Ticker24h } from "@/lib/binance/types";
import { formatPrice, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Mobile watchlist screen — vertical list of pinned symbols with live ticker.
 *
 * Tapping a row sets the active symbol in the chart store and jumps to the
 * Chart tab. Long-press will (later) open the row action sheet to remove,
 * reorder, or move to a different watchlist.
 */
export function WatchlistScreen() {
  const watchlists = useChartStore((s) => s.watchlists);
  const activeId = useChartStore((s) => s.activeWatchlistId);
  const setActiveWatchlist = useChartStore((s) => s.setActiveWatchlist);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const setTab = useMobileStore((s) => s.setTab);
  const openSheet = useMobileStore((s) => s.openSheet);

  const active = watchlists.find((w) => w.id === activeId) ?? watchlists[0];
  const symbols = useMemo(
    () => (active?.items ?? []).filter((i) => i.type === "symbol").map((i) => i.value),
    [active],
  );

  const [tickers, setTickers] = useState<Map<string, Ticker24h>>(new Map());

  useEffect(() => {
    if (symbols.length === 0) return;
    let cancelled = false;
    const load = () => {
      fetchTickers24h(symbols)
        .then((arr) => {
          if (cancelled) return;
          const m = new Map<string, Ticker24h>();
          for (const t of arr) m.set(t.symbol, t);
          setTickers(m);
        })
        .catch(() => {});
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
        {symbols.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-tv-text-muted">
            Empty list. Tap the + button to add symbols.
          </div>
        ) : (
          <ul>
            {symbols.map((s) => {
              const t = tickers.get(s);
              const pct = t?.priceChangePercent ?? 0;
              const up = pct >= 0;
              return (
                <li key={s}>
                  <button
                    onClick={() => open(s)}
                    className="flex w-full items-center justify-between border-b border-tv-border/60 px-3 py-2.5 text-left active:bg-tv-panel-hover"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold">{s}</span>
                      <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">Binance</span>
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
