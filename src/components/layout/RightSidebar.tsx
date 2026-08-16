"use client";

import { useRef, useState } from "react";
import { BarChart2, Layers, List } from "lucide-react";
import { Watchlist } from "@/components/watchlist/Watchlist";
import { OrderPanel } from "@/components/trading/OrderPanel/OrderPanel";
import { ObjectTreePanel } from "@/components/chart/ObjectTreePanel";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

type Tab = "watchlist" | "objects" | "trade";

export function RightSidebar() {
  const [tab, setTab] = useState<Tab>("watchlist");
  const width = useChartStore((s) => s.rightSidebarWidth);
  const setWidth = useChartStore((s) => s.setRightSidebarWidth);

  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [resizing, setResizing] = useState(false);

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };
    setResizing(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onResizeMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    // The sidebar sits on the right edge, so dragging the left border left
    // (negative dx) grows it and dragging right shrinks it.
    const dx = e.clientX - dragRef.current.startX;
    // Leave room for the chart column so it can never be squeezed to nothing;
    // the store applies the absolute bounds on top of this.
    const maxWidth = Math.max(200, window.innerWidth - 420);
    setWidth(Math.min(maxWidth, dragRef.current.startWidth - dx));
  }
  function endResize(e: React.PointerEvent) {
    dragRef.current = null;
    setResizing(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  return (
    <aside
      className="relative flex shrink-0 flex-col border-l border-tv-border bg-tv-panel"
      style={{ width }}
    >
      {/* Resize handle — drag the left edge to resize */}
      <div
        onPointerDown={startResize}
        onPointerMove={onResizeMove}
        onPointerUp={endResize}
        className={cn(
          "absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize",
          resizing && "bg-tv-blue/30",
        )}
      />
      {/* Tab bar */}
      <div className="flex border-b border-tv-border">
        <button
          onClick={() => setTab("watchlist")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-colors",
            tab === "watchlist"
              ? "border-b-2 border-tv-blue text-tv-blue"
              : "text-tv-text-muted hover:text-tv-text",
          )}
        >
          <List className="h-3.5 w-3.5" />
          Watchlist
        </button>
        <button
          onClick={() => setTab("objects")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-colors",
            tab === "objects"
              ? "border-b-2 border-tv-blue text-tv-blue"
              : "text-tv-text-muted hover:text-tv-text",
          )}
        >
          <Layers className="h-3.5 w-3.5" />
          Objects
        </button>
        <button
          onClick={() => setTab("trade")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-colors",
            tab === "trade"
              ? "border-b-2 border-tv-blue text-tv-blue"
              : "text-tv-text-muted hover:text-tv-text",
          )}
        >
          <BarChart2 className="h-3.5 w-3.5" />
          Trade
        </button>
      </div>

      {/* Content */}
      <div className={cn("flex-1 overflow-hidden", tab !== "watchlist" && "hidden")}>
        <Watchlist />
      </div>
      <div className={cn("flex-1 overflow-hidden", tab !== "objects" && "hidden")}>
        <ObjectTreePanel />
      </div>
      <div className={cn("flex-1 overflow-hidden", tab !== "trade" && "hidden")}>
        <OrderPanel />
      </div>
    </aside>
  );
}
