"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowLeftRight,
  Bell,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Copy,
  FolderInput,
  ListPlus,
  LineChart,
  ListX,
  Menu,
  Pencil,
  Plus,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { fetchTickers24h, cleanSym } from "@/lib/binance/rest";
import { fetchBybitTickers24h } from "@/lib/bybit/public";
import { sortWatchlistItems } from "@/lib/watchlist/sort";
import { getBinanceWS } from "@/lib/binance/ws";
import { getBybitWS } from "@/lib/bybit/ws";
import { resolveSource } from "@/lib/symbols/source";
import { fetchRestQuotes, isStreamed, REST_QUOTE_MS } from "@/lib/data/quotes";
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
import { MobileActionSheet } from "./MobileActionSheet";

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
 * store actions), laid out and handled the way TradingView's phone list is:
 *  - tap a row → its chart (or, in select mode, toggle it)
 *  - hold a row → a buzz, it lifts and follows the finger; drop it to
 *    reorder (desktop uses native HTML5 drag, which touch browsers don't fire)
 *  - keep holding, still, for twice as long → the row's settings sheet: flag
 *    colour, alert, trade, select, sections, move to list, remove
 *    (desktop puts these behind right-click)
 *  - watchlist management and sorting live in the lists sheet
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
  const [flagFilter, setFlagFilter] = useState<Set<string>>(new Set());
  const alerts = useAlertsStore((st) => st.alerts);
  const drawingsForAlerts = useDrawingsStore((st) => st.drawings);

  const active = watchlists.find((w) => w.id === activeWatchlistId) ?? watchlists[0];
  /** The selected tab, scrolled into view when the list changes from elsewhere. */
  const activeTabRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeWatchlistId, watchlists.length]);
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
    // Only exchange symbols go to an exchange ticker. Everything else — a
    // stock, an index, a macro series, a synthetic expression — used to land
    // here too, so Binance was asked for AAPL and the row sat on "--".
    const binanceSyms = symbols.filter((s) => resolveSource(s).kind === "binance");
    const restSyms = symbols.filter((s) => !isStreamed(s));

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
    if (restSyms.length > 0) fetchRestQuotes(restSyms).then(seed).catch(console.error);
    // No socket streams these, so they are polled for as long as the list is up.
    const restPollId =
      restSyms.length > 0
        ? setInterval(() => {
            if (!cancelled && !document.hidden) fetchRestQuotes(restSyms).then(seed).catch(() => {});
          }, REST_QUOTE_MS)
        : null;

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
      if (restPollId !== null) clearInterval(restPollId);
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

  /*
   * Hold a row to lift it, then drag it to its new place — the way
   * TradingView's list (and every phone list) reorders, with no separate
   * reorder mode and no grip column eating width on every row.
   *
   * The lifted row follows the finger; the rows it passes slide out of its
   * way by its height, so the gap shows where it will land; the list
   * scrolls by itself while the finger rests near its top or bottom edge.
   * Geometry is captured once, at the lift, in *content* coordinates (top of
   * the scrolled list), so auto-scroll needs no re-measuring: a scroll only
   * changes where the finger is in the content. A label lifts with its whole
   * section, because that is what the store moves.
   */
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [drag, setDrag] = useState<DragView | null>(null);
  const dragRef = useRef<DragSession | null>(null);

  const contentY = (clientY: number) => {
    const el = listRef.current!;
    return clientY - el.getBoundingClientRect().top + el.scrollTop;
  };

  function recomputeDrag() {
    const d = dragRef.current;
    if (!d) return;
    const dy = contentY(d.lastClientY) - d.startContentY;
    const grabbedMid = d.tops[d.from] + d.heights[d.from] / 2 + dy;
    let c = 0;
    for (let k = 0; k < d.tops.length; k++) {
      if (k >= d.from && k < d.from + d.len) continue;
      if (d.tops[k] + d.heights[k] / 2 < grabbedMid) c++;
    }
    d.c = c;
    setDrag({ id: d.id, from: d.from, len: d.len, blockH: d.blockH, dy, c });
  }

  function beginDrag(id: string, clientY: number): boolean {
    const el = listRef.current;
    const from = displayItems.findIndex((it) => it.id === id);
    if (!el || from === -1) return false;
    let len = 1;
    if (displayItems[from].type === "label") {
      while (from + len < displayItems.length && displayItems[from + len].type !== "label") len++;
    }
    const top0 = el.getBoundingClientRect().top - el.scrollTop;
    const tops: number[] = [];
    const heights: number[] = [];
    for (const it of displayItems) {
      const r = rowRefs.current.get(it.id)?.getBoundingClientRect();
      tops.push(r ? r.top - top0 : 0);
      heights.push(r ? r.height : 0);
    }
    let blockH = 0;
    for (let k = from; k < from + len; k++) blockH += heights[k];
    const session: DragSession = {
      id, from, len, blockH, tops, heights,
      startContentY: contentY(clientY),
      startClientY: clientY,
      lastClientY: clientY,
      moved: false,
      c: from,
      raf: 0,
    };
    const tick = () => {
      const d = dragRef.current;
      const list = listRef.current;
      if (!d || !list) return;
      const r = list.getBoundingClientRect();
      const EDGE = 64;
      let v = 0;
      if (d.lastClientY < r.top + EDGE) v = -Math.ceil((r.top + EDGE - d.lastClientY) / 5);
      else if (d.lastClientY > r.bottom - EDGE) v = Math.ceil((d.lastClientY - (r.bottom - EDGE)) / 5);
      if (v !== 0 && d.moved) {
        const before = list.scrollTop;
        list.scrollTop += v;
        if (list.scrollTop !== before) recomputeDrag();
      }
      d.raf = requestAnimationFrame(tick);
    };
    dragRef.current = session;
    session.raf = requestAnimationFrame(tick);
    setDrag({ id, from, len, blockH, dy: 0, c: from });
    navigator.vibrate?.(12);
    return true;
  }

  function moveDrag(clientY: number) {
    const d = dragRef.current;
    if (!d) return;
    d.lastClientY = clientY;
    if (Math.abs(clientY - d.startClientY) > 6) d.moved = true;
    recomputeDrag();
  }

  /** Ends the lift. Returns whether the row was actually dragged anywhere. */
  function endDrag(commit: boolean): boolean {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return false;
    cancelAnimationFrame(d.raf);
    setDrag(null);
    if (!commit || !d.moved || !active) return d.moved;
    const c = d.c;
    if (c === d.from) return true;
    const others = displayItems.filter((_, k) => k < d.from || k >= d.from + d.len);
    // The store inserts *before* the target when moving up and *after* it
    // when moving down, which is exactly the slot the gap was showing.
    const target = c < d.from ? others[c] : others[c - 1];
    if (target) reorderWatchlistItems(active.id, d.id, target.id);
    return true;
  }

  /** The offset each row is drawn at while something is being lifted. */
  function dragOffset(index: number): number {
    if (!drag) return 0;
    if (index >= drag.from && index < drag.from + drag.len) return drag.dy;
    // Position of this row among the rows that are not lifted.
    const k = index < drag.from ? index : index - drag.len;
    if (drag.c < drag.from && k >= drag.c && k < drag.from) return drag.blockH;
    if (drag.c > drag.from && k >= drag.from && k < drag.c) return -drag.blockH;
    return 0;
  }

  // While a row is lifted the finger belongs to it, not to the list's
  // scroll. This has to be a non-passive native listener: React's touch
  // handlers are passive, and only a cancelled touchmove stops the browser
  // from taking the gesture over (and firing pointercancel at us).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, [activeWatchlistId]);

  /**
   * The first stage of a hold: a buzz, and the row lifts to be dragged. In
   * select mode it extends the selection instead, and in a sorted list —
   * where a manual position means nothing — nothing lifts, but the hold
   * still counts towards the second stage.
   */
  function onRowHold(item: WatchlistItem, clientY: number): "drag" | "wait" | "done" {
    if (selectMode) {
      toggleSelected(item.id);
      return "done";
    }
    if (isSorted) {
      navigator.vibrate?.(12);
      return "wait";
    }
    return beginDrag(item.id, clientY) ? "drag" : "wait";
  }

  /** The second stage: still held, still in place — the row's settings. */
  function onRowSettings(item: WatchlistItem) {
    endDrag(false);
    navigator.vibrate?.(25);
    // The click the browser sends when the finger lifts would otherwise
    // land on whatever the sheet put under it.
    swallowNextClick();
    setActionsFor(item);
  }

  function onRowRelease() {
    endDrag(true);
    // Same reason: the lift's click must not reach the row under the finger.
    swallowNextClick();
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

  const sortLabel = sort.key === "price" ? "Price" : sort.key === "change" ? "24h change" : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header, after TradingView's: the lists menu, then every list as a
          tab — one tap to switch, where the single name pill took two (open
          the lists sheet, pick) — and add-symbol. Reorder, labels and sort
          are gestures or live in the lists sheet. */}
      <header className="flex shrink-0 items-center gap-1 px-3 pt-2 pb-1">
        <button
          onClick={() => setManageOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-tv-text active:bg-tv-panel-hover"
          aria-label="Watchlists"
        >
          <Menu className="h-6 w-6" />
        </button>
        <span className="mx-1 h-6 w-px shrink-0 bg-tv-border" />
        <div
          className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          role="tablist"
          aria-label="Watchlists"
        >
          {watchlists.map((w) => {
            const on = w.id === active.id;
            return (
              <button
                key={w.id}
                ref={on ? activeTabRef : undefined}
                role="tab"
                aria-selected={on}
                onClick={() => setActiveWatchlist(w.id)}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-[17px] font-semibold transition-colors",
                  on
                    ? "bg-tv-panel-hover text-tv-text"
                    : "text-tv-text-muted active:bg-tv-panel-hover",
                )}
              >
                {w.name}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => {
            setSymbolDialogInsertAfterId(null);
            openSymbolDialog(true);
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-tv-text active:bg-tv-panel-hover"
          aria-label="Add symbol"
        >
          <Plus className="h-6 w-6" />
        </button>
      </header>

      {/* Flag filter: every colour actually in use, and only when there is
          one. A tap narrows the list to it; tap again to clear. */}
      {flagsInUse.length > 0 && (
        <div className="no-scrollbar flex shrink-0 items-center gap-0.5 overflow-x-auto px-3 pb-1">
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
                aria-label={on ? "Stop filtering by this flag" : "Filter by this flag"}
                className={cn(
                  "flex h-9 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                  on ? "bg-tv-panel-hover" : "active:bg-tv-panel-hover",
                  flagFilter.size > 0 && !on && "opacity-40",
                )}
              >
                <FlagPennant color={c} height={18} />
              </button>
            );
          })}
        </div>
      )}

      {/* Only shown while it is in effect: a sorted list cannot be reordered,
          and nothing else on screen would say why. */}
      {sortLabel && (
        <div className="flex shrink-0 items-center gap-2 px-4 pb-2 text-xs text-tv-text-muted">
          <span>
            Sorted by {sortLabel} {sort.dir === "desc" ? "↓" : "↑"}
          </span>
          <button
            onClick={() => setWatchlistSort({ key: "manual", dir: "desc" })}
            className="rounded-full bg-tv-panel-hover px-2.5 py-1 text-tv-text active:bg-tv-text/15"
          >
            Manual order
          </button>
        </div>
      )}

      {/* Multi-select action bar */}
      {selectMode && (
        <div className="flex shrink-0 items-center gap-1 border-y border-tv-border bg-tv-text/10 px-3 py-1.5">
          <span className="flex-1 text-sm font-medium">{selected.size} selected</span>
          <div className="relative">
            <button
              onClick={() => setBatchFlagOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-tv-text-muted active:bg-tv-panel-hover"
              aria-label="Set flag color"
            >
              <FlagPennant color={null} height={18} />
            </button>
            {batchFlagOpen && (
              <FlagSwatches
                className="absolute right-0 top-11 z-50"
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
              className="flex h-10 w-10 items-center justify-center rounded-lg text-tv-text-muted active:bg-tv-panel-hover"
              aria-label="Move to another list"
            >
              <FolderInput className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={() => {
              removeWatchlistItems(active.id, Array.from(selected));
              setSelected(new Set());
            }}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-tv-text-muted active:bg-tv-red/15 active:text-tv-red"
            aria-label="Remove selected"
          >
            <Trash2 className="h-5 w-5" />
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-tv-text-muted active:bg-tv-panel-hover"
            aria-label="Clear selection"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* List */}
      <div
        ref={listRef}
        onContextMenu={(e) => e.preventDefault()}
        className="relative min-h-0 flex-1 select-none overflow-y-auto overscroll-contain [-webkit-touch-callout:none]"
      >
        {items.length === 0 ? (
          <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-tv-text-muted">
            Empty list. Tap + to add symbols.
          </div>
        ) : (
          displayItems.map((item, index) => {
            const offset = dragOffset(index);
            const lifted = !!drag && index >= drag.from && index < drag.from + drag.len;
            const style: React.CSSProperties | undefined = drag
              ? {
                  transform: offset ? `translateY(${offset}px)` : undefined,
                  // The lifted rows track the finger exactly; the rest glide.
                  transition: lifted ? "none" : "transform 160ms ease",
                  position: "relative",
                  zIndex: lifted ? 10 : undefined,
                }
              : undefined;
            const refFn = (el: HTMLElement | null) => {
              if (el) rowRefs.current.set(item.id, el);
              else rowRefs.current.delete(item.id);
            };
            const gesture = {
              onHold: (clientY: number) => onRowHold(item, clientY),
              onSettings: () => onRowSettings(item),
              onDragMove: moveDrag,
              onRelease: onRowRelease,
              onCancel: () => endDrag(false),
            };

            if (item.type === "label") {
              const isCollapsed = collapsed.has(item.id);
              return (
                <LabelRow
                  key={item.id}
                  rowRef={refFn}
                  style={style}
                  lifted={lifted}
                  label={item.value}
                  collapsed={isCollapsed}
                  renaming={renamingId === item.id}
                  renameDraft={renameDraft}
                  setRenameDraft={setRenameDraft}
                  commitRename={commitRename}
                  cancelRename={() => setRenamingId(null)}
                  onTap={() => toggleWatchlistLabelCollapsed(item.id)}
                  {...gesture}
                />
              );
            }

            return (
              <SymbolRow
                key={item.id}
                item={item}
                rowRef={refFn}
                style={style}
                lifted={lifted}
                row={rows[item.value]}
                flash={flash[item.value] ?? null}
                isActive={item.value === symbol}
                isSelected={selected.has(item.id)}
                selectMode={selectMode}
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
                onTap={() => open(item)}
                {...gesture}
              />
            );
          })
        )}
        {items.length > 0 && !selectMode && (
          <p className="px-6 py-5 text-center text-xs text-tv-text-dim">
            Hold a symbol to move it · keep holding for its settings
          </p>
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
            <span className="block px-4 pt-3 pb-2 text-[10px] uppercase tracking-wider text-tv-text-muted">
              Sort
            </span>
            <div className="flex gap-2 px-4 pb-3">
              {([
                ["manual", "Manual"],
                ["price", "Price"],
                ["change", "24h change"],
              ] as const).map(([key, label]) => {
                const on = sort.key === key;
                return (
                  <button
                    key={key}
                    onClick={() =>
                      setWatchlistSort(
                        key === "manual"
                          ? { key: "manual", dir: "desc" }
                          : on
                            ? { key, dir: sort.dir === "desc" ? "asc" : "desc" }
                            : { key, dir: "desc" },
                      )
                    }
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-3 py-2 text-sm",
                      on ? "bg-tv-text text-tv-bg" : "bg-tv-panel-hover text-tv-text",
                    )}
                  >
                    {label}
                    {on && key !== "manual" && (sort.dir === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />)}
                  </button>
                );
              })}
            </div>
            <SheetAction icon={Type} label="Add section…" onClick={() => { addLabelHere(undefined); setManageOpen(false); }} />
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

      {/* Per-item settings: a sheet from the bottom edge, so the list it
          belongs to stays visible behind it. */}
      {actionsFor && active && (
        <MobileActionSheet
          title={actionsFor.type === "label" ? actionsFor.value : stripExchangePrefix(actionsFor.value)}
          onClose={() => setActionsFor(null)}
        >
          {actionsFor.type === "label" ? (
            <>
              <SheetAction icon={Pencil} label="Rename section…" onClick={() => startRename(actionsFor)} />
              <SheetAction
                icon={Plus}
                label="Add symbol here…"
                onClick={() => {
                  setSymbolDialogInsertAfterId(actionsFor.id);
                  openSymbolDialog(true);
                  setActionsFor(null);
                }}
              />
              <SheetAction
                icon={X}
                label="Remove section label"
                danger
                onClick={() => {
                  removeWatchlistItem(active.id, actionsFor.id);
                  setActionsFor(null);
                }}
              />
            </>
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
                label="Add section above"
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
        </MobileActionSheet>
      )}

      {/* "Move to list" picker — shared by the per-item sheet and the batch bar */}
      {moveListOpen && active && (
        <MobileActionSheet title="Move to…" onClose={() => setMoveListOpen(null)}>
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
        </MobileActionSheet>
      )}
    </div>
  );
}

/** Where a lift is, for rendering. */
interface DragView {
  id: string;
  /** Index of the lifted row in the displayed list. */
  from: number;
  /** Rows lifted together (a label carries its section). */
  len: number;
  blockH: number;
  /** How far the lifted rows are drawn from where they sit. */
  dy: number;
  /** The slot, among the rows not lifted, the block would drop into. */
  c: number;
}

interface DragSession {
  id: string;
  from: number;
  len: number;
  blockH: number;
  tops: number[];
  heights: number[];
  startContentY: number;
  startClientY: number;
  lastClientY: number;
  /** Whether the finger has travelled; a hold that never moves is a request
   *  for the row's settings, not a reorder. */
  moved: boolean;
  /** Current drop slot; kept here, not read from render state, so a release
   *  never acts on a slot one move out of date. */
  c: number;
  raf: number;
}

interface RowGesture {
  onHold: (clientY: number) => "drag" | "wait" | "done";
  onSettings: () => void;
  onDragMove: (clientY: number) => void;
  onRelease: () => void;
  onCancel: () => void;
}

/**
 * Tap, hold, or hold longer — TradingView's two-stage press.
 *
 *  - A tap is a quick touch that does not travel.
 *  - Held still for `LONG_PRESS_MS`, the phone buzzes and the row lifts: from
 *    then the finger drags it, until it comes off.
 *  - Held still for twice that, it buzzes again and the row's settings open
 *    instead; the lift is dropped where it started. Any movement past the
 *    slop before then commits to the drag and cancels this stage.
 *
 * Moving before the first stage completes is a scroll, and belongs to the
 * list.
 */
function useRowGesture(onTap: () => void, g: RowGesture) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const state = useRef<"idle" | "pressing" | "held" | "dragging">("idle");

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    if (settingsTimer.current) clearTimeout(settingsTimer.current);
    timer.current = null;
    settingsTimer.current = null;
  };

  return {
    onPointerDown(e: React.PointerEvent) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const el = e.currentTarget as HTMLElement;
      const id = e.pointerId;
      const y = e.clientY;
      start.current = { x: e.clientX, y };
      state.current = "pressing";
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        const r = g.onHold(y);
        if (r === "done") {
          state.current = "held";
          swallowNextClick();
          return;
        }
        state.current = r === "drag" ? "dragging" : "held";
        if (r === "drag") {
          try { el.setPointerCapture(id); } catch { /* pointer already gone */ }
        }
        settingsTimer.current = setTimeout(() => {
          settingsTimer.current = null;
          state.current = "held";
          g.onSettings();
        }, LONG_PRESS_MS);
      }, LONG_PRESS_MS);
    },
    onPointerMove(e: React.PointerEvent) {
      const s0 = start.current;
      const travelled =
        !!s0 && (Math.abs(e.clientX - s0.x) > LONG_PRESS_SLOP || Math.abs(e.clientY - s0.y) > LONG_PRESS_SLOP);
      if (state.current === "dragging") {
        // Moving means this is a drag: the settings stage is off.
        if (travelled && settingsTimer.current) {
          clearTimeout(settingsTimer.current);
          settingsTimer.current = null;
        }
        g.onDragMove(e.clientY);
        return;
      }
      if (state.current === "held" && travelled && settingsTimer.current) {
        clearTimeout(settingsTimer.current);
        settingsTimer.current = null;
        return;
      }
      if (state.current === "pressing" && travelled) {
        clear();
        state.current = "idle";
      }
    },
    onPointerUp() {
      const st = state.current;
      clear();
      state.current = "idle";
      if (st === "dragging") g.onRelease();
      else if (st === "pressing") onTap();
    },
    onPointerCancel() {
      const st = state.current;
      clear();
      state.current = "idle";
      if (st === "dragging") g.onCancel();
    },
  };
}

