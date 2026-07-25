"use client";

import { useState } from "react";
import { BarChart2, Layers, List } from "lucide-react";
import { Watchlist } from "@/components/watchlist/Watchlist";
import { OrderPanel } from "@/components/trading/OrderPanel/OrderPanel";
import { ObjectTreePanel } from "@/components/chart/ObjectTreePanel";
import { cn } from "@/lib/utils";

type Tab = "watchlist" | "objects" | "trade";

export function RightSidebar() {
  const [tab, setTab] = useState<Tab>("watchlist");

  return (
    <aside className="flex w-64 flex-col border-l border-tv-border bg-tv-panel">
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
