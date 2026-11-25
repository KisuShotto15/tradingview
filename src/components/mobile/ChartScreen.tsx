"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, Magnet, MoreHorizontal, Pencil, Redo2, Rewind, Undo2 } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { useMobileStore } from "@/lib/store/mobile-store";
import { useDrawings } from "@/lib/supabase/use-drawings";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useReplayStore } from "@/lib/replay/replay-store";
import { PriceChart } from "@/components/chart/PriceChart";
import { timeframeLabel } from "@/lib/chart/coords";
import { ChartTypeSelector } from "@/components/chart/ChartTypeSelector";
import { SnapshotButton } from "@/components/chart/SnapshotButton";
import { cn } from "@/lib/utils";

/** Long enough to read as motion, short enough not to delay a fast series of
 *  swipes through a watchlist. */
const SWIPE_ANIM_MS = 180;

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
  const tool = useChartStore((s) => s.tool);
  const magnetMode = useChartStore((s) => s.magnetMode);
  const toggleMagnetMode = useChartStore((s) => s.toggleMagnetMode);
  const selectedDrawingId = useDrawingsStore((s) => s.selectedId);
  const { undo, redo } = useDrawings();

  /**
   * The magnet only earns a slot in the bar while it can do something: with a
   * tool armed (it snaps each point as you place it) or with a drawing
   * selected (it snaps while you drag). It lives in the drawing-tools sheet
   * too, but that sheet closes the moment you pick a tool — so by the time
   * the magnet matters, the only way to reach it there is to reopen the sheet
   * and scroll back past the tool you just chose, which is how it came across
   * as not existing at all.
   */
  const toolArmed = tool !== "cursor" && tool !== "eraser";
  const showMagnet = toolArmed || selectedDrawingId !== null;
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
      <footer className="no-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-t border-tv-border bg-tv-panel px-1.5 py-1.5 [@media(max-height:500px)]:py-0.5">
        <SwipeChip
          label={symbol}
          onSwipe={nextSymbol}
          onTap={() => openSheet("symbolSearch")}
          ariaLabel="Symbol — tap to search, swipe to switch"
        />
        <SwipeChip
          label={timeframeLabel(timeframe)}
          onSwipe={nextTimeframe}
          onTap={() => openSheet("timeframe")}
          ariaLabel="Timeframe — tap to pick, swipe to cycle pinned"
          compact
        />
        {/* Lit while a tool is armed: on a phone there is no Esc and no
            cursor shape to tell you the next tap will draw something. */}
        <button
          onClick={() => openSheet("drawings")}
          className={cn(
            "shrink-0 rounded p-1.5 active:bg-tv-panel-hover",
            toolArmed ? "bg-tv-text text-tv-bg" : "text-tv-text-muted",
          )}
          aria-label="Drawing tools"
          aria-pressed={toolArmed}
        >
          <Pencil className="h-4 w-4" />
        </button>
        {showMagnet && (
          <button
            onClick={toggleMagnetMode}
            className={cn(
              "shrink-0 rounded p-1.5 active:bg-tv-panel-hover",
              magnetMode ? "bg-tv-text text-tv-bg" : "text-tv-text-muted",
            )}
            aria-label={magnetMode ? "Magnet on — snap to OHLC" : "Magnet off"}
            aria-pressed={magnetMode}
          >
            <Magnet className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => openSheet("indicators")}
          className="shrink-0 rounded p-1.5 text-tv-text-muted active:bg-tv-panel-hover"
          aria-label="Indicators"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {/* Objects — the drawings list. Next to the drawing tool because that
            is where it is wanted: once a chart carries a dozen shapes, finding
            one by tapping the canvas stops working. */}
        <button
          onClick={() => openSheet("objects")}
          className="shrink-0 rounded p-1.5 text-tv-text-muted active:bg-tv-panel-hover"
          aria-label="Objects"
        >
          <Layers className="h-4 w-4" />
        </button>

        {/* Chart type: `compact`, so it is one icon button opening the full
            menu rather than desktop's framed trio of quick toggles. Candles
            are what the chart shows almost always, and switching to a line or
            area is a once-in-a-while decision — it does not earn three
            permanent slots, let alone a box of its own in a bar that is
            already inside one. */}
        <div className="shrink-0">
          <ChartTypeSelector compact />
        </div>

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
  /**
   * Set when the gesture turned out to be a swipe, so the click the browser
   * sends afterwards is dropped instead of being read as a tap.
   */
  const swipedRef = useRef(false);
  const [active, setActive] = useState(false);

  /**
   * Direction-aware slide between values.
   *
   * A swipe that silently replaces the text gives no sense of having moved
   * through a list — the chip just blinks and you check the label to find
   * out whether anything happened. Sliding the old value out the way the
   * thumb went and the new one in behind it is what makes the gesture read
   * as scrolling a wheel, which is how it behaves.
   *
   * `prev` holds the value being replaced and is cleared when the animation
   * ends, so only one label is in the DOM at rest.
   */
  const [prev, setPrev] = useState<{ label: string; dir: 1 | -1 } | null>(null);
  const dirRef = useRef<1 | -1>(1);
  const labelRef = useRef(label);

  useEffect(() => {
    if (label === labelRef.current) return;
    const outgoing = labelRef.current;
    labelRef.current = label;
    setPrev({ label: outgoing, dir: dirRef.current });
    const id = setTimeout(() => setPrev(null), SWIPE_ANIM_MS);
    return () => clearTimeout(id);
  }, [label]);

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={cn(
        // No box. The toolbar sits on its own panel with a rule above it, so
        // a border and a fill around each chip were a second frame inside a
        // frame — the "tantos cuadros" effect. The values are the largest,
        // boldest text down there; they do not need an outline to read as the
        // things you act on. Pressing still gives feedback through the fill.
        "relative shrink-0 select-none overflow-hidden rounded text-sm font-semibold transition-colors",
        compact ? "px-1.5 py-1 text-xs" : "px-1.5 py-1",
        active ? "bg-tv-panel-hover" : "bg-transparent",
      )}
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
        setActive(true);
      }}
      /*
       * The swipe resolves here, but a tap deliberately does not: it waits for
       * the click the browser sends afterwards.
       *
       * Opening a fullscreen sheet from `pointerup` puts it under the finger
       * mid-gesture, and the click that follows lands on whatever row is now
       * at that spot — tapping the timeframe chip opened the picker and then
       * immediately chose whichever timeframe had appeared under the thumb,
       * which read as "the chip does nothing". Letting the button's own click
       * do the opening is what every other control in this toolbar does.
       */
      onPointerUp={(e) => {
        setActive(false);
        const s = startRef.current;
        startRef.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        const SWIPE_PX = 24;
        // Vertical swipe wins — sign convention: swipe DOWN (positive dy) = previous,
        // swipe UP (negative dy) = next, matching how a wheel feels.
        if (Math.abs(dy) > SWIPE_PX && Math.abs(dy) > Math.abs(dx)) {
          const dir: 1 | -1 = dy < 0 ? 1 : -1;
          // Recorded before the value changes, so the effect above knows
          // which way to animate; a tap-driven change keeps the last
          // direction, which reads fine because it has no direction of its own.
          dirRef.current = dir;
          swipedRef.current = true;
          onSwipe(dir);
        }
      }}
      onClick={() => {
        if (swipedRef.current) {
          swipedRef.current = false;
          return;
        }
        onTap();
      }}
      onPointerCancel={() => {
        startRef.current = null;
        swipedRef.current = true; // a cancelled gesture is never a tap
        setActive(false);
      }}
    >
      {/* Keeps the chip's width while the two labels are absolutely
          positioned, so the toolbar doesn't jump as values change length
          ("1M" to "15M"). Invisible, but it is what holds the box open. */}
      <span className="invisible block whitespace-nowrap">{label}</span>
      {prev && (
        <span
          key={prev.label}
          className="absolute inset-0 flex items-center justify-center whitespace-nowrap"
          style={{ animation: `swipe-out-${prev.dir === 1 ? "up" : "down"} ${SWIPE_ANIM_MS}ms ease-out forwards` }}
        >
          {prev.label}
        </span>
      )}
      <span
        key={label}
        className="absolute inset-0 flex items-center justify-center whitespace-nowrap"
        style={prev ? { animation: `swipe-in-${prev.dir === 1 ? "up" : "down"} ${SWIPE_ANIM_MS}ms ease-out forwards` } : undefined}
      >
        {label}
      </span>
    </button>
  );
}