/** A section heading: tap folds it, hold lifts it with its section. */
function LabelRow({
  rowRef, style, lifted, label, collapsed, renaming, renameDraft, setRenameDraft,
  commitRename, cancelRename, onTap, ...g
}: RowGesture & {
  rowRef: (el: HTMLElement | null) => void;
  style?: React.CSSProperties;
  lifted: boolean;
  label: string;
  collapsed: boolean;
  renaming: boolean;
  renameDraft: string;
  setRenameDraft: (v: string) => void;
  commitRename: () => void;
  cancelRename: () => void;
  onTap: () => void;
}) {
  const handlers = useRowGesture(onTap, g);
  return (
    <div
      ref={rowRef}
      style={style}
      {...(renaming ? {} : handlers)}
      className={cn(
        "flex items-center gap-4 border-b border-tv-border px-5 py-4",
        lifted ? "bg-tv-panel-hover shadow-[0_8px_24px_rgba(0,0,0,0.6)]" : "bg-tv-bg active:bg-tv-panel-hover",
      )}
    >
      {collapsed ? (
        <ChevronRight className="h-5 w-5 shrink-0 text-tv-text" />
      ) : (
        <ChevronDown className="h-5 w-5 shrink-0 text-tv-text" />
      )}
      {renaming ? (
        <input
          autoFocus
          value={renameDraft}
          onChange={(e) => setRenameDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") cancelRename();
          }}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold uppercase tracking-wide text-tv-text outline-none"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold uppercase tracking-wide text-tv-text">
          {label}
        </span>
      )}
    </div>
  );
}

