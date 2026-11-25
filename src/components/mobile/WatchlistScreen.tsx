"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowLeftRight,
  ArrowUpDown,
  Bell,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Copy,
  FolderInput,
  GripVertical,
  ListPlus,
  LineChart,
  ListX,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { fetchTickers24h, cleanSym } from "@/lib/binance/rest";
import { fetchBybitTickers24h } from "@/lib/bybit/public";
import { sortWatchlistItems, cycleSort } from "@/lib/watchlist/sort";
import { getBinanceWS } from "@/lib/binance/ws";
import { getBybitWS } from "@/lib/bybit/ws";
import { resolveSource } from "@/lib/symbols/source";
import { stripExchangePrefix } from "@/lib/symbols/prefix";
import { useChartStore, type WatchlistItem } from "@/lib/store/chart-store";
import { useMobileStore } from "@/lib/store/mobile-store";
import { swallowNextClick } from "@/lib/mobile/swallow-click";
import { useTradingStore } from "@/lib/store/trading-store";
import type { Position } from "@/lib/binance/trading-types";
import { formatPrice, formatPct, changeFromPct, formatChange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useBatchedTicks } from "@/hooks/useBatchedTicks";
import { CoinIcon, getBaseAsset } from "@/components/watchlist/CoinIcon";
import { describeSymbol } from "@/lib/symbols/describe";
import { FlagPennant } from "@/components/watchlist/FlagPennant";
import { FLAG_COLORS } from "@/lib/watchlist/flags";
import { useAlertsStore } from "@/lib/store/alerts-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { MobileSheet } from "./MobileSheet";

/** No tick for this long means the socket is not feeding us, whatever it
 *  claims about being connected. */
const TICK_SILENCE_MS = 20_000;
/** How often to re-seed over REST while that is the case. */
const FALLBACK_POLL_MS = 5_000;

interface Row {
  symbol: string;
  price: number;
  pct: number;
}

const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP = 10;

/**
 * Mobile watchlist — feature parity with the desktop <Watchlist /> (same
 * store actions), gestures adapted for touch:
 *  - long-press a row → enter multi-select (desktop uses Ctrl/Shift-click)
 *  - a "⋮" per row opens flag color / add label above / move to list
 *    (desktop puts these behind right-click)
 *  - a dedicated grip handle drives pointer-based drag-to-reorder (desktop
 *    uses native HTML5 drag, which touch browsers don't fire reliably)
 *  - watchlist management (switch/create/rename/duplicate/delete) lives in
 *    a full sheet instead of a dropdown
 */
