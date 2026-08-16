"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Flag,
  GripVertical,
  ListPlus,
  Pencil,
  Plus,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { fetchTickers24h, cleanSym } from "@/lib/binance/rest";
import { fetchBybitTickers24h } from "@/lib/bybit/public";
import { sortWatchlistItems, cycleSort, type WatchSort } from "@/lib/watchlist/sort";
import { getBinanceWS } from "@/lib/binance/ws";
import { getBybitWS } from "@/lib/bybit/ws";
import { resolveSource } from "@/lib/symbols/source";
import { stripExchangePrefix } from "@/lib/symbols/prefix";
import { useChartStore } from "@/lib/store/chart-store";
import { useTradingStore } from "@/lib/store/trading-store";
import type { Position } from "@/lib/binance/trading-types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatPrice, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CoinIcon, getBaseAsset } from "./CoinIcon";

interface Row {
  symbol: string;
  price: number;
  pct: number;
}

export function Watchlist() {
  const watchlists = useChartStore((s) => s.watchlists);
  const activeWatchlistId = useChartStore((s) => s.activeWatchlistId);
  const setActiveWatchlist = useChartStore((s) => s.setActiveWatchlist);
  const createWatchlist = useChartStore((s) => s.createWatchlist);
  const renameWatchlist = useChartStore((s) => s.renameWatchlist);
  const deleteWatchlist = useChartStore((s) => s.deleteWatchlist);
  const addLabelToWatchlist = useChartStore((s) => s.addLabelToWatchlist);
  const removeWatchlistItem = useChartStore((s) => s.removeWatchlistItem);
  const setWatchlistItemFlag = useChartStore((s) => s.setWatchlistItemFlag);
  const moveWatchlistItem = useChartStore((s) => s.moveWatchlistItem);
  const reorderWatchlistItems = useChartStore((s) => s.reorderWatchlistItems);
  const renameWatchlistItem = useChartStore((s) => s.renameWatchlistItem);
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const openSymbolDialog = useChartStore((s) => s.setSymbolDialogOpen);
  const allPositions = useTradingStore((s) => s.allPositions);
  const tradingExchange = useTradingStore((s) => s.exchange);

  const active = watchlists.find((w) => w.id === activeWatchlistId) ?? watchlists[0];
  const items = active?.items ?? [];
  const symbols = useMemo(
    () => items.filter((i) => i.type === "symbol").map((i) => i.value),
    [items],
  );

  // Open positions keyed by bare exchange symbol (e.g. "SOLUSDT"), so a
  // watchlist row can be matched regardless of its BYBIT:/​.P decoration.
  const positionsBySymbol = useMemo(() => {
    const map = new Map<string, Position>();
    for (const p of allPositions) {
      if (p.positionAmt !== 0) map.set(p.symbol, p);
    }
    return map;
  }, [allPositions]);

  const [rows, setRows] = useState<Record<string, Row>>({});
  const [flash, setFlash] = useState<Record<string, "up" | "down" | null>>({});
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    itemId: string | null;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [flagPickerId, setFlagPickerId] = useState<string | null>(null);
  const [sort, setSort] = useState<WatchSort>({ key: "manual", dir: "desc" });

  useEffect(() => {
    if (!flagPickerId) return;
    function close() { setFlagPickerId(null); }
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [flagPickerId]);

  // Drag & drop state
  const draggedId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Collapsed label sections
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (symbols.length === 0) {
      setRows({});
      return;
    }
    let cancelled = false;

    // Split by data source: Bybit-exclusive perps stream from Bybit, everything
    // else (shared perps, spot, stocks) from Binance.
    const bybitSyms = symbols.filter((s) => resolveSource(s).kind === "bybit");
    const binanceSyms = symbols.filter((s) => resolveSource(s).kind !== "bybit");

    function seed(tickers: { symbol: string; lastPrice: number; priceChangePercent: number }[]) {
      if (cancelled) return;
      setRows((prev) => {
        const next = { ...prev };
        tickers.forEach((t) => {
          next[t.symbol] = { symbol: t.symbol, price: t.lastPrice, pct: t.priceChangePercent };
        });
        return next;
      });
    }
    if (binanceSyms.length > 0) fetchTickers24h(binanceSyms).then(seed).catch(console.error);
    if (bybitSyms.length > 0) fetchBybitTickers24h(bybitSyms).then(seed).catch(console.error);

    function applyTick(tick: { symbol: string; close: number; pct: number }) {
      setRows((prev) => {
        const prevRow = prev[tick.symbol];
        if (prevRow) {
          if (tick.close > prevRow.price) {
            setFlash((f) => ({ ...f, [tick.symbol]: "up" }));
            setTimeout(() => setFlash((f) => ({ ...f, [tick.symbol]: null })), 300);
          } else if (tick.close < prevRow.price) {
            setFlash((f) => ({ ...f, [tick.symbol]: "down" }));
            setTimeout(() => setFlash((f) => ({ ...f, [tick.symbol]: null })), 300);
          }
        }
        return { ...prev, [tick.symbol]: { symbol: tick.symbol, price: tick.close, pct: tick.pct } };
      });
    }

    const unsubs: (() => void)[] = [];
    if (binanceSyms.length > 0) unsubs.push(getBinanceWS().subscribeMiniTickers(binanceSyms, applyTick));
    if (bybitSyms.length > 0) unsubs.push(getBybitWS().subscribeMiniTickers(bybitSyms, applyTick));

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [symbols.join(",")]);

  useEffect(() => {
    if (!contextMenu) return;
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-watchlist-context]")) {
        setContextMenu(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [contextMenu]);

  function addLabelHere(beforeId?: string) {
    if (!active) return;
    const text = window.prompt("Section label:");
    if (text && text.trim()) {
      addLabelToWatchlist(active.id, text.trim(), beforeId);
    }
    setContextMenu(null);
  }

  function startRename(itemId: string, current: string) {
    setRenamingId(itemId);
    setRenameDraft(current);
    setContextMenu(null);
  }

  function commitRename() {
    if (renamingId && active) {
      const v = renameDraft.trim();
      if (v) renameWatchlistItem(active.id, renamingId, v);
    }
    setRenamingId(null);
  }

  function createNewList() {
    const name = window.prompt("New watchlist name:");
    if (name && name.trim()) {
      createWatchlist(name.trim());
    }
  }

  function renameList() {
    if (!active) return;
    const name = window.prompt("Watchlist name:", active.name);
    if (name && name.trim()) {
      renameWatchlist(active.id, name.trim());
    }
  }

  function deleteList() {
    if (!active) return;
    if (watchlists.length <= 1) {
      window.alert("You need at least one watchlist.");
      return;
    }
    if (window.confirm(`Delete watchlist "${active.name}"?`)) {
      deleteWatchlist(active.id);
    }
  }

  function openContextMenu(e: React.MouseEvent, itemId: string | null) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, itemId });
  }

  function toggleCollapse(labelId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) next.delete(labelId);
      else next.add(labelId);
      return next;
    });
  }

  // Build visible items respecting collapsed sections
  const visibleItems = useMemo(() => {
    let hidingUnder: string | null = null;
    return items.filter((item) => {
      if (item.type === "label") {
        hidingUnder = collapsed.has(item.id) ? item.id : null;
        return true;
      }
      return hidingUnder === null;
    });
  }, [items, collapsed]);

  // Apply active sort (manual = unchanged; price/change = flat sorted symbols).
  const displayItems = useMemo(
    () => sortWatchlistItems(visibleItems, rows, sort),
    [visibleItems, rows, sort],
  );
  const isSorted = sort.key !== "manual";

  // Drag handlers
  function handleDragStart(id: string) {
    draggedId.current = id;
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (draggedId.current !== id) setDragOverId(id);
  }

  function handleDrop(targetId: string) {
    if (!active || !draggedId.current || draggedId.current === targetId) {
      draggedId.current = null;
      setDragOverId(null);
      return;
    }
    reorderWatchlistItems(active.id, draggedId.current, targetId);
    draggedId.current = null;
    setDragOverId(null);
  }

  function handleDragEnd() {
    draggedId.current = null;
    setDragOverId(null);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-1 border-b border-tv-border px-2 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex min-w-0 flex-1 items-center gap-1 rounded px-2 py-1 text-xs font-semibold uppercase tracking-wider text-tv-text hover:bg-tv-panel-hover">
            <span className="truncate">{active?.name ?? "Watchlist"}</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-tv-text-muted" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-48 bg-tv-panel">
            {watchlists.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onClick={() => setActiveWatchlist(w.id)}
                className={cn(
                  "text-xs",
                  w.id === activeWatchlistId && "bg-tv-blue/15 text-tv-blue",
                )}
              >
                {w.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={createNewList} className="text-xs">
              <ListPlus className="h-3.5 w-3.5" />
              <span>New watchlist…</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={renameList} className="text-xs">
              <Pencil className="h-3.5 w-3.5" />
              <span>Rename current…</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={deleteList} className="text-xs text-tv-red">
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete current</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          onClick={() => openSymbolDialog(true)}
          className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          title="Add symbol"
          aria-label="Add symbol"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-tv-border px-3 py-1.5 text-[10px] uppercase tracking-wider text-tv-text-dim">
        <span>Symbol</span>
        <SortHeader
          label="Price"
          active={sort.key === "price"}
          dir={sort.dir}
          onClick={() => setSort((s) => cycleSort(s, "price"))}
        />
        <SortHeader
          label="24h"
          active={sort.key === "change"}
          dir={sort.dir}
          onClick={() => setSort((s) => cycleSort(s, "change"))}
        />
      </div>
      <ScrollArea className="flex-1">
        <div
          className="flex flex-col"
          onContextMenu={(e) => openContextMenu(e, null)}
        >
          {displayItems.map((item) => {
            const isDragTarget = dragOverId === item.id;

            if (item.type === "label") {
              const isCollapsed = collapsed.has(item.id);
              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(item.id)}
                  onDragOver={(e) => handleDragOver(e, item.id)}
                  onDrop={() => handleDrop(item.id)}
                  onDragEnd={handleDragEnd}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    openContextMenu(e, item.id);
                  }}
                  onDoubleClick={() => startRename(item.id, item.value)}
                  className={cn(
                    "group flex cursor-grab items-center gap-1 border-y border-tv-border bg-tv-bg/50 px-1 py-1 active:cursor-grabbing",
                    isDragTarget && "border-t-2 border-t-tv-blue",
                  )}
                >
                  <GripVertical className="h-3 w-3 shrink-0 text-tv-text-dim opacity-0 transition-opacity group-hover:opacity-100" />
                  <button
                    onClick={() => toggleCollapse(item.id)}
                    className="shrink-0 text-tv-text-dim hover:text-tv-text"
                    aria-label={isCollapsed ? "Expand section" : "Collapse section"}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                  {renamingId === item.id ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="flex-1 bg-transparent text-[10px] font-semibold uppercase tracking-wider text-tv-text outline-none"
                    />
                  ) : (
                    <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
                      {item.value}
                    </span>
                  )}
                </div>
              );
            }

            const s = item.value;
            // Always display the plain ticker (BYBIT:BTCUSDT.P -> BTCUSDT.P),
            // regardless of which exchange it actually resolves to.
            const displaySymbol = stripExchangePrefix(s);
            // Only badge this row when it belongs to the connected trading
            // exchange's market — a bare ticker can match a position by symbol
            // alone even though it's actually a different exchange's chart
            // (e.g. plain "SOLUSDT.P" vs "BYBIT:SOLUSDT.P").
            const rowMatchesExchange = resolveSource(s).kind === tradingExchange;
            const openPosition = rowMatchesExchange ? positionsBySymbol.get(cleanSym(s)) : undefined;
            const posSide = openPosition?.side === "LONG" || openPosition?.side === "SHORT"
              ? openPosition.side
              : null;
            const row = rows[s];
            const isActive = s === symbol;
            const f = flash[s];
            return (
              <div
                key={item.id}
                draggable={!isSorted}
                onDragStart={() => handleDragStart(item.id)}
                onDragOver={(e) => handleDragOver(e, item.id)}
                onDrop={() => handleDrop(item.id)}
                onDragEnd={handleDragEnd}
                onClick={() => setSymbol(s)}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  openContextMenu(e, item.id);
                }}
                className={cn(
                  "group relative grid cursor-pointer grid-cols-[4px_auto_1fr_auto_auto] items-center gap-1 py-1.5 pr-1 text-xs transition-colors",
                  "hover:bg-tv-panel-hover",
                  isActive && "bg-tv-panel-hover",
                  isDragTarget && "border-t-2 border-t-tv-blue",
                )}
              >
                {/* Flag color strip */}
                <div
                  className="self-stretch rounded-sm"
                  style={{ backgroundColor: item.type === "symbol" ? (item.flagColor ?? "transparent") : "transparent" }}
                />
                <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-tv-text-dim opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing" />
                <div className="flex min-w-0 items-center gap-1.5">
                  <CoinIcon symbol={displaySymbol} size={16} />
                  <span className="truncate font-medium text-tv-text">
                    {posSide ? getBaseAsset(displaySymbol) : displaySymbol}
                  </span>
                  {posSide && <PositionSideBadge side={posSide} />}
                </div>
                <span
                  className={cn(
                    "text-right tabular-nums transition-colors",
                    f === "up" && "text-tv-green",
                    f === "down" && "text-tv-red",
                    !f && "text-tv-text",
                  )}
                >
                  {row ? formatPrice(row.price) : "—"}
                </span>
                <div className="flex items-center justify-end gap-1">
                  <span
                    className={cn(
                      "tabular-nums",
                      row
                        ? row.pct >= 0
                          ? "text-tv-green"
                          : "text-tv-red"
                        : "text-tv-text-muted",
                    )}
                  >
                    {row ? formatPct(row.pct) : "—"}
                  </span>
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFlagPickerId(flagPickerId === item.id ? null : item.id);
                      }}
                      className={cn(
                        "rounded p-0.5 transition-colors",
                        item.type === "symbol" && item.flagColor
                          ? "visible"
                          : "invisible group-hover:visible",
                        item.type === "symbol" && item.flagColor
                          ? "text-[color:var(--flag-color)]"
                          : "text-tv-text-muted hover:text-tv-text",
                      )}
                      style={item.type === "symbol" && item.flagColor ? { "--flag-color": item.flagColor } as React.CSSProperties : undefined}
                      aria-label="Set flag color"
                    >
                      <Flag className="h-3 w-3" />
                    </button>
                    {flagPickerId === item.id && (
                      <div
                        className="absolute right-0 top-5 z-50 flex gap-1 rounded border border-tv-border bg-tv-panel p-1.5 shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {["#ef5350","#2962ff","#26a69a","#ffb74d","#ab47bc","#00bcd4","#f06292"].map((c) => (
                          <button
                            key={c}
                            onClick={() => {
                              if (active) setWatchlistItemFlag(active.id, item.id, c);
                              setFlagPickerId(null);
                            }}
                            className="h-4 w-4 rounded-sm transition-opacity hover:opacity-80"
                            style={{ backgroundColor: c }}
                            aria-label={`Set flag to ${c}`}
                          />
                        ))}
                        <button
                          onClick={() => {
                            if (active) setWatchlistItemFlag(active.id, item.id, null);
                            setFlagPickerId(null);
                          }}
                          className="flex h-4 w-4 items-center justify-center rounded-sm border border-tv-border text-tv-text-muted hover:text-tv-red"
                          aria-label="Remove flag"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (active) removeWatchlistItem(active.id, item.id);
                    }}
                    className="invisible rounded p-0.5 text-tv-text-muted hover:bg-tv-bg hover:text-tv-red group-hover:visible"
                    aria-label={`Remove ${s} from watchlist`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="p-4 text-center text-xs text-tv-text-muted">
              Empty watchlist. Right-click to add items.
            </div>
          )}
        </div>
      </ScrollArea>

      {contextMenu && active && (
        <div
          data-watchlist-context
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 min-w-44 rounded-md border border-tv-border bg-tv-panel py-1 shadow-xl"
        >
          {contextMenu.itemId !== null && (
            <>
              {(() => {
                const item = items.find((i) => i.id === contextMenu.itemId);
                if (item?.type === "label") {
                  return (
                    <ContextItem
                      icon={Pencil}
                      label="Rename label…"
                      onClick={() => startRename(item.id, item.value)}
                    />
                  );
                }
                return null;
              })()}
              <ContextItem
                icon={ChevronsUp}
                label="Move up"
                onClick={() => {
                  moveWatchlistItem(active.id, contextMenu.itemId!, -1);
                  setContextMenu(null);
                }}
              />
              <ContextItem
                icon={ChevronsDown}
                label="Move down"
                onClick={() => {
                  moveWatchlistItem(active.id, contextMenu.itemId!, 1);
                  setContextMenu(null);
                }}
              />
              <ContextItem
                icon={Type}
                label="Add label above"
                onClick={() => addLabelHere(contextMenu.itemId!)}
              />
              <ContextItem
                icon={X}
                label="Remove"
                danger
                onClick={() => {
                  removeWatchlistItem(active.id, contextMenu.itemId!);
                  setContextMenu(null);
                }}
              />
              <div className="my-1 h-px bg-tv-border" />
            </>
          )}
          <ContextItem
            icon={Plus}
            label="Add symbol…"
            onClick={() => {
              openSymbolDialog(true);
              setContextMenu(null);
            }}
          />
          <ContextItem
            icon={Type}
            label="Add label at end"
            onClick={() => addLabelHere(undefined)}
          />
          <div className="my-1 h-px bg-tv-border" />
          <ContextItem icon={ListPlus} label="New watchlist…" onClick={createNewList} />
          <ContextItem icon={Pencil} label="Rename watchlist…" onClick={renameList} />
        </div>
      )}
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
      title={isLong ? "Open long position" : "Open short position"}
    >
      {isLong ? "L" : "S"}
    </span>
  );
}

function ContextItem({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
        danger
          ? "text-tv-red hover:bg-tv-red/10"
          : "text-tv-text hover:bg-tv-panel-hover",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}

/** Clickable, sort-aware column header (Price / 24h). */
function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`Sort by ${label}`}
      className={cn(
        "flex items-center justify-end gap-0.5 text-right uppercase tracking-wider transition-colors hover:text-tv-text",
        active ? "text-tv-blue" : "text-tv-text-dim",
      )}
    >
      <span>{label}</span>
      {active &&
        (dir === "asc" ? (
          <ArrowUp className="h-2.5 w-2.5" />
        ) : (
          <ArrowDown className="h-2.5 w-2.5" />
        ))}
    </button>
  );
}
