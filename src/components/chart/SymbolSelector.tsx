"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, ChevronDown, Sparkles, Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchExchangeSymbols } from "@/lib/binance/rest";
import {
  isSyntheticExpression,
  extractSymbols,
} from "@/lib/binance/synthetic";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";
import type { SymbolInfo } from "@/lib/binance/types";
import { CATALOG } from "@/lib/symbols/catalog";

/** Catalog entries presented as SymbolInfo so they slot into the existing list UI. */
const CATALOG_AS_SYMBOLS: (SymbolInfo & { category: string; description: string })[] =
  CATALOG.map((e) => ({
    symbol: e.ticker,
    baseAsset: e.ticker,
    quoteAsset: e.category,
    status: "TRADING",
    category: e.category,
    description: e.description,
  }));

export function SymbolSelector({ noTrigger = false }: { noTrigger?: boolean } = {}) {
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const open = useChartStore((s) => s.symbolDialogOpen);
  const setOpen = useChartStore((s) => s.setSymbolDialogOpen);
  const symbolDialogInitialQuery = useChartStore((s) => s.symbolDialogInitialQuery);
  const setSymbolDialogInitialQuery = useChartStore((s) => s.setSymbolDialogInitialQuery);
  const activeWatchlistId = useChartStore((s) => s.activeWatchlistId);
  const watchlists = useChartStore((s) => s.watchlists);
  const addSymbolToWatchlist = useChartStore((s) => s.addSymbolToWatchlist);
  const activeWatchlistSymbols = useMemo(() => {
    const w = watchlists.find((x) => x.id === activeWatchlistId);
    return new Set(
      (w?.items ?? [])
        .filter((i) => i.type === "symbol")
        .map((i) => i.value),
    );
  }, [watchlists, activeWatchlistId]);

  const [query, setQuery] = useState("");
  const [allSymbols, setAllSymbols] = useState<SymbolInfo[]>([]);

  useEffect(() => {
    if (open && symbolDialogInitialQuery) {
      setQuery(symbolDialogInitialQuery);
      setSymbolDialogInitialQuery("");
    }
  }, [open, symbolDialogInitialQuery, setSymbolDialogInitialQuery]);

  useEffect(() => {
    if (open && allSymbols.length === 0) {
      fetchExchangeSymbols()
        .then((binance) => setAllSymbols([...CATALOG_AS_SYMBOLS, ...binance]))
        .catch((err) => {
          console.error(err);
          // Even if Binance fails, the catalog symbols should still be selectable.
          setAllSymbols([...CATALOG_AS_SYMBOLS]);
        });
    }
  }, [open, allSymbols.length]);

  const trimmed = query.trim().toUpperCase();
  const isExpression = isSyntheticExpression(trimmed);
  const expressionValid = useMemo(() => {
    if (!isExpression) return false;
    const tokens = extractSymbols(trimmed);
    if (tokens.length === 0) return false;
    const known = new Set(allSymbols.map((s) => s.symbol));
    return tokens.every((t) => known.has(t));
  }, [isExpression, trimmed, allSymbols]);

  const filtered = useMemo(() => {
    if (!trimmed) return allSymbols.slice(0, 100);
    if (isExpression) return [];
    return allSymbols
      .filter(
        (s) =>
          s.symbol.includes(trimmed) ||
          s.baseAsset.includes(trimmed) ||
          s.quoteAsset.includes(trimmed),
      )
      .slice(0, 100);
  }, [trimmed, allSymbols, isExpression]);

  function selectExpression() {
    if (!isExpression) return;
    setSymbol(trimmed);
    setOpen(false);
    setQuery("");
  }

  /** Pick the most relevant match for the current query — used by Enter. */
  function bestMatch(): string | null {
    if (!trimmed) return null;
    if (isExpression && expressionValid) return trimmed;
    // 1) Exact ticker match wins
    const exact = filtered.find((s) => s.symbol.toUpperCase() === trimmed);
    if (exact) return exact.symbol;
    // 2) baseAsset exact match (e.g. "BTC" → "BTCUSDT" first hit)
    const baseExact = filtered.find((s) => s.baseAsset.toUpperCase() === trimmed);
    if (baseExact) return baseExact.symbol;
    // 3) First filtered result
    return filtered[0]?.symbol ?? null;
  }

  function submitBestMatch() {
    const m = bestMatch();
    if (!m) return;
    setSymbol(m);
    setOpen(false);
    setQuery("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!noTrigger && (
        <DialogTrigger className="group flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold hover:bg-tv-panel-hover">
          <Search className="h-3.5 w-3.5 text-tv-text-muted group-hover:text-tv-text" />
          <span className="tabular-nums">{symbol}</span>
          <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted" />
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">Search symbol</DialogTitle>
        </DialogHeader>
        <div className="border-b border-tv-border p-3">
          <Input
            autoFocus
            placeholder="BTC, ETH, or expression: BTCUSDT/ETHUSDT…"
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (isExpression && expressionValid) selectExpression();
              else submitBestMatch();
            }}
            className="bg-tv-bg"
          />
          <p className="mt-1.5 text-[10px] text-tv-text-muted">
            Combine symbols with{" "}
            <code className="rounded bg-tv-bg px-1">+ - * /</code> and{" "}
            <code className="rounded bg-tv-bg px-1">( )</code>. Example:{" "}
            <code className="rounded bg-tv-bg px-1">BTCUSDT+ETHUSDT</code>.
          </p>
        </div>
        <ScrollArea className="h-[400px]">
          <div className="flex flex-col">
            {isExpression && (
              <button
                onClick={selectExpression}
                disabled={!expressionValid}
                className={cn(
                  "flex items-center justify-between border-b border-tv-border px-4 py-3 text-left text-xs",
                  expressionValid
                    ? "hover:bg-tv-panel-hover"
                    : "cursor-not-allowed opacity-50",
                )}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-tv-blue" />
                  <span className="font-mono font-semibold text-tv-text">
                    {trimmed}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                  {expressionValid ? "Use expression" : "Unknown symbol"}
                </span>
              </button>
            )}
            {filtered.length === 0 && !isExpression && (
              <div className="p-4 text-center text-xs text-tv-text-muted">
                No results
              </div>
            )}
            {filtered.map((s) => {
              const inList = activeWatchlistSymbols.has(s.symbol);
              return (
                <div
                  key={s.symbol}
                  className={cn(
                    "group flex items-center justify-between gap-2 border-b border-tv-border px-4 py-2 text-xs hover:bg-tv-panel-hover",
                    s.symbol === symbol && "bg-tv-panel-hover",
                  )}
                >
                  <button
                    onClick={() => {
                      setSymbol(s.symbol);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex flex-1 items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-tv-text">
                        {s.baseAsset}
                      </span>
                      <span className="text-tv-text-muted">/ {s.quoteAsset}</span>
                    </div>
                    <span className="text-tv-text-muted">{s.symbol}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!inList) {
                        addSymbolToWatchlist(activeWatchlistId, s.symbol);
                      }
                    }}
                    disabled={inList}
                    title={
                      inList ? "Already in active watchlist" : "Add to watchlist"
                    }
                    className={cn(
                      "rounded p-1 transition-colors",
                      inList
                        ? "text-tv-yellow"
                        : "text-tv-text-dim hover:bg-tv-bg hover:text-tv-yellow",
                    )}
                  >
                    <Star
                      className="h-3.5 w-3.5"
                      fill={inList ? "currentColor" : "none"}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
