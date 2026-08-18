"use client";

import { useEffect, useRef } from "react";
import { useChartStore } from "@/lib/store/chart-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useDrawings } from "@/lib/supabase/use-drawings";
import { useReplayStore } from "@/lib/replay/replay-store";
import { translateDrawing } from "@/lib/drawings/translate";
import { timeframeToSeconds } from "@/lib/chart/coords";
import { getPricePerPixel } from "@/lib/chart/nudge";
import type { Drawing } from "@/lib/drawings/types";
import type { Timeframe } from "@/lib/binance/types";

/** Idle time after the last arrow press before the move becomes one undo step. */
const NUDGE_COMMIT_MS = 500;

/** How long a typed digit buffer waits for its unit letter before resetting. */
const TF_COMMAND_TIMEOUT_MS = 1500;

const VALID_TIMEFRAMES = new Set<Timeframe>([
  "1m", "3m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
]);

/** Unit letters TradingView's quick timeframe command recognizes. */
const TF_UNITS = new Set(["m", "h", "d", "w", "M"]);

/**
 * Global keyboard shortcuts for the chart.
 *
 * - Esc: cancel placement → reset tool to cursor → deselect drawing
 * - Ctrl+Z / Cmd+Z: undo
 * - Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y: redo
 * - Del / Backspace: delete selected drawing
 * - Ctrl+D / Cmd+D: duplicate selected drawing
 * - Arrows: nudge the selected drawing (Shift = 10x)
 * - Digits + unit letter (m/h/d/w/M): quick timeframe command, e.g. "5" "d" → 5D
 */