/** A symbol: tap opens its chart (or toggles it in select mode), hold lifts
 *  it to reorder, a longer hold opens its settings. */
function SymbolRow({
  item, rowRef, style, lifted, row, flash, isActive, isSelected, selectMode, posSide, hasAlert,
  onTap, ...g
}: RowGesture & {
  item: Extract<WatchlistItem, { type: "symbol" }>;
  rowRef: (el: HTMLElement | null) => void;
  style?: React.CSSProperties;
  lifted: boolean;
  row: Row | undefined;
  flash: "up" | "down" | null;
  isActive: boolean;
  isSelected: boolean;
  selectMode: boolean;
  posSide: "LONG" | "SHORT" | null;
  hasAlert: boolean;
  onTap: () => void;
}) {
  const s = item.value;
  const displaySymbol = stripExchangePrefix(s);
  const handlers = useRowGesture(onTap, g);
  const chg = row ? changeFromPct(row.price, row.pct) : null;

  return (
    <div
      ref={rowRef}
      style={style}
      {...handlers}
      className={cn(
        "relative flex items-stretch pl-4",
        lifted
          ? "bg-tv-panel-hover shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
          : isSelected
            ? "bg-tv-text/10"
            : isActive && !selectMode
              ? "bg-tv-panel"
              : "bg-tv-bg active:bg-tv-panel-hover",
      )}
    >
      {/* The flag hangs off the left edge, as TradingView's does: it marks
          the row without taking a column from it. */}
      {item.flagColor && !selectMode && (
        <span className="pointer-events-none absolute left-0 top-1/2 -translate-x-[3px] -translate-y-1/2">
          <FlagPennant color={item.flagColor} height={18} />
        </span>
      )}

      {selectMode && (
        <span className="flex shrink-0 items-center pr-3">
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full border-2",
              isSelected ? "border-tv-text bg-tv-text" : "border-tv-text-dim",
            )}
          >
            {isSelected && <span className="h-2 w-2 rounded-full bg-tv-bg" />}
          </span>
        </span>
      )}

      <span className="relative flex shrink-0 items-center py-3">
        <CoinIcon symbol={displaySymbol} size={40} />
        {hasAlert && (
          // Pinned to the icon, as TradingView does: the badge belongs to
          // the instrument, and a column would cost width on every row.
          <span
            className="absolute -right-1 top-2 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-tv-bg ring-2 ring-tv-bg"
            title="Alert set"
          >
            <span className="flex h-full w-full items-center justify-center rounded-full bg-tv-text">
              <Bell className="h-2.5 w-2.5 text-tv-bg" />
            </span>
          </span>
        )}
      </span>

      {/* The divider starts at the text, not at the icon — TradingView's,
          and what keeps a long list from reading as a spreadsheet. */}
      <div className="ml-3.5 flex min-w-0 flex-1 items-center gap-3 border-b border-tv-border py-3 pr-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5 text-[17px] font-semibold leading-tight text-tv-text">
            <span className="truncate">{posSide ? getBaseAsset(displaySymbol) : displaySymbol}</span>
            {posSide && <PositionSideBadge side={posSide} />}
          </span>
          <span className="truncate text-[14px] leading-tight text-tv-text-muted">
            {describeSymbol(s)}
          </span>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span
            className={cn(
              "text-[17px] font-medium leading-tight tabular-nums transition-colors",
              flash === "up" ? "text-tv-green" : flash === "down" ? "text-tv-red" : "text-tv-text",
            )}
          >
            {row ? formatPrice(row.price) : "—"}
          </span>
          <span
            className={cn(
              "flex items-baseline gap-2 text-[14px] leading-tight tabular-nums",
              row ? (row.pct >= 0 ? "text-tv-green" : "text-tv-red") : "text-tv-text-muted",
            )}
          >
            {chg !== null && <span>{formatChange(chg)}</span>}
            <span>{row ? formatPct(row.pct) : "—"}</span>
          </span>
        </div>
      </div>
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
