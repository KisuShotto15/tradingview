"use client";

import { useEffect, useState } from "react";
import { useChartStore } from "@/lib/store/chart-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useMobileStore } from "@/lib/store/mobile-store";
import { useTradingStore } from "@/lib/store/trading-store";
import { useReplayStore } from "@/lib/replay/replay-store";
import { popBackHandler } from "@/lib/mobile/back-stack";

/** How long a second back press still counts as "yes, really leave". */
const CONFIRM_MS = 2500;

/**
 * Makes the Android back button (and a browser's back gesture) navigate
 * *inside* the app, and never leave it on a single press.
 *
 * The mobile shell routes by state, not by URL: tabs, sheets and dialogs
 * never push a history entry. So the first back press popped the only entry
 * there was — the page itself — and closed the app, from anywhere, even with
 * a fullscreen sheet open.
 *
 * The mechanism is the usual guard entry: keep one spare history entry ahead
 * of the real one, and on `popstate` close the topmost layer and push the
 * spare back. Layer by layer that walks out of a dialog, a sheet, an armed
 * tool, a selection, and back to the chart tab.
 *
 * The part that matters, and that a plain guard gets wrong: when there is
 * nothing left to close, the press has *already* consumed the guard. Nothing
 * visible happens, so the obvious thing to do is press again — and that one
 * leaves. The app therefore still appeared to close on a back press from the
 * home screen, guard or no guard. So that press instead puts "press back
 * again to exit" on screen for {@link CONFIRM_MS}, the Android convention for
 * a root screen, and the guard only goes back up if the second press never
 * comes. A layer this hook fails to notice can then cost at most a warning,
 * never the user's place.
 */
export function useAndroidBack(): { exitHint: boolean } {
  const [exitHint, setExitHint] = useState(false);

  useEffect(() => {
    // Replacing first tags the real entry, so a remount does not stack spares.
    window.history.replaceState({ kcRoot: true }, "");
    window.history.pushState({ kcGuard: true }, "");

    let hintTimer: ReturnType<typeof setTimeout> | null = null;

    const onPop = () => {
      if (handleBack()) {
        setExitHint(false);
        if (hintTimer) clearTimeout(hintTimer);
        window.history.pushState({ kcGuard: true }, "");
        return;
      }

      /*
       * Nothing left to close, so this press is a request to leave — but not
       * one we act on yet. The guard is deliberately *not* pushed back: the
       * history pointer now sits on the real entry, so the very next press
       * runs off the end of the history and the host app closes it, which is
       * the only way out a web page has. That is what makes it exactly two
       * presses rather than three.
       *
       * If the second press never comes, the guard goes back up when the
       * hint expires and the app is protected again.
       */
      setExitHint(true);
      if (hintTimer) clearTimeout(hintTimer);
      hintTimer = setTimeout(() => {
        setExitHint(false);
        window.history.pushState({ kcGuard: true }, "");
      }, CONFIRM_MS);
    };

    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (hintTimer) clearTimeout(hintTimer);
    };
  }, []);

  return { exitHint };
}

/** Close the topmost layer. Returns true when something was closed. */
function handleBack(): boolean {
  // Component-local layers first: they are literally on top, and whichever
  // was opened last is the one the press is aimed at.
  if (popBackHandler()) return true;

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

  // Tabs before the chart's own state: the chart is home, so back from any
  // other tab lands there before the next press offers to leave.
  //
  // This has to come first because an armed tool and a selected drawing are
  // both invisible from the watchlist or the trade screen. Consuming the
  // press for one of them from another tab spends it on something the user
  // cannot see — the screen simply does not change, and back looks broken.
  // It became reachable the moment a newly placed drawing started arriving
  // selected: draw a line, switch tabs, press back, nothing happens.
  if (mobile.tab !== "chart") {
    mobile.setTab("chart");
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

  return false;
}
