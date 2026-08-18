"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MobileTab = "watchlist" | "chart" | "trade" | "menu";

interface MobileState {
  /** Currently selected bottom-tab. */
  tab: MobileTab;
  setTab: (t: MobileTab) => void;

  /** Whether a fullscreen sheet (symbol search / indicators / settings) is open. */
  sheet:
    | null
    | "symbolSearch"
    | "timeframe"
    | "indicators"
    | "drawings"
    | "chartSettings"
    | "alerts"
    | "apiKey";
  openSheet: (s: NonNullable<MobileState["sheet"]>) => void;
  closeSheet: () => void;
}

/** Persisted so the user lands on the last tab they used. */
export const useMobileStore = create<MobileState>()(
  persist(
    (set) => ({
      tab: "chart",
      setTab: (tab) => set({ tab }),
      sheet: null,
      openSheet: (sheet) => set({ sheet }),
      closeSheet: () => set({ sheet: null }),
    }),
    {
      name: "mobile-shell",
      partialize: (s) => ({ tab: s.tab }),
    },
  ),
);
