"use client";

import { useEffect } from "react";
import { useChartStore } from "@/lib/store/chart-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useDrawings } from "@/lib/supabase/use-drawings";

/**
 * Global keyboard shortcuts for the chart.
 *
 * - Esc: cancel placement → reset tool to cursor → deselect drawing
 * - Ctrl+Z / Cmd+Z: undo
 * - Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y: redo
 * - Del / Backspace: delete selected drawing
 */
export function useKeyboardShortcuts() {
  const setTool = useChartStore((s) => s.setTool);
  const openAlertDialog = useChartStore((s) => s.openAlertDialog);
  const resetPlacement = useDrawingsStore((s) => s.resetPlacement);
  const setSelected = useDrawingsStore((s) => s.setSelected);
  const { undo, redo, remove } = useDrawings();

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

      // Alt+A — open Create Alert dialog
      if (e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        const { currentLivePrice } = useChartStore.getState();
        openAlertDialog(currentLivePrice ?? undefined);
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
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setTool, openAlertDialog, resetPlacement, setSelected, undo, redo, remove]);
}
