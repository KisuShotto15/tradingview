"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Magnet, Search, Star, Trash2, X } from "lucide-react";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useDrawings } from "@/lib/supabase/use-drawings";
import { useMobileStore } from "@/lib/store/mobile-store";
import { useBackHandler } from "@/lib/mobile/back-stack";
import type { Drawing, AlertConfig } from "@/lib/drawings/types";
import { cn } from "@/lib/utils";
import {
  ALL_TOOLS,
  CURSOR_TOOLS,
  LABELED_GROUPS,
  groupTools,
  type ToolDef,
} from "@/components/layout/drawing-tools";

interface Section {
  id: string;
  label: string;
  tools: ToolDef[];
}

/** How far a downward swipe on the grabber has to travel to dismiss. */
const DISMISS_PX = 90;

/**
 * The drawing-tools picker on a phone: a bottom sheet in the shape of
 * TradingView's own — grabber, search, a strip of category tabs, and each
 * category as a grid of tool cards with a favourite star in the corner.
 *
 * The catalog is still the desktop one (`drawing-tools.ts`), so a tool added
 * there appears here with no second list to keep. What this adds is what the
 * desktop sidebar reaches by right-click or keeps at its foot: favouriting,
 * the magnet and its strength (a phone has no Ctrl, so the footer's segmented
 * control is the only way to the other behaviour), snapping to indicators,
 * the alert on the selected line, and clearing the symbol's drawings.
 *
 * The tabs jump to a section and follow the scroll, rather than filtering:
 * the whole catalog stays one swipe away, which is how TradingView's work.
 */
