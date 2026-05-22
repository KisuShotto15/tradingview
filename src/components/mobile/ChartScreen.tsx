"use client";

import { useRef, useState } from "react";
import { Pencil, MoreHorizontal } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { useMobileStore } from "@/lib/store/mobile-store";
import { PriceChart } from "@/components/chart/PriceChart";
import { cn } from "@/lib/utils";
import type { Timeframe } from "@/lib/binance/types";

/**
 * Mobile chart screen.
 *
 * Top bar: symbol chip (swipe up/down → previous/next symbol in active
 * watchlist), timeframe chip (swipe up/down → previous/next timeframe),
 * pencil (drawings), … (indicators / alerts / settings menu).
 *
 * The chart itself uses the existing desktop <PriceChart /> — it already
 * supports pinch-zoom and pan on touch devices.
 */

const TIMEFRAMES: Timeframe[] = [
  "1m", "3m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
];

export function ChartScreen() {
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const setTimeframe = useChartStore((s) => s.setTimeframe);
  const watchlists = useChartStore((s) => s.watchlists);
  const activeWatchlistId = useChartStore((s) => s.activeWatchlistId);
  const openSheet = useMobileStore((s) => s.openSheet);

  // Build the rotating symbol list from the active watchlist.
  const wlSymbols = (() => {
    const w = watchlists.find((x) => x.id === activeWatchlistId);
    const list = (w?.items ?? []).filter((i) => i.type === "symbol").map((i) => i.value);
    return list.length > 0 ? list : [symbol];
  })();

  function cycle<T>(arr: T[], cur: T, dir: 1 | -1): T {
    if (arr.length === 0) return cur;
    const idx = arr.indexOf(cur);
    const next = idx === -1 ? 0 : (idx + dir + arr.length) % arr.length;
    return arr[next];
  }

  function nextSymbol(dir: 1 | -1) { setSymbol(cycle(wlSymbols, symbol, dir)); }
  function nextTimeframe(dir: 1 | -1) { setTimeframe(cycle(TIMEFRAMES, timeframe, dir)); }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-2 border-b border-tv-border bg-tv-panel px-2 py-1.5">
        <SwipeChip
          label={symbol}
          onSwipe={nextSymbol}
          onTap={() => openSheet("symbolSearch")}
          ariaLabel="Symbol — tap to search, swipe to switch"
        />
        <SwipeChip
          label={timeframe.toUpperCase()}
          onSwipe={nextTimeframe}
          onTap={() => openSheet("indicators") /* later: dedicated TF sheet */}
          ariaLabel="Timeframe — swipe to cycle"
          compact
        />
        <button
          onClick={() => openSheet("drawings")}
          className="rounded p-1.5 text-tv-text-muted active:bg-tv-panel-hover"
          aria-label="Drawing tools"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => openSheet("indicators")}
          className="rounded p-1.5 text-tv-text-muted active:bg-tv-panel-hover"
          aria-label="More — indicators, alerts, settings"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </header>

      {/* Chart */}
      <div className="relative min-h-0 flex-1">
        <PriceChart symbol={symbol} timeframe={timeframe} />
      </div>
    </div>
  );
}

/**
 * A chip with swipe-up / swipe-down detection (and a tap fallback).
 * Uses passive pointer events so it does not interfere with native scrolling.
 */
function SwipeChip({
  label, onSwipe, onTap, ariaLabel, compact,
}: {
  label: string;
  onSwipe: (dir: 1 | -1) => void;
  onTap: () => void;
  ariaLabel: string;
  compact?: boolean;
}) {
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const [active, setActive] = useState(false);

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={cn(
        "select-none rounded border border-tv-border bg-tv-bg text-sm font-semibold transition-colors",
        compact ? "px-2 py-1 text-xs" : "px-2.5 py-1",
        active && "bg-tv-panel-hover",
      )}
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
        setActive(true);
      }}
      onPointerUp={(e) => {
        setActive(false);
        const s = startRef.current;
        startRef.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        const dt = Date.now() - s.t;
        const SWIPE_PX = 24;
        // Vertical swipe wins — sign convention: swipe DOWN (positive dy) = previous,
        // swipe UP (negative dy) = next, matching how a wheel feels.
        if (Math.abs(dy) > SWIPE_PX && Math.abs(dy) > Math.abs(dx)) {
          onSwipe(dy < 0 ? 1 : -1);
        } else if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && dt < 400) {
          onTap();
        }
      }}
      onPointerCancel={() => {
        startRef.current = null;
        setActive(false);
      }}
    >
      {label}
    </button>
  );
}
