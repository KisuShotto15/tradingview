"use client";

import { useRef, useState } from "react";
import { Pencil, MoreHorizontal, Redo2, Rewind, Undo2 } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { useMobileStore } from "@/lib/store/mobile-store";
import { useDrawings } from "@/lib/supabase/use-drawings";
import { useReplayStore } from "@/lib/replay/replay-store";
import { PriceChart } from "@/components/chart/PriceChart";
import { ChartTypeSelector } from "@/components/chart/ChartTypeSelector";
import { SnapshotButton } from "@/components/chart/SnapshotButton";
import { cn } from "@/lib/utils";

/**
 * Mobile chart screen.
 *
 * The toolbar sits at the **bottom**, under the chart and directly above the
 * tab bar, which is where TradingView's mobile chart puts it and why that
 * layout feels reachable: on a tall phone the top of the screen is the one
 * place a thumb cannot get to without shifting grip, and every one of these
 * controls is used mid-analysis. Moving it down also hands the chart the full
 * height of the screen, which is the thing the user is actually looking at.
 *
 * It carries: symbol chip (swipe up/down → previous/next symbol in the active
 * watchlist), timeframe chip (swipe up/down → previous/next *pinned*
 * timeframe, tap → full picker), chart type, undo/redo, drawing tools,
 * replay, snapshot, and a "…" for indicators.
 *
 * There is deliberately no separate header: `PriceChart`'s own legend line
 * already reads "BTCUSDT.P · 5m · Binance 67,440.03 −0.53%", so a top bar
 * repeating the symbol and price would cost a row of chart for nothing.
 *
 * The chart itself uses the existing desktop <PriceChart /> — it already
 * supports pinch-zoom and pan on touch devices. `ChartTypeSelector` and
 * `SnapshotButton` are reused as-is from desktop: both are built on the
 * shared `DropdownMenu` primitive (tap-triggered, not hover), so they need
 * no touch adaptation.
 */
export function ChartScreen() {
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const setTimeframe = useChartStore((s) => s.setTimeframe);
  const pinnedTimeframes = useChartStore((s) => s.pinnedTimeframes);
  const watchlists = useChartStore((s) => s.watchlists);
  const activeWatchlistId = useChartStore((s) => s.activeWatchlistId);
  const openSheet = useMobileStore((s) => s.openSheet);
  const { undo, redo } = useDrawings();
  const replayActive = useReplayStore((s) => s.active);
  const enterReplayPicking = useReplayStore((s) => s.enterPicking);

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
  // Cycles the *pinned* timeframes (same "quick access" list desktop's
  // header shows as chips) — the full set lives behind the tap-to-open sheet.
  function nextTimeframe(dir: 1 | -1) {
    setTimeframe(cycle(pinnedTimeframes.length > 0 ? pinnedTimeframes : [timeframe], timeframe, dir));
  }

  return (
    <div className="flex h-full flex-col">
      {/* Chart first: it gets the whole screen above the toolbar. */}
      <div className="relative min-h-0 flex-1">
        <PriceChart symbol={symbol} timeframe={timeframe} />
      </div>

      {/* Toolbar — scrolls horizontally rather than wrapping or clipping on a
          narrow phone, since it packs in every desktop header action. */}
      <footer className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-tv-border bg-tv-panel px-2 py-1.5 [@media(max-height:500px)]:py-0.5">
        <SwipeChip
          label={symbol}
          onSwipe={nextSymbol}
          onTap={() => openSheet("symbolSearch")}
          ariaLabel="Symbol — tap to search, swipe to switch"
        />
        <SwipeChip
          label={timeframe.toUpperCase()}
          onSwipe={nextTimeframe}
          onTap={() => openSheet("timeframe")}
          ariaLabel="Timeframe — tap to pick, swipe to cycle pinned"
          compact
        />
        <div className="shrink-0">
          <ChartTypeSelector />
        </div>
        <button
          onClick={() => openSheet("drawings")}
          className="shrink-0 rounded p-1.5 text-tv-text-muted active:bg-tv-panel-hover"
          aria-label="Drawing tools"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => openSheet("indicators")}
          className="shrink-0 rounded p-1.5 text-tv-text-muted active:bg-tv-panel-hover"
          aria-label="Indicators"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>

        {/* Secondary actions, after a divider. The bar scrolls, so ordering is
            what decides which controls are reachable without a swipe — symbol,
            timeframe, chart type, drawing and indicators are the five a chart
            user reaches for, and they now all fit on screen. */}
        <span className="mx-0.5 h-5 w-px shrink-0 bg-tv-border" />
        <button
          onClick={() => void undo()}
          className="shrink-0 rounded p-1.5 text-tv-text-muted active:bg-tv-panel-hover"
          aria-label="Undo"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={() => void redo()}
          className="shrink-0 rounded p-1.5 text-tv-text-muted active:bg-tv-panel-hover"
          aria-label="Redo"
        >
          <Redo2 className="h-4 w-4" />
        </button>
        {!replayActive && (
          <button
            onClick={enterReplayPicking}
            className="shrink-0 rounded p-1.5 text-tv-text-muted active:bg-tv-panel-hover"
            aria-label="Bar replay"
          >
            <Rewind className="h-4 w-4" />
          </button>
        )}
        <div className="shrink-0">
          <SnapshotButton />
        </div>
      </footer>
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
        "shrink-0 select-none rounded border border-tv-border bg-tv-bg text-sm font-semibold transition-colors",
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