export function MobileDrawingsSheet() {
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const symbol = useChartStore((s) => s.symbol);
  const favoriteTools = useChartStore((s) => s.favoriteTools);
  const toggleFavoriteTool = useChartStore((s) => s.toggleFavoriteTool);
  const magnetMode = useChartStore((s) => s.magnetMode);
  const toggleMagnetMode = useChartStore((s) => s.toggleMagnetMode);
  const magnetStrength = useChartStore((s) => s.magnetStrength);
  const setMagnetStrength = useChartStore((s) => s.setMagnetStrength);
  const magnetIndicators = useChartStore((s) => s.magnetIndicators);
  const toggleMagnetIndicators = useChartStore((s) => s.toggleMagnetIndicators);
  const selectedId = useDrawingsStore((s) => s.selectedId);
  const drawings = useDrawingsStore((s) => s.drawings);
  const { clear: clearDrawings, update } = useDrawings();
  const closeSheet = useMobileStore((s) => s.closeSheet);

  useBackHandler(true, closeSheet);

  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [dragY, setDragY] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const sectionEls = useRef(new Map<string, HTMLElement>());
  /** Set while a tab tap is smooth-scrolling, so the spy doesn't flicker. */
  const jumping = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ id: number; y0: number } | null>(null);

  const selected = drawings.find((d) => d.id === selectedId);
  const canAlert =
    !!selected &&
    (selected.kind === "hline" ||
      selected.kind === "hray" ||
      selected.kind === "trendline" ||
      selected.kind === "ray");
  const alertOn = canAlert ? !!selected?.alert?.enabled : false;
  const symbolDrawings = drawings.filter((d) => d.symbol === symbol).length;

  const sections = useMemo<Section[]>(() => {
    const favorites = favoriteTools
      .map((k) => ALL_TOOLS[k])
      .filter((t): t is ToolDef => !!t);
    const measure = LABELED_GROUPS.find((g) => g.label === "Measure");
    const out: Section[] = [];
    if (favorites.length > 0) out.push({ id: "favorites", label: "Favorites", tools: favorites });
    // The cursor and the ruler are each a group of one on desktop; side by
    // side they make a section instead of two lonely cards.
    out.push({
      id: "general",
      label: "General",
      tools: [...CURSOR_TOOLS, ...(measure ? groupTools(measure) : [])],
    });
    for (const g of LABELED_GROUPS) {
      if (g === measure || !g.label) continue;
      out.push({ id: g.label.toLowerCase(), label: g.label, tools: groupTools(g) });
    }
    return out;
  }, [favoriteTools]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return null;
    const seen = new Set<DrawingTool>();
    const hits: ToolDef[] = [];
    for (const s of sections) {
      if (s.id === "favorites") continue;
      for (const t of s.tools) {
        if (seen.has(t.key)) continue;
        const hay = `${t.label} ${t.hint ?? ""} ${s.label}`.toLowerCase();
        if (hay.includes(q)) {
          seen.add(t.key);
          hits.push(t);
        }
      }
    }
    return hits;
  }, [q, sections]);

  const currentTab = activeId ?? sections[0]?.id ?? null;

  // Keep the highlighted tab visible in its strip as the spy moves it.
  useEffect(() => {
    const strip = tabsRef.current;
    const pill = currentTab ? strip?.querySelector<HTMLElement>(`[data-tab="${currentTab}"]`) : null;
    if (!strip || !pill) return;
    const left = pill.offsetLeft - 16;
    const right = pill.offsetLeft + pill.offsetWidth + 16 - strip.clientWidth;
    if (strip.scrollLeft > left) strip.scrollTo({ left, behavior: "smooth" });
    else if (strip.scrollLeft < right) strip.scrollTo({ left: right, behavior: "smooth" });
  }, [currentTab]);

  // A pending "tap again to clear" expires rather than lying in wait.
  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(t);
  }, [confirmClear]);

  function onScroll() {
    if (results || jumping.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    let id = sections[0]?.id ?? null;
    for (const s of sections) {
      const sec = sectionEls.current.get(s.id);
      if (sec && sec.offsetTop <= el.scrollTop + 24) id = s.id;
    }
    if (atBottom) id = sections[sections.length - 1]?.id ?? id;
    if (id !== activeId) setActiveId(id);
  }

  function jumpTo(id: string) {
    const el = scrollRef.current;
    const sec = sectionEls.current.get(id);
    if (!el || !sec) return;
    setActiveId(id);
    if (jumping.current) clearTimeout(jumping.current);
    jumping.current = setTimeout(() => {
      jumping.current = null;
    }, 500);
    el.scrollTo({ top: sec.offsetTop - 8, behavior: "smooth" });
  }

  function pick(t: DrawingTool) {
    setTool(t);
    closeSheet();
  }

  function setMagnet(mode: "off" | "weak" | "strong") {
    if (mode === "off") {
      if (magnetMode) toggleMagnetMode();
    } else {
      setMagnetStrength(mode); // also switches the magnet on
    }
  }

  function toggleAlert() {
    if (!selected || !canAlert) return;
    const next: AlertConfig = { enabled: !alertOn, sound: true, direction: "cross", lastTriggeredAt: undefined };
    void update(selected.id, { alert: next } as Partial<Drawing>);
  }

  function onClear() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    void clearDrawings(symbol);
  }

  // Swipe the grabber down to dismiss — the gesture a bottom sheet promises.
  const grabberHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      drag.current = { id: e.pointerId, y0: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (drag.current?.id !== e.pointerId) return;
      setDragY(Math.max(0, e.clientY - drag.current.y0));
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (drag.current?.id !== e.pointerId) return;
      const dy = e.clientY - drag.current.y0;
      drag.current = null;
      if (dy > DISMISS_PX) closeSheet();
      else setDragY(0);
    },
    onPointerCancel: () => {
      drag.current = null;
      setDragY(0);
    },
  };

  const magnetValue = magnetMode ? magnetStrength : "off";
  const magnetHint =
    magnetValue === "off"
      ? "Free placement"
      : magnetValue === "strong"
        ? "Always snaps to a bar"
        : "Snaps near a bar";

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Drawings">
      <button
        aria-label="Close"
        onClick={closeSheet}
        className="absolute inset-0 bg-black/60 animate-in fade-in duration-200"
      />

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex h-[82dvh] flex-col overflow-hidden rounded-t-2xl border-t border-tv-border bg-tv-panel shadow-[0_-12px_40px_rgba(0,0,0,0.6)]",
          "animate-in slide-in-from-bottom duration-300",
          dragY === 0 && "transition-transform duration-200",
        )}
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined }}
      >
        {/* Grabber + title: the swipe-down target */}
        <div className="shrink-0 touch-none select-none" {...grabberHandlers}>
          <div className="flex justify-center pt-2.5 pb-1">
            <span className="h-1 w-10 rounded-full bg-tv-text-dim" />
          </div>
          <div className="flex items-center justify-between px-4 pt-1 pb-3">
            <h2 className="text-xl font-semibold tracking-tight text-tv-text">Drawings</h2>
            {tool !== "cursor" && ALL_TOOLS[tool] && (
              <span className="rounded-full bg-tv-text/10 px-2.5 py-1 text-xs text-tv-text">
                {ALL_TOOLS[tool]!.label}
              </span>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="shrink-0 px-4">
          <label className="flex h-11 items-center gap-2.5 rounded-xl bg-tv-panel-hover px-3.5 ring-1 ring-transparent focus-within:ring-tv-text-dim">
            <Search className="h-[18px] w-[18px] shrink-0 text-tv-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-tv-text outline-none placeholder:text-tv-text-dim"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="-mr-1 rounded-full p-1 text-tv-text-muted active:bg-tv-text/10"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
        </div>

        {/* Category tabs */}
        {!results && (
          <div
            ref={tabsRef}
            className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto px-4 pt-3 pb-2"
          >
            {sections.map((s) => (
              <button
                key={s.id}
                data-tab={s.id}
                onClick={() => jumpTo(s.id)}
                className={cn(
                  "shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                  currentTab === s.id
                    ? "bg-tv-text/12 text-tv-text"
                    : "text-tv-text-muted active:bg-tv-text/5",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4"
        >
          {canAlert && !results && (
            <button
              onClick={toggleAlert}
              className="mt-2 flex w-full items-center gap-3 rounded-xl bg-tv-panel-hover px-3.5 py-3 text-left active:bg-tv-text/10"
            >
              <Bell className={cn("h-5 w-5", alertOn ? "text-tv-text" : "text-tv-text-muted")} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium text-tv-text">Alert on selected line</span>
                <span className="text-xs text-tv-text-muted">Sound + toast when price crosses it</span>
              </div>
              <Toggle on={alertOn} />
            </button>
          )}

          {results ? (
            results.length > 0 ? (
              <ToolGrid
                tools={results}
                activeTool={tool}
                favoriteTools={favoriteTools}
                onPick={pick}
                onToggleFavorite={toggleFavoriteTool}
                className="pt-3"
              />
            ) : (
              <p className="py-12 text-center text-sm text-tv-text-muted">
                No drawing tools match “{query.trim()}”
              </p>
            )
          ) : (
            sections.map((s) => (
              <section
                key={s.id}
                ref={(el) => {
                  if (el) sectionEls.current.set(s.id, el);
                  else sectionEls.current.delete(s.id);
                }}
              >
                <h3 className="pt-5 pb-2.5 text-xs font-semibold uppercase tracking-wider text-tv-text-muted">
                  {s.label}
                </h3>
                <ToolGrid
                  tools={s.tools}
                  activeTool={tool}
                  favoriteTools={favoriteTools}
                  onPick={pick}
                  onToggleFavorite={toggleFavoriteTool}
                />
              </section>
            ))
          )}

          {!results && (
            <section>
              <h3 className="pt-6 pb-2.5 text-xs font-semibold uppercase tracking-wider text-tv-text-muted">
                Settings
              </h3>
              <div className="overflow-hidden rounded-xl bg-tv-panel-hover">
                <button
                  onClick={toggleMagnetIndicators}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-tv-text/10"
                >
                  <Magnet className="h-5 w-5 text-tv-text-muted" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-tv-text">Snap to indicators</span>
                    <span className="text-xs text-tv-text-muted">Pull to EMA and VWAP lines too</span>
                  </div>
                  <Toggle on={magnetIndicators} />
                </button>
                <div className="mx-3.5 h-px bg-tv-border" />
                <button
                  onClick={onClear}
                  disabled={symbolDrawings === 0}
                  className={cn(
                    "flex w-full items-center gap-3 px-3.5 py-3 text-left text-tv-red active:bg-tv-red/10 disabled:opacity-40",
                    confirmClear && "bg-tv-red/10",
                  )}
                >
                  <Trash2 className="h-5 w-5" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium">
                      {confirmClear ? "Tap again to clear" : "Clear drawings"}
                    </span>
                    <span className="text-xs text-tv-text-muted">
                      {symbolDrawings === 0
                        ? "Nothing drawn on this symbol"
                        : `${symbolDrawings} on ${symbol}`}
                    </span>
                  </div>
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Magnet: always in reach, the way TradingView keeps its footer toggle */}
        <div
          className="shrink-0 border-t border-tv-border bg-tv-panel px-4 pt-3"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center gap-3">
            <Magnet className={cn("h-5 w-5 shrink-0", magnetMode ? "text-tv-text" : "text-tv-text-muted")} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium text-tv-text">Magnet</span>
              <span className="truncate text-xs text-tv-text-muted">{magnetHint}</span>
            </div>
            <div className="flex shrink-0 rounded-lg bg-tv-panel-hover p-0.5" role="radiogroup" aria-label="Magnet">
              {(["off", "weak", "strong"] as const).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={magnetValue === m}
                  onClick={() => setMagnet(m)}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition-colors",
                    magnetValue === m ? "bg-tv-text text-tv-bg" : "text-tv-text-muted",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolGrid({
  tools, activeTool, favoriteTools, onPick, onToggleFavorite, className,
}: {
  tools: ToolDef[];
  activeTool: DrawingTool;
  favoriteTools: DrawingTool[];
  onPick: (t: DrawingTool) => void;
  onToggleFavorite: (t: DrawingTool) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {tools.map((t) => {
        const Icon = t.icon;
        const active = activeTool === t.key;
        const isFav = favoriteTools.includes(t.key);
        return (
          <div
            key={t.key}
            className={cn(
              /*
               * The tool icons fill their anchor dots with --color-tv-panel so
               * a dot reads as a hollow ring over its line. On a card that
               * would be a dark disc on a lighter tile, so the card hands its
               * own colour down under that name.
               */
              "relative rounded-xl bg-[var(--card)] [--card:var(--color-tv-panel-hover)] [--color-tv-panel:var(--card)]",
              "ring-1 ring-inset transition-colors",
              active ? "ring-tv-text [--card:#232323]" : "ring-transparent",
            )}
          >
            <button
              onClick={() => onPick(t.key)}
              className="flex h-[92px] w-full flex-col items-center justify-center gap-2 rounded-xl px-1.5 active:bg-tv-text/10"
            >
              <Icon className={cn("h-7 w-7", active ? "text-tv-text" : "text-tv-text/85")} />
              <span className="line-clamp-2 text-center text-[13px] leading-tight text-tv-text">
                {t.label}
              </span>
            </button>
            <button
              onClick={() => onToggleFavorite(t.key)}
              aria-label={isFav ? `Remove ${t.label} from favorites` : `Add ${t.label} to favorites`}
              aria-pressed={isFav}
              className="absolute top-0 right-0 flex h-9 w-9 items-center justify-center rounded-tr-xl"
            >
              <Star
                className={cn(
                  "h-4 w-4 transition-colors",
                  isFav ? "fill-tv-yellow text-tv-yellow" : "text-tv-text-dim",
                )}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full transition-colors",
        on ? "bg-tv-text" : "bg-tv-text-dim/60",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full shadow transition-all",
          on ? "left-[18px] bg-tv-bg" : "left-0.5 bg-tv-text",
        )}
      />
    </span>
  );
}
