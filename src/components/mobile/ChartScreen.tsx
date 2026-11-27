"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, Magnet, MoreHorizontal, Pencil, Redo2, Rewind, Undo2 } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { useMobileStore } from "@/lib/store/mobile-store";
import { useDrawings } from "@/lib/supabase/use-drawings";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useReplayStore } from "@/lib/replay/replay-store";
import { PriceChart } from "@/components/chart/PriceChart";
import { timeframeLabel, timeframeToSeconds } from "@/lib/chart/coords";
import { wheelIndex } from "@/lib/ui/wheel-step";
import { hapticTick } from "@/lib/ui/haptics";
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
  const magnetStrength = useChartStore((s) => s.magnetStrength);
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

  // The symbol wheel runs through the active watchlist. A charted symbol
  // that is not in it goes first, so the wheel still has a place to start.
  const wlSymbols = (() => {
    const w = watchlists.find((x) => x.id === activeWatchlistId);
    const list = (w?.items ?? []).filter((i) => i.type === "symbol").map((i) => i.value);
    return list.includes(symbol) ? list : [symbol, ...list];
  })();

  // The timeframe wheel runs through the *pinned* timeframes (the same
  // quick-access list desktop's header shows as chips) in ascending order;
  // the full set lives behind the tap-to-open sheet. The current one is slotted
  // in by length when it is not pinned.
  const tfWheel = [...new Set([...pinnedTimeframes, timeframe])].sort(
    (a, b) => timeframeToSeconds(a) - timeframeToSeconds(b),
  );

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
          values={wlSymbols}
          current={symbol}
          format={(v) => v}
          onCommit={setSymbol}
          onTap={() => openSheet("symbolSearch")}
          ariaLabel="Symbol — tap to search, hold and slide to switch"
        />
        <SwipeChip
          values={tfWheel}
          current={timeframe}
          format={(v) => timeframeLabel(v)}
          onCommit={setTimeframe}
          onTap={() => openSheet("timeframe")}
          ariaLabel="Timeframe — tap to pick, hold and slide to switch"
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
            aria-label={magnetMode ? `Magnet on — ${magnetStrength} snap to OHLC` : "Magnet off"}
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
 * A chip that works as a wheel: hold it and slide up or down, and the value
 * steps once per `WHEEL_STEP_PX` of travel with a haptic tick on each step, so
 * a single gesture can go from 5m to 4h — or down a whole watchlist — rather
 * than one value per swipe. The chip previews the value under the finger and
 * the change is committed on release: committing each step would load every
 * symbol or timeframe passed on the way, a 1000-bar fetch apiece.
 */
const WHEEL_STEP_PX = 26;

function SwipeChip<T extends string>({
  values, current, format, onCommit, onTap, ariaLabel, compact,
}: {
  values: T[];
  current: T;
  format: (v: T) => string;
  onCommit: (v: T) => void;
  onTap: () => void;
  ariaLabel: string;
  compact?: boolean;
}) {
  const startRef = useRef<{ x: number; y: number; idx: number } | null>(null);
  /**
   * Set when the gesture turned out to be a slide, so the click the browser
   * sends afterwards is dropped instead of being read as a tap.
   */
  const swipedRef = useRef(false);
  const [active, setActive] = useState(false);
  /** The value under the finger while sliding; null at rest. */
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const previewRef = useRef<number | null>(null);
  const label = format(previewIdx !== null ? values[previewIdx] ?? current : current);

  /**
   * Direction-aware slide between values.
   *
   * A change that silently replaces the text gives no sense of having moved
   * through a list — the chip just blinks and you check the label to find
   * out whether anything happened. Sliding the old value out the way the
   * thumb went and the new one in behind it is what makes the gesture read
   * as turning a wheel, which is how it behaves.
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
        const idx = values.indexOf(current);
        startRef.current = { x: e.clientX, y: e.clientY, idx: idx < 0 ? 0 : idx };
        swipedRef.current = false;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* capture is a nicety; touch captures implicitly anyway */
        }
        setActive(true);
      }}
      onPointerMove={(e) => {
        const s = startRef.current;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        // Until the first step, a mostly sideways move is not a slide.
        if (!swipedRef.current && Math.abs(dx) > Math.abs(dy)) return;
        const idx = wheelIndex(s.idx, dy, values.length, WHEEL_STEP_PX);
        const shown = previewRef.current ?? s.idx;
        if (idx === shown) return;
        // Recorded before the value changes, so the slide animation knows
        // which way to go: up the list slides up, down slides down.
        dirRef.current = idx > shown ? 1 : -1;
        swipedRef.current = true;
        previewRef.current = idx;
        setPreviewIdx(idx);
        hapticTick();
      }}
      /*
       * The slide commits here, but a tap deliberately does not: it waits for
       * the click the browser sends afterwards.
       *
       * Opening a fullscreen sheet from `pointerup` puts it under the finger
       * mid-gesture, and the click that follows lands on whatever row is now
       * at that spot — tapping the timeframe chip opened the picker and then
       * immediately chose whichever timeframe had appeared under the thumb,
       * which read as "the chip does nothing". Letting the button's own click
       * do the opening is what every other control in this toolbar does.
       */
      onPointerUp={() => {
        setActive(false);
        const s = startRef.current;
        startRef.current = null;
        const idx = previewRef.current;
        previewRef.current = null;
        setPreviewIdx(null);
        if (!s || idx === null) return;
        const next = values[idx];
        if (next !== undefined && next !== current) onCommit(next);
      }}
      onClick={() => {
        if (swipedRef.current) {
          swipedRef.current = false;
          return;
        }
        onTap();
      }}
      onPointerCancel={() => {
        // A cancelled gesture is never a tap, and never a choice either.
        startRef.current = null;
        previewRef.current = null;
        setPreviewIdx(null);
        swipedRef.current = true;
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
