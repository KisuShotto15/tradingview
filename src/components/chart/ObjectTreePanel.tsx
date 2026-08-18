"use client";

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarRange,
  ChevronsDown,
  ChevronsUp,
  Eye,
  EyeOff,
  GitFork,
  GripVertical,
  Highlighter,
  Layers3,
  Lock,
  MessageSquare,
  Minus,
  MoveRight,
  Pencil,
  Percent,
  RectangleHorizontal,
  Ruler,
  Slash,
  Spline,
  Trash2,
  TrendingUp,
  Type,
  Unlock,
  type LucideIcon,
} from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useDrawings } from "@/lib/supabase/use-drawings";
import type { Drawing, DrawingKind } from "@/lib/drawings/types";
import { cn } from "@/lib/utils";

const KIND_META: Record<DrawingKind, { label: string; icon: LucideIcon }> = {
  hline: { label: "Horizontal line", icon: Minus },
  vline: { label: "Vertical line", icon: GripVertical },
  trendline: { label: "Trend line", icon: TrendingUp },
  ray: { label: "Ray", icon: Slash },
  hray: { label: "Horizontal ray", icon: MoveRight },
  "parallel-channel": { label: "Parallel channel", icon: Layers3 },
  "fib-retracement": { label: "Fib retracement", icon: Percent },
  "price-range": { label: "Price range", icon: RectangleHorizontal },
  "date-range": { label: "Date range", icon: CalendarRange },
  long: { label: "Long position", icon: TrendingUp },
  short: { label: "Short position", icon: TrendingUp },
  brush: { label: "Brush", icon: Pencil },
  highlighter: { label: "Highlighter", icon: Highlighter },
  rectangle: { label: "Rectangle", icon: RectangleHorizontal },
  arrow: { label: "Arrow", icon: ArrowUpRight },
  text: { label: "Text", icon: Type },
  "fib-extension": { label: "Fib extension", icon: Percent },
  pitchfork: { label: "Pitchfork", icon: GitFork },
  callout: { label: "Callout", icon: MessageSquare },
  xabcd: { label: "XABCD pattern", icon: Spline },
};

function metaFor(kind: DrawingKind) {
  return KIND_META[kind] ?? { label: kind, icon: Ruler };
}

export function ObjectTreePanel() {
  const symbol = useChartStore((s) => s.symbol);
  const drawings = useDrawingsStore((s) => s.drawings);
  const selectedId = useDrawingsStore((s) => s.selectedId);
  const setSelected = useDrawingsStore((s) => s.setSelected);
  const { update, remove, reorder, setOrder } = useDrawings();

  // Front-most (last in the array) at the top of the list, TradingView-style.
  const items = drawings.filter((d) => d.symbol === symbol).slice().reverse();

  const draggedId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function toggleHidden(d: Drawing) {
    void update(d.id, { hidden: !d.hidden });
  }
  function toggleLocked(d: Drawing) {
    void update(d.id, { locked: !d.locked });
  }

  function handleDrop(targetId: string) {
    const fromId = draggedId.current;
    draggedId.current = null;
    setDragOverId(null);
    if (!fromId || fromId === targetId) return;
    const from = items.findIndex((d) => d.id === fromId);
    const to = items.findIndex((d) => d.id === targetId);
    if (from === -1 || to === -1) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    // items is displayed front-most-first; setOrder expects the underlying
    // back-to-front array order, same as `drawings` itself.
    void setOrder(symbol, next.map((d) => d.id).reverse());
  }

  return (
    <div className="flex h-full flex-col text-tv-text">
      <div className="flex items-center justify-between border-b border-tv-border px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Objects
        </span>
        <span className="text-[11px] text-tv-text-dim">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-[11px] text-tv-text-dim">
          No drawings on {symbol}. Pick a tool from the left toolbar to start.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto py-1">
          {items.map((d, i) => {
            const { label, icon: Icon } = metaFor(d.kind);
            const isSelected = d.id === selectedId;
            const isFirst = i === 0; // front-most
            const isLast = i === items.length - 1; // back-most
            return (
              <div
                key={d.id}
                draggable
                onDragStart={() => { draggedId.current = d.id; }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggedId.current !== d.id) setDragOverId(d.id);
                }}
                onDrop={() => handleDrop(d.id)}
                onDragEnd={() => { draggedId.current = null; setDragOverId(null); }}
                onClick={() => setSelected(isSelected ? null : d.id)}
                className={cn(
                  "group flex cursor-grab items-center gap-1.5 px-2 py-1 text-[12px] transition-colors active:cursor-grabbing",
                  isSelected ? "bg-tv-blue/15" : "hover:bg-tv-panel-hover",
                  d.hidden && "opacity-50",
                  dragOverId === d.id && "border-t-2 border-t-tv-blue",
                )}
              >
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm"
                  style={{ color: d.color ?? "var(--color-tv-text-muted)" }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate">{label}</span>

                {/* Reorder */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void reorder(d.id, "front");
                  }}
                  disabled={isFirst}
                  aria-label="Bring to front"
                  title="Bring to front"
                  className="flex h-5 w-5 items-center justify-center rounded text-tv-text-dim opacity-0 hover:bg-tv-border hover:text-tv-text group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
                >
                  <ChevronsUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void reorder(d.id, "forward");
                  }}
                  disabled={isFirst}
                  aria-label="Bring forward"
                  title="Bring forward"
                  className="flex h-5 w-5 items-center justify-center rounded text-tv-text-dim opacity-0 hover:bg-tv-border hover:text-tv-text group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void reorder(d.id, "backward");
                  }}
                  disabled={isLast}
                  aria-label="Send backward"
                  title="Send backward"
                  className="flex h-5 w-5 items-center justify-center rounded text-tv-text-dim opacity-0 hover:bg-tv-border hover:text-tv-text group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void reorder(d.id, "back");
                  }}
                  disabled={isLast}
                  aria-label="Send to back"
                  title="Send to back"
                  className="flex h-5 w-5 items-center justify-center rounded text-tv-text-dim opacity-0 hover:bg-tv-border hover:text-tv-text group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
                >
                  <ChevronsDown className="h-3.5 w-3.5" />
                </button>

                {/* Hide / lock / delete */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleHidden(d);
                  }}
                  aria-label={d.hidden ? "Show" : "Hide"}
                  title={d.hidden ? "Show" : "Hide"}
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded hover:bg-tv-border hover:text-tv-text",
                    d.hidden ? "text-tv-text-muted opacity-100" : "text-tv-text-dim opacity-0 group-hover:opacity-100",
                  )}
                >
                  {d.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLocked(d);
                  }}
                  aria-label={d.locked ? "Unlock" : "Lock"}
                  title={d.locked ? "Unlock" : "Lock"}
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded hover:bg-tv-border hover:text-tv-text",
                    d.locked ? "text-tv-yellow opacity-100" : "text-tv-text-dim opacity-0 group-hover:opacity-100",
                  )}
                >
                  {d.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(d.id);
                  }}
                  aria-label="Delete"
                  title="Delete"
                  className="flex h-5 w-5 items-center justify-center rounded text-tv-text-dim opacity-0 hover:bg-tv-border hover:text-tv-red group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