export function useKeyboardShortcuts() {
  const setTool = useChartStore((s) => s.setTool);
  const openAlertDialog = useChartStore((s) => s.openAlertDialog);
  const setSymbolDialogInitialQuery = useChartStore((s) => s.setSymbolDialogInitialQuery);
  const setSymbolDialogOpen = useChartStore((s) => s.setSymbolDialogOpen);
  const setTimeframe = useChartStore((s) => s.setTimeframe);
  const resetPlacement = useDrawingsStore((s) => s.resetPlacement);
  const setSelected = useDrawingsStore((s) => s.setSelected);
  const { undo, redo, remove, duplicate, updateLive, commit } = useDrawings();

  // A run of arrow presses is one gesture, like a drag: live-update on each
  // key, then record a single history entry (and one cloud write) once it
  // settles — otherwise holding an arrow would spam both.
  const nudgeBeforeRef = useRef<Drawing | null>(null);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Quick timeframe command buffer ("5" then "d" → 5D), TradingView-style.
  const tfDigitsRef = useRef<string>("");
  const tfTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }

      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z";
      const isRedo =
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z") ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y");

      if (isUndo) {
        e.preventDefault();
        void undo();
        return;
      }
      if (isRedo) {
        e.preventDefault();
        void redo();
        return;
      }

      // Ctrl+D — duplicate the selected drawing (offset so it doesn't land
      // exactly on top of the original)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        const { selectedId } = useDrawingsStore.getState();
        if (selectedId) {
          e.preventDefault();
          void duplicate(selectedId);
        }
        return;
      }

      // Bar-replay transport (only while replay is running). Handled before the
      // printable-char branch below so Space doesn't open symbol search.
      const replay = useReplayStore.getState();
      if (replay.active && !replay.picking) {
        if (e.key === " " || e.code === "Space") {
          e.preventDefault();
          replay.togglePlay();
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          replay.stepForward();
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          replay.stepBackward();
          return;
        }
      }

      // Arrows — nudge the selected drawing. Vertical steps are one screen
      // pixel so the feel is the same whatever the symbol's price magnitude;
      // horizontal steps are one bar. Shift moves 10x.
      if (e.key.startsWith("Arrow")) {
        const { selectedId, drawings } = useDrawingsStore.getState();
        if (!selectedId) return;
        const current = drawings.find((d) => d.id === selectedId);
        if (!current || current.locked) return;

        const step = e.shiftKey ? 10 : 1;
        const perPixel = getPricePerPixel();
        const intervalSec = timeframeToSeconds(useChartStore.getState().timeframe);
        let dt = 0;
        let dp = 0;
        if (e.key === "ArrowLeft") dt = -intervalSec * step;
        else if (e.key === "ArrowRight") dt = intervalSec * step;
        else if (e.key === "ArrowUp" && perPixel) dp = perPixel * step;
        else if (e.key === "ArrowDown" && perPixel) dp = -perPixel * step;
        if (dt === 0 && dp === 0) return;

        e.preventDefault();
        if (!nudgeBeforeRef.current) nudgeBeforeRef.current = current;
        updateLive(selectedId, translateDrawing(current, dt, dp));

        if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
        nudgeTimerRef.current = setTimeout(() => {
          const before = nudgeBeforeRef.current;
          nudgeBeforeRef.current = null;
          nudgeTimerRef.current = null;
          if (before) void commit(before.id, before);
        }, NUDGE_COMMIT_MS);
        return;
      }

      // Alt+A — open Create Alert dialog
      if (e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        const { currentLivePrice } = useChartStore.getState();
        openAlertDialog(currentLivePrice ?? undefined);
        return;
      }

      // Quick timeframe command — type digits then a unit letter (m minutes,
      // h hours, d days, w weeks, M months) to jump straight to that
      // timeframe, e.g. "5" then "d" → 5D. Digits are reserved for this and
      // never fall through to symbol search; an invalid combo (e.g. "9d",
      // which isn't an offered timeframe) just clears the buffer silently.
      const isDigit = e.key.length === 1 && e.key >= "0" && e.key <= "9";
      const isTfUnit = TF_UNITS.has(e.key);
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !useChartStore.getState().symbolDialogOpen &&
        (isDigit || (isTfUnit && tfDigitsRef.current))
      ) {
        e.preventDefault();
        if (tfTimerRef.current) {
          clearTimeout(tfTimerRef.current);
          tfTimerRef.current = null;
        }
        if (isDigit) {
          tfDigitsRef.current = (tfDigitsRef.current + e.key).slice(-3);
          tfTimerRef.current = setTimeout(() => {
            tfDigitsRef.current = "";
          }, TF_COMMAND_TIMEOUT_MS);
          return;
        }
        const candidate = `${tfDigitsRef.current}${e.key}` as Timeframe;
        tfDigitsRef.current = "";
        if (VALID_TIMEFRAMES.has(candidate)) setTimeframe(candidate);
        return;
      }

      // Printable character → open symbol search pre-filled
      if (
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !useChartStore.getState().symbolDialogOpen
      ) {
        setSymbolDialogInitialQuery(e.key.toUpperCase());
        setSymbolDialogOpen(true);
        e.preventDefault();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        const { selectedId } = useDrawingsStore.getState();
        if (selectedId) {
          e.preventDefault();
          void remove(selectedId);
        }
        return;
      }

      if (e.key === "Escape") {
        const { placement, selectedId } = useDrawingsStore.getState();
        const { tool } = useChartStore.getState();

        if (placement.draft) {
          resetPlacement();
          return;
        }
        if (tool !== "cursor") {
          setTool("cursor");
          return;
        }
        if (selectedId) {
          setSelected(null);
          return;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      // Don't strand an in-flight nudge without its history entry.
      if (nudgeTimerRef.current) {
        clearTimeout(nudgeTimerRef.current);
        nudgeTimerRef.current = null;
        const before = nudgeBeforeRef.current;
        nudgeBeforeRef.current = null;
        if (before) void commit(before.id, before);
      }
      if (tfTimerRef.current) {
        clearTimeout(tfTimerRef.current);
        tfTimerRef.current = null;
      }
    };
  }, [setTool, openAlertDialog, setSymbolDialogInitialQuery, setSymbolDialogOpen, setTimeframe, resetPlacement, setSelected, undo, redo, remove, duplicate, updateLive, commit]);
}
