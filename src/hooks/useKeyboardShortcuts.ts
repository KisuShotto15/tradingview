"use client";

import { useEffect } from "react";
import { useChartStore } from "@/lib/store/chart-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";

/**
 * Global keyboard shortcuts for the chart.
 *
 * - Esc: cancel placement → reset tool to cursor → deselect drawing
 * - (Ctrl+Z / Del wired up in later phases)
 */
export function useKeyboardShortcuts() {
  const setTool = useChartStore((s) => s.setTool);
  const resetPlacement = useDrawingsStore((s) => s.resetPlacement);
  const setSelected = useDrawingsStore((s) => s.setSelected);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) {
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
  }, [setTool, resetPlacement, setSelected]);
}