export function WatchlistScreen() {
  const watchlists = useChartStore((s) => s.watchlists);
  const activeWatchlistId = useChartStore((s) => s.activeWatchlistId);
  const setActiveWatchlist = useChartStore((s) => s.setActiveWatchlist);
  const createWatchlist = useChartStore((s) => s.createWatchlist);
  const renameWatchlist = useChartStore((s) => s.renameWatchlist);
  const deleteWatchlist = useChartStore((s) => s.deleteWatchlist);
  const duplicateWatchlist = useChartStore((s) => s.duplicateWatchlist);
  const clearWatchlistItems = useChartStore((s) => s.clearWatchlistItems);
  const addLabelToWatchlist = useChartStore((s) => s.addLabelToWatchlist);
  const removeWatchlistItem = useChartStore((s) => s.removeWatchlistItem);
  const removeWatchlistItems = useChartStore((s) => s.removeWatchlistItems);
  const setWatchlistItemFlag = useChartStore((s) => s.setWatchlistItemFlag);
  const setWatchlistItemsFlag = useChartStore((s) => s.setWatchlistItemsFlag);
  const moveWatchlistItemToList = useChartStore((s) => s.moveWatchlistItemToList);
  const reorderWatchlistItems = useChartStore((s) => s.reorderWatchlistItems);
  const renameWatchlistItem = useChartStore((s) => s.renameWatchlistItem);
  const sort = useChartStore((s) => s.watchlistSort);
  const setWatchlistSort = useChartStore((s) => s.setWatchlistSort);
  const collapsedLabels = useChartStore((s) => s.watchlistCollapsedLabels);
  const toggleWatchlistLabelCollapsed = useChartStore((s) => s.toggleWatchlistLabelCollapsed);
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const openAlertDialog = useChartStore((s) => s.openAlertDialog);
  const openSymbolDialog = useChartStore((s) => s.setSymbolDialogOpen);
  const setSymbolDialogInsertAfterId = useChartStore((s) => s.setSymbolDialogInsertAfterId);
  const setTab = useMobileStore((s) => s.setTab);
  const allPositions = useTradingStore((s) => s.allPositions);
  const tradingExchange = useTradingStore((s) => s.exchange);

  /**
   * Flag colours the list is narrowed to. Empty means "show everything".
   *
   * Session-only rather than persisted: a filter that survives a reload is a
   * filter you forget you left on, and the list then looks like symbols went
   * missing. TradingView's flag chips behave the same way.
   */
  /**
   * Whether the reorder handles are showing.
   *
   * Off by default, so a row is content edge to edge the way TradingView's
   * is. A permanent handle column costs width on every row to serve an
   * action taken once in a while, and the same objection already got the
   * drag dots removed from the desktop list.
   */
  const [reorderMode, setReorderMode] = useState(false);
  const [flagFilter, setFlagFilter] = useState<Set<string>>(new Set());
  const alerts = useAlertsStore((st) => st.alerts);
  const drawingsForAlerts = useDrawingsStore((st) => st.drawings);

  const active = watchlists.find((w) => w.id === activeWatchlistId) ?? watchlists[0];
  const items = active?.items ?? [];
  const symbols = useMemo(
    () => items.filter((i) => i.type === "symbol").map((i) => i.value),
    [items],
  );

  /**
   * Symbols carrying at least one enabled alert, from both mechanisms — the
   * standalone price/RSI/MACD alerts and the ones attached to a drawing.
   *
   * Keyed by `cleanSym` so a watchlist row for "BTCUSDT" matches an alert set
   * on "BTCUSDT.P" or "BYBIT:BTCUSDT.P": those are the same instrument to a
   * person scanning the list, and keying on the raw ticker would silently
   * show no badge on the row they are actually watching.
   */
  const alertedSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const a of alerts) if (a.enabled) set.add(cleanSym(a.symbol));
    for (const d of drawingsForAlerts) if (d.alert?.enabled) set.add(cleanSym(d.symbol));
    return set;
  }, [alerts, drawingsForAlerts]);

  const positionsBySymbol = useMemo(() => {
    const map = new Map<string, Position>();
    for (const p of allPositions) {
      if (p.positionAmt !== 0) map.set(p.symbol, p);
    }
    return map;
  }, [allPositions]);

  const [rows, setRows] = useState<Record<string, Row>>({});
  const [flash, setFlash] = useState<Record<string, "up" | "down" | null>>({});
  const applyTick = useBatchedTicks(setRows, setFlash);
  /**
   * When a live tick last arrived, per venue, for the REST fallback below.
   *
   * Per venue and not one shared clock: the two sockets fail independently,
   * and a single clock let a ticking Binance row suppress the fallback for
   * frozen Bybit rows — precisely the case the fallback exists for.
   */
  const lastTickAtRef = useRef<{ binance: number; bybit: number }>({ binance: 0, bybit: 0 });
  const onBinanceTick = useCallback(
    (t: Parameters<typeof applyTick>[0]) => {
      lastTickAtRef.current.binance = Date.now();
      applyTick(t);
    },
    [applyTick],
  );
  const onBybitTick = useCallback(
    (t: Parameters<typeof applyTick>[0]) => {
      lastTickAtRef.current.bybit = Date.now();
      applyTick(t);
    },
    [applyTick],
  );
  const [manageOpen, setManageOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [actionsFor, setActionsFor] = useState<WatchlistItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchFlagOpen, setBatchFlagOpen] = useState(false);
  const [moveListOpen, setMoveListOpen] = useState<"item" | "batch" | null>(null);

  const collapsed = useMemo(() => new Set(collapsedLabels), [collapsedLabels]);

  // Live ticks — same split-by-source WS subscription as desktop.
  useEffect(() => {
    if (symbols.length === 0) {
      setRows({});
      return;
    }
    let cancelled = false;
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

    const unsubs: (() => void)[] = [];
    if (binanceSyms.length > 0) unsubs.push(getBinanceWS().subscribeMiniTickers(binanceSyms, onBinanceTick));
    if (bybitSyms.length > 0) unsubs.push(getBybitWS().subscribeMiniTickers(bybitSyms, onBybitTick));

    // REST fallback.
    //
    // The seed above runs once and every value after it comes from the
    // socket, so a socket that opens but never delivers leaves these rows
    // frozen at their opening price for as long as the tab stays up — with no
    // error and nothing to distinguish it from a flat market. Re-seeding on a
    // timer whenever no tick has arrived for a while keeps the list moving
    // wherever WebSockets don't get through but HTTPS does.
    const pollId = setInterval(() => {
      if (cancelled || document.hidden) return;
      const now = Date.now();
      if (binanceSyms.length > 0 && now - lastTickAtRef.current.binance >= TICK_SILENCE_MS)
        fetchTickers24h(binanceSyms).then(seed).catch(() => {});
      if (bybitSyms.length > 0 && now - lastTickAtRef.current.bybit >= TICK_SILENCE_MS)
        fetchBybitTickers24h(bybitSyms).then(seed).catch(() => {});
    }, FALLBACK_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      unsubs.forEach((u) => u());
    };
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(","), onBinanceTick, onBybitTick]);

  /**
   * Flag colours actually in use, so the chip row only offers real ones.
   *
   * Built from the items and then *ordered* by the palette, rather than
   * filtered by it: a colour that is on a row but not in `FLAG_COLORS` — one
   * carried over from an older palette, or set on another device — would
   * otherwise have no chip, leaving those rows unreachable by filter with
   * nothing to explain why.
   */
  const flagsInUse = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) if (i.type === "symbol" && i.flagColor) set.add(i.flagColor);
    const known = FLAG_COLORS.filter((c) => set.has(c));
    const extra = [...set].filter((c) => !FLAG_COLORS.includes(c)).sort();
    return [...known, ...extra];
  }, [items]);

  const visibleItems = useMemo(() => {
    const filtering = flagFilter.size > 0;
    let hidingUnder: string | null = null;
    const kept = items.filter((item) => {
      if (item.type === "label") {
        hidingUnder = collapsed.has(item.id) ? item.id : null;
        return true;
      }
      if (hidingUnder !== null) return false;
      return !filtering || (item.flagColor ? flagFilter.has(item.flagColor) : false);
    });
    // A label whose every symbol was filtered out is just a heading over
    // nothing, so drop it rather than leave gaps down the list.
    if (!filtering) return kept;
    return kept.filter((item, i) => {
      if (item.type !== "label") return true;
      for (let j = i + 1; j < kept.length; j++) {
        if (kept[j].type === "label") break;
        return true;
      }
      return false;
    });
  }, [items, collapsed, flagFilter]);

  const displayItems = useMemo(
    () => sortWatchlistItems(visibleItems, rows, sort),
    [visibleItems, rows, sort],
  );
  const isSorted = sort.key !== "manual";
  const selectMode = selected.size > 0;

  // Drag-to-reorder — pointer-based (HTML5 dragstart/drop don't fire from
  // touch), driven from each row's grip handle via setPointerCapture so
  // move/up events keep routing to it even once the finger leaves the row.
  const draggingId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Every handler below stops propagation — the handle sits inside a row
  // that has its own pointerdown/up listeners for long-press-to-select and
  // tap-to-open, and (with setPointerCapture) these events keep bubbling
  // from the handle's place in the DOM tree even while captured. Without
  // this, dragging a row would also fire the row's tap-to-open handler.
  function handleDragPointerDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingId.current = id;
    setDragOverId(id);
  }
  function handleDragPointerMove(e: React.PointerEvent) {
    e.stopPropagation();
    if (!draggingId.current) return;
    let closestId: string | null = null;
    let closestDist = Infinity;
    for (const [id, el] of rowRefs.current) {
      const r = el.getBoundingClientRect();
      const dist = Math.abs(e.clientY - (r.top + r.height / 2));
      if (dist < closestDist) {
        closestDist = dist;
        closestId = id;
      }
    }
    if (closestId) setDragOverId(closestId);
  }
  function handleDragPointerUp(e: React.PointerEvent) {
    e.stopPropagation();
    if (active && draggingId.current && dragOverId && dragOverId !== draggingId.current) {
      reorderWatchlistItems(active.id, draggingId.current, dragOverId);
    }
    draggingId.current = null;
    setDragOverId(null);
  }
  // A cancelled gesture (e.g. the OS takes over for a system gesture) should
  // just abort, not commit whatever position was last under the finger.
  function handleDragPointerCancel(e: React.PointerEvent) {
    e.stopPropagation();
    draggingId.current = null;
    setDragOverId(null);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function open(item: WatchlistItem) {
    if (item.type !== "symbol") return;
    if (selectMode) {
      toggleSelected(item.id);
      return;
    }
    setSymbol(item.value);
    setTab("chart");
  }

  function addLabelHere(beforeId?: string) {
    if (!active) return;
    const text = window.prompt("Section label:");
    if (text && text.trim()) addLabelToWatchlist(active.id, text.trim(), beforeId);
  }

  function startRename(item: WatchlistItem) {
    setRenamingId(item.id);
    setRenameDraft(item.value);
    setActionsFor(null);
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
    if (name && name.trim()) createWatchlist(name.trim());
  }
  function renameList() {
    if (!active) return;
    const name = window.prompt("Watchlist name:", active.name);
    if (name && name.trim()) renameWatchlist(active.id, name.trim());
  }
  function deleteList() {
    if (!active) return;
    if (watchlists.length <= 1) {
      window.alert("You need at least one watchlist.");
      return;
    }
    if (window.confirm(`Delete watchlist "${active.name}"?`)) {
      deleteWatchlist(active.id);
      setManageOpen(false);
    }
  }

  if (!active) return null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-1 border-b border-tv-border px-2 py-2">
        <button
          onClick={() => setManageOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-1 rounded px-1.5 py-1 text-left text-sm font-semibold active:bg-tv-panel-hover"
        >
          <span className="truncate">{active.name}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-tv-text-muted" />
        </button>
        {/* Flag filter chips, as TradingView puts beside the list name.
            Only the colours actually in use are offered — a row of eight
            swatches where six match nothing is noise. */}
        {flagsInUse.length > 0 && (
          <div className="flex shrink-0 items-center gap-1 pr-1">
            {flagsInUse.map((c) => {
              const on = flagFilter.has(c);
              return (
                <button
                  key={c}
                  onClick={() =>
                    setFlagFilter((prev) => {
                      const next = new Set(prev);
                      if (next.has(c)) next.delete(c);
                      else next.add(c);
                      return next;
                    })
                  }
                  aria-pressed={on}
                  aria-label={on ? `Stop filtering by this flag` : `Filter by this flag`}
                  className={cn(
                    "flex h-7 w-6 items-center justify-center rounded",
                    on ? "bg-tv-panel-hover ring-1 ring-tv-border" : "opacity-45",
                  )}
                >
                  <FlagPennant color={c} height={15} />
                </button>
              );
            })}
          </div>
        )}
        {/* Reorder toggle. Sorting the list by a column already disables
            manual order, so the control would do nothing there. */}
        {!isSorted && (
          <button
            onClick={() => setReorderMode((v) => !v)}
            aria-pressed={reorderMode}
            aria-label={reorderMode ? "Done reordering" : "Reorder symbols"}
            className={cn(
              "rounded p-1.5 active:bg-tv-panel-hover",
              reorderMode ? "bg-tv-panel-hover text-tv-text" : "text-tv-text-muted",
            )}
          >
            <ArrowUpDown className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => addLabelHere(undefined)}
          className="rounded p-1.5 text-tv-text-muted active:bg-tv-panel-hover"
          aria-label="Add label"
        >
          <Type className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            setSymbolDialogInsertAfterId(null);
            openSymbolDialog(true);
          }}
          className="rounded p-1.5 text-tv-text-muted active:bg-tv-panel-hover"
          aria-label="Add symbol"
        >
          <Plus className="h-4 w-4" />
        </button>
      </header>

      {/* Sort row. `py-2` rather than the label's own line height: Price and
          24h are buttons, and at 18px tall they were below what a thumb hits
          reliably. The row reads the same; only its hit area grows. */}
      <div className="grid shrink-0 grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-tv-border px-3 py-2 text-[10px] uppercase tracking-wider text-tv-text-muted">
        <span>Symbol</span>
        <SortHeader
          label="Price"
          active={sort.key === "price"}
          dir={sort.dir}
          onClick={() => setWatchlistSort(cycleSort(sort, "price"))}
        />
        <SortHeader
          label="24h"
          active={sort.key === "change"}
          dir={sort.dir}
          onClick={() => setWatchlistSort(cycleSort(sort, "change"))}
        />
      </div>

      {/* Multi-select action bar */}
      {selectMode && (
        <div className="flex shrink-0 items-center gap-1 border-b border-tv-border bg-tv-text/10 px-2 py-1.5">
          <span className="flex-1 text-[11px] font-medium">{selected.size} selected</span>
          <div className="relative">
            <button
              onClick={() => setBatchFlagOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted active:bg-tv-panel-hover"
              aria-label="Set flag color"
            >
              <FlagPennant color={null} height={17} />
            </button>
            {batchFlagOpen && (
              <FlagSwatches
                className="absolute right-0 top-9 z-50"
                onPick={(c) => {
                  setWatchlistItemsFlag(active.id, Array.from(selected), c);
                  setBatchFlagOpen(false);
                }}
              />
            )}
          </div>
          {watchlists.length > 1 && (
            <button
              onClick={() => setMoveListOpen("batch")}
              className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted active:bg-tv-panel-hover"
              aria-label="Move to another list"
            >
              <FolderInput className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => {
              removeWatchlistItems(active.id, Array.from(selected));
              setSelected(new Set());
            }}
            className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted active:bg-tv-red/15 active:text-tv-red"
            aria-label="Remove selected"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted active:bg-tv-panel-hover"
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-32 items-center justify-center px-6 text-center text-xs text-tv-text-muted">
            Empty list. Tap + to add symbols.
          </div>
        ) : (
          displayItems.map((item) => {
            const isDragTarget = dragOverId === item.id && draggingId.current !== item.id;
            const showHandle = reorderMode && !isSorted && !selectMode;

            if (item.type === "label") {
              const isCollapsed = collapsed.has(item.id);
              return (
                <div
                  key={item.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(item.id, el);
                    else rowRefs.current.delete(item.id);
                  }}
                  className={cn(
                    "flex items-center gap-1 border-y border-tv-border bg-tv-bg/50 px-1 py-1.5",
                    isDragTarget && "border-t-2 border-t-tv-text",
                  )}
                >
                  {showHandle ? (
                    <button
                      onPointerDown={(e) => handleDragPointerDown(e, item.id)}
                      onPointerMove={handleDragPointerMove}
                      onPointerUp={handleDragPointerUp}
                      onPointerCancel={handleDragPointerCancel}
                      style={{ touchAction: "none" }}
                      className="shrink-0 p-1 text-tv-text-dim"
                      aria-label="Drag to reorder"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <span className="w-5 shrink-0" />
                  )}
                  <button
                    onClick={() => toggleWatchlistLabelCollapsed(item.id)}
                    className="shrink-0 p-0.5 text-tv-text-dim"
                    aria-label={isCollapsed ? "Expand section" : "Collapse section"}
                  >
                    {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
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
                    <span className="flex-1 truncate text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
                      {item.value}
                    </span>
                  )}
                  <button
                    onClick={() => setActionsFor(item)}
                    className="shrink-0 p-1.5 text-tv-text-dim"
                    aria-label="Label actions"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            }

            return (
              <SymbolRow
                key={item.id}
                item={item}
                rowRef={(el) => {
                  if (el) rowRefs.current.set(item.id, el);
                  else rowRefs.current.delete(item.id);
                }}
                row={rows[item.value]}
                flash={flash[item.value] ?? null}
                isActive={item.value === symbol}
                isSelected={selected.has(item.id)}
                selectMode={selectMode}
                showHandle={showHandle}
                isDragTarget={isDragTarget}
                hasAlert={alertedSymbols.has(cleanSym(item.value))}
                posSide={(() => {
                  const rowMatchesExchange = resolveSource(item.value).kind === tradingExchange;
                  const openPosition = rowMatchesExchange
                    ? positionsBySymbol.get(cleanSym(item.value))
                    : undefined;
                  return openPosition?.side === "LONG" || openPosition?.side === "SHORT"
                    ? openPosition.side
                    : null;
                })()}
                onOpen={() => open(item)}
                onLongPress={() =>
                  // In multi-select a long press keeps extending the
                  // selection, which is what the gesture means there.
                  // Otherwise it opens the row's actions, the way holding a
                  // row does on every other chart app — and the way the "…"
                  // button already did, which a thumb has to aim for.
                  selectMode ? toggleSelected(item.id) : setActionsFor(item)
                }
                onDragPointerDown={(e) => handleDragPointerDown(e, item.id)}
                onDragPointerMove={handleDragPointerMove}
                onDragPointerUp={handleDragPointerUp}
                onDragPointerCancel={handleDragPointerCancel}
                onMore={() => setActionsFor(item)}
              />
            );
          })
        )}
      </div>

      {/* Manage watchlists sheet */}
      {manageOpen && (
        <MobileSheet title="Watchlists" onClose={() => setManageOpen(false)}>
          {watchlists.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                setActiveWatchlist(w.id);
                setSelected(new Set());
                setManageOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between border-b border-tv-border/60 px-4 py-3 text-left text-sm",
                w.id === activeWatchlistId ? "bg-tv-text/10 text-tv-text" : "text-tv-text active:bg-tv-panel-hover",
              )}
            >
              {w.name}
            </button>
          ))}
          <div className="mt-2">
            <SheetAction icon={ListPlus} label="New watchlist…" onClick={createNewList} />
            <SheetAction icon={Pencil} label="Rename current…" onClick={renameList} />
            <SheetAction
              icon={Copy}
              label="Duplicate current"
              onClick={() => active && duplicateWatchlist(active.id)}
            />
            <SheetAction
              icon={ListX}
              label="Remove all items"
              onClick={() => {
                if (active && items.length > 0 && window.confirm(`Remove all items from "${active.name}"?`)) {
                  clearWatchlistItems(active.id);
                }
              }}
            />
            <SheetAction icon={Trash2} label="Delete current" danger onClick={deleteList} />
          </div>
        </MobileSheet>
      )}

      {/* Per-item actions sheet */}
      {actionsFor && active && (
        <MobileSheet
          title={actionsFor.type === "label" ? actionsFor.value : stripExchangePrefix(actionsFor.value)}
          onClose={() => setActionsFor(null)}
        >
          {actionsFor.type === "label" ? (
            <SheetAction icon={Pencil} label="Rename label…" onClick={() => startRename(actionsFor)} />
          ) : (
            <>
              <SheetAction
                icon={LineChart}
                label="Open chart"
                onClick={() => {
                  setSymbol(actionsFor.value);
                  setActionsFor(null);
                  setTab("chart");
                }}
              />
              <SheetAction
                icon={Bell}
                label="Add alert…"
                onClick={() => {
                  // The alert dialog is per-symbol, so chart this one first.
                  setSymbol(actionsFor.value);
                  setActionsFor(null);
                  setTab("chart");
                  openAlertDialog();
                }}
              />
              <SheetAction
                icon={ArrowLeftRight}
                label="Trade"
                onClick={() => {
                  setSymbol(actionsFor.value);
                  setActionsFor(null);
                  setTab("trade");
                }}
              />
              <SheetAction
                icon={CheckSquare}
                label="Select"
                onClick={() => {
                  toggleSelected(actionsFor.id);
                  setActionsFor(null);
                }}
              />
              <div className="border-b border-tv-border/60 px-4 py-3">
                <span className="mb-2 block text-[10px] uppercase tracking-wider text-tv-text-muted">
                  Flag color
                </span>
                <FlagSwatches
                  onPick={(c) => {
                    setWatchlistItemFlag(active.id, actionsFor.id, c);
                    setActionsFor(null);
                  }}
                />
              </div>
              <SheetAction
                icon={Type}
                label="Add label above"
                onClick={() => {
                  addLabelHere(actionsFor.id);
                  setActionsFor(null);
                }}
              />
              <SheetAction
                icon={Plus}
                label="Add symbol after…"
                onClick={() => {
                  setSymbolDialogInsertAfterId(actionsFor.id);
                  openSymbolDialog(true);
                  setActionsFor(null);
                }}
              />
              {watchlists.length > 1 && (
                <SheetAction
                  icon={FolderInput}
                  label="Move to another list…"
                  onClick={() => setMoveListOpen("item")}
                />
              )}
              <SheetAction
                icon={X}
                label="Remove from watchlist"
                danger
                onClick={() => {
                  removeWatchlistItem(active.id, actionsFor.id);
                  setActionsFor(null);
                }}
              />
            </>
          )}
        </MobileSheet>
      )}

      {/* "Move to list" picker — shared by the per-item sheet and the batch bar */}
      {moveListOpen && active && (
        <MobileSheet title="Move to…" onClose={() => setMoveListOpen(null)}>
          {watchlists.filter((w) => w.id !== active.id).map((w) => (
            <button
              key={w.id}
              onClick={() => {
                if (moveListOpen === "batch") {
                  for (const id of selected) moveWatchlistItemToList(active.id, w.id, id);
                  setSelected(new Set());
                } else if (actionsFor) {
                  moveWatchlistItemToList(active.id, w.id, actionsFor.id);
                }
                setMoveListOpen(null);
                setActionsFor(null);
              }}
              className="block w-full border-b border-tv-border/60 px-4 py-3 text-left text-sm text-tv-text active:bg-tv-panel-hover"
            >
              {w.name}
            </button>
          ))}
        </MobileSheet>
      )}
    </div>
  );
}

