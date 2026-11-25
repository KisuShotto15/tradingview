"use client";

import { useEffect } from "react";
import { useChartStore } from "@/lib/store/chart-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useMobileStore } from "@/lib/store/mobile-store";
import { useTradingStore } from "@/lib/store/trading-store";
import { useReplayStore } from "@/lib/replay/replay-store";

/**
 * Makes the Android back button (and a browser's back gesture) navigate
 * *inside* the app.
 *
 * The mobile shell routes by state, not by URL: tabs, sheets and dialogs
 * never push a history entry. So the first back press popped the only entry
 * there was — the page itself — and closed the app, from anywhere, even with
 * a fullscreen sheet open. That is the single most jarring thing an installed
 * app can do, because back is the gesture people use instead of hunting for a
 * close button.
 *
 * The fix is the standard guard-entry trick: keep one spare history entry
 * ahead of the real one, and on `popstate` close the topmost layer and push
 * the spare back. Only when there is nothing left to close is the pop allowed
 * through, which is when leaving really is what back means.
 *
 * `handleBack` returns false exactly once per "level", so repeated presses
 * walk out layer by layer — dialog, sheet, armed tool, selection, back to the
 * chart tab, and finally out of the app.
 */
export function useAndroidBack() {
  useEffect(() => {
    // The spare entry. Replacing state first tags the real entry, so a second
    // mount (fast refresh, a remount) does not stack spares indefinitely.
    window.history.replaceState({ kcRoot: true }, "");
    window.history.pushState({ kcGuard: true }, "");

    const onPop = () => {
      if (handleBack()) {
        window.history.pushState({ kcGuard: true }, "");
      }
      // Otherwise the pop stands and the app closes, which is what was asked.
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
}

/** Close the topmost layer. Returns true when something was closed. */
function handleBack(): boolean {
  const trading = useTradingStore.getState();
  if (trading.apiKeyDialogOpen) {
    trading.setApiKeyDialogOpen(false);
    return true;
  }
  if (trading.editingPosition) {
    trading.closePositionEdit();
    return true;
  }

  const chart = useChartStore.getState();
  if (chart.alertDialogOpen) {
    chart.closeAlertDialog();
    return true;
  }
  if (chart.settingsTarget !== null) {
    chart.setSettingsTarget(null);
    return true;
  }
  if (chart.chartSettingsOpen) {
    chart.setChartSettingsOpen(false);
    return true;
  }
  if (chart.symbolDialogOpen) {
    chart.setSymbolDialogOpen(false);
    return true;
  }

  const drawings = useDrawingsStore.getState();
  if (drawings.editingId !== null) {
    drawings.setEditing(null);
    return true;
  }

  const mobile = useMobileStore.getState();
  if (mobile.sheet !== null) {
    mobile.closeSheet();
    return true;
  }

  const replay = useReplayStore.getState();
  if (replay.active) {
    replay.exit();
    return true;
  }

  // Same order the Esc key uses on desktop: drop the armed tool before the
  // selection, since a tool in flight is the more surprising state to be left
  // in and the one with no other visible way out on a phone.
  if (chart.tool !== "cursor") {
    chart.setTool("cursor");
    return true;
  }
  if (drawings.selectedId !== null) {
    drawings.setSelected(null);
    return true;
  }

  // Tabs last: the chart is home, so back from any other tab lands there
  // before the next press leaves.
  if (mobile.tab !== "chart") {
    mobile.setTab("chart");
    return true;
  }

  return false;
}
