"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ListPlus,
  Pencil,
  Plus,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { fetchTickers24h } from "@/lib/binance/rest";
import { getBinanceWS } from "@/lib/binance/ws";
import { useChartStore } from "@/lib/store/chart-store";
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
  const moveWatchlistItem = useChartStore((s) => s.moveWatchlistItem);
  const renameWatchlistItem = useChartStore((s) => s.renameWatchlistItem);
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const openSymbolDialog = useChartStore((s) => s.setSymbolDialogOpen);

  const active = watchlists.find((w) => w.id === activeWatchlistId) ?? watchlists[0];
  const items = active?.items ?? [];
  const symbols = useMemo(
    () => items.filter((i) => i.type === "symbol").map((i) => i.value),
    [items],
  );

  const [rows, setRows] = useState<Record<string, Row>>({});
  const [flash, setFlash] = useState<Record<string, "up" | "down" | null>>({});
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    itemId: string | null;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  useEffect(() => {
    if (symbols.length === 0) {
      setRows({});
      return;
    }
    let cancelled = false;
    fetchTickers24h(symbols)
      .then((tickers) => {
        if (cancelled) return;
        const map: Record<string, Row> = {};
        tickers.forEach((t) => {
          map[t.symbol] = {
            symbol: t.symbol,
            price: t.lastPrice,
            pct: t.priceChangePercent,
          };
        });
        setRows(map);
      })
      .catch(console.error);

    const ws = getBinanceWS();
    const unsub = ws.subscribeMiniTickers(symbols, (tick) => {
      setRows((prev) => {
        const prevRow = prev[tick.symbol];
        if (prevRow) {
          if (tick.close > prevRow.price) {
            setFlash((f) => ({ ...f, [tick.symbol]: "up" }));
            setTimeout(
              () => setFlash((f) => ({ ...f, [tick.symbol]: null })),
              300,
            );
          } else if (tick.close < prevRow.price) {
            setFlash((f) => ({ ...f, [tick.symbol]: "down" }));
            setTimeout(
              () => setFlash((f) => ({ ...f, [tick.symbol]: null })),
              300,
            );
          }
        }
        return {
          ...prev,
          [tick.symbol]: {
            symbol: tick.symbol,
            price: tick.close,
            pct: tick.pct,
          },
        };
      });
    });

    return () => {
      cancelled = true;
      unsub();
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
        <span className="text-right">Price</span>
        <span className="text-right">24h</span>
      </div>
      <ScrollArea className="flex-1">
        <div
          className="flex flex-col"
          onContextMenu={(e) => openContextMenu(e, null)}
        >
          {items.map((item) => {
            if (item.type === "label") {
              return (
                <div
                  key={item.id}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    openContextMenu(e, item.id);
                  }}
                  onDoubleClick={() => startRename(item.id, item.value)}
                  className="group flex items-center gap-1 border-y border-tv-border bg-tv-bg/50 px-3 py-1"
                >
                  <Type className="h-2.5 w-2.5 text-tv-text-dim" />
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
            const row = rows[s];
            const isActive = s === symbol;
            const f = flash[s];
            return (
              <div
                key={item.id}
                onClick={() => setSymbol(s)}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  openContextMenu(e, item.id);
                }}
                className={cn(
                  "group grid cursor-pointer grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                  "hover:bg-tv-panel-hover",
                  isActive && "bg-tv-panel-hover",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-tv-text">
                    {s.replace("USDT", "")}
                  </span>
                  <span className="text-[10px] text-tv-text-dim">USDT</span>
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