/** A single symbol row: tap opens the chart (or toggles selection in select
 *  mode), long-press enters select mode, the grip handle drags to reorder. */
function SymbolRow({
  item, rowRef, row, flash, isActive, isSelected, selectMode, showHandle, isDragTarget, posSide, hasAlert,
  onOpen, onLongPress, onDragPointerDown, onDragPointerMove, onDragPointerUp, onDragPointerCancel,
  onMore,
}: {
  item: Extract<WatchlistItem, { type: "symbol" }>;
  rowRef: (el: HTMLElement | null) => void;
  row: Row | undefined;
  flash: "up" | "down" | null;
  isActive: boolean;
  isSelected: boolean;
  selectMode: boolean;
  showHandle: boolean;
  isDragTarget: boolean;
  posSide: "LONG" | "SHORT" | null;
  hasAlert: boolean;
  onOpen: () => void;
  onLongPress: () => void;
  onDragPointerDown: (e: React.PointerEvent) => void;
  onDragPointerMove: (e: React.PointerEvent) => void;
  onDragPointerUp: (e: React.PointerEvent) => void;
  onDragPointerCancel: (e: React.PointerEvent) => void;
  onMore: () => void;
}) {
  const s = item.value;
  const displaySymbol = stripExchangePrefix(s);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    longPressed.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      // The gesture is finished as far as the app is concerned, but the
      // finger is still down: the click the browser sends on lift would land
      // inside whatever this just opened. See swallowNextClick.
      swallowNextClick();
      onLongPress();
    }, LONG_PRESS_MS);
  }
  function onPointerMove(e: React.PointerEvent) {
    const start = pressStart.current;
    if (!start || !pressTimer.current) return;
    if (Math.abs(e.clientX - start.x) > LONG_PRESS_SLOP || Math.abs(e.clientY - start.y) > LONG_PRESS_SLOP) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }
  function onPointerUp() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (!longPressed.current) onOpen();
  }
  function onPointerCancel() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }

  return (
    <div
      ref={rowRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={cn(
        "grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-1.5 border-b border-tv-border/60 py-2.5 pl-1 pr-2 active:bg-tv-panel-hover",
        isActive && !selectMode && "bg-tv-panel-hover",
        isSelected && "bg-tv-text/10",
        isDragTarget && "border-t-2 border-t-tv-text",
      )}
    >
      {selectMode ? (
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
            isSelected ? "border-tv-text bg-tv-text" : "border-tv-border",
          )}
        >
          {isSelected && <span className="h-2 w-2 rounded-full bg-tv-bg" />}
        </span>
      ) : showHandle ? (
        <button
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          onPointerCancel={onDragPointerCancel}
          style={{ touchAction: "none" }}
          className="shrink-0 p-1 text-tv-text-dim"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <span className="w-5 shrink-0" />
      )}

      {item.flagColor ? (
        <FlagPennant color={item.flagColor} height={16} />
      ) : (
        // Same footprint as the tag, so flagged and unflagged rows align.
        <span className="w-[9px] shrink-0" />
      )}

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {/* Larger than the desktop row on purpose: on a phone the icon is the
            fastest way to find a row, and a 18px mark is below the size at
            which a coin logo is recognisable at arm's length. */}
        <span className="relative shrink-0">
          <CoinIcon symbol={displaySymbol} size={30} />
          {hasAlert && (
            // Pinned to the icon, as TradingView does, rather than given its
            // own column: the badge is a property of the instrument, and a
            // column would cost width on every row to mark a handful.
            <span
              className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-tv-panel ring-1 ring-tv-border"
              title="Alert set"
            >
              <Bell className="h-2 w-2 text-tv-yellow" />
            </span>
          )}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 truncate text-[15px] font-semibold leading-tight">
            {posSide ? getBaseAsset(displaySymbol) : displaySymbol}
            {posSide && <PositionSideBadge side={posSide} />}
          </span>
          {/* The long name, not the venue: every row is on the same venue, so
              that line was the same string all the way down the list. */}
          <span className="truncate text-[12px] leading-tight text-tv-text-muted">
            {describeSymbol(s)}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end leading-tight">
        <span
          className={cn(
            "font-mono text-[15px] tabular-nums transition-colors",
            flash === "up" && "text-tv-green",
            flash === "down" && "text-tv-red",
            !flash && "text-tv-text",
          )}
        >
          {row ? formatPrice(row.price) : "—"}
        </span>
        <span
          className={cn(
            "flex items-baseline gap-1.5 font-mono text-[12px] tabular-nums",
            row ? (row.pct >= 0 ? "text-tv-green" : "text-tv-red") : "text-tv-text-muted",
          )}
        >
          {row && (() => {
            const chg = changeFromPct(row.price, row.pct);
            return chg === null ? null : <span>{formatChange(chg)}</span>;
          })()}
          <span>{row ? formatPct(row.pct) : "—"}</span>
        </span>
      </div>

      {!selectMode && (
        // Pointer events (not just click) must stop here too — they bubble to
        // the row's own pointerdown/up handlers, which drive long-press and
        // tap-to-open; without this, tapping × would also open the chart.
        <div className="flex items-center" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMore();
            }}
            className="rounded p-1.5 text-tv-text-dim"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function FlagSwatches({ onPick, className }: { onPick: (color: string | null) => void; className?: string }) {
  return (
    <div
      className={cn(
        "flex gap-1.5 rounded border border-tv-border bg-tv-panel p-2 shadow-lg",
        className,
      )}
    >
      {FLAG_COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onPick(c)}
          className="h-6 w-6 rounded-sm transition-opacity active:opacity-70"
          style={{ backgroundColor: c }}
          aria-label={`Set flag to ${c}`}
        />
      ))}
      <button
        onClick={() => onPick(null)}
        className="flex h-6 w-6 items-center justify-center rounded-sm border border-tv-border text-tv-text-muted active:text-tv-red"
        aria-label="Remove flag"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function SheetAction({
  icon: Icon, label, danger, onClick,
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
        "flex w-full items-center gap-3 border-b border-tv-border/60 px-4 py-3 text-left text-sm active:bg-tv-panel-hover",
        danger ? "text-tv-red" : "text-tv-text",
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
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

/** Clickable, sort-aware column header (Price / 24h). */
function SortHeader({
  label, active, dir, onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-h-7 items-center justify-end gap-0.5 px-1 text-right uppercase tracking-wider",
        active ? "text-tv-text" : "text-tv-text-dim",
      )}
    >
      <span>{label}</span>
      {active && (dir === "asc" ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />)}
    </button>
  );
}
