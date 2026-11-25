"use client";

import { List, LineChart, ArrowLeftRight, Menu as MenuIcon } from "lucide-react";
import { useMobileStore, type MobileTab } from "@/lib/store/mobile-store";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { cn } from "@/lib/utils";
import { WatchlistScreen } from "./WatchlistScreen";
import { ChartScreen } from "./ChartScreen";
import { TradeScreen } from "./TradeScreen";
import { MenuScreen } from "./MenuScreen";
import { MobileSheetsRoot } from "./MobileSheetsRoot";

/**
 * Mobile UI shell — full-screen container with a fixed bottom tab bar.
 * State-based routing (no URL changes) for an app-like feel.
 */
export function MobileShell() {
  const tab = useMobileStore((s) => s.tab);
  // Back closes the topmost layer instead of the whole app; from the home
  // screen it asks first rather than leaving on one press.
  const { exitHint } = useAndroidBack();

  return (
    <div
      className="fixed inset-0 flex flex-col bg-tv-bg text-tv-text"
      /*
       * A long press is one of this app's gestures — watchlist row actions,
       * and the chart's crosshair — and the browser answers the same press
       * with its own menu, which lands on top of whatever the press opened.
       * Suppressed for the whole mobile shell; the desktop layout is a
       * different branch in `page.tsx`, so right-click menus there, including
       * the chart's own, are untouched.
       */
      onContextMenu={(e) => e.preventDefault()}
    >
      {/*
        The chart stays mounted whichever tab is showing.
        Unmounting it calls `chart.remove()`, and the chart that comes back is
        a new one: the pan and zoom the user had set are gone, every series is
        rebuilt and the whole candle history is fetched again. Switching to the
        watchlist and back is a thing people do constantly, and it should cost
        nothing. Hidden with `invisible` rather than `hidden`, so the container
        keeps its size — a chart laid out at 0x0 has to rediscover its
        dimensions on the way back, which is its own visible reflow.
      */}
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            "absolute inset-0",
            tab !== "chart" && "invisible pointer-events-none",
          )}
          aria-hidden={tab !== "chart"}
        >
          <ChartScreen />
        </div>
        {tab === "watchlist" && (
          <div className="absolute inset-0"><WatchlistScreen /></div>
        )}
        {tab === "trade" && (
          <div className="absolute inset-0"><TradeScreen /></div>
        )}
        {tab === "menu" && (
          <div className="absolute inset-0"><MenuScreen /></div>
        )}
      </main>
      <BottomTabBar />
      <MobileSheetsRoot />
      {exitHint && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center"
          role="status"
        >
          <span className="rounded-full bg-tv-panel/95 px-4 py-2 text-sm text-tv-text shadow-lg ring-1 ring-tv-border">
            Press back again to exit
          </span>
        </div>
      )}
    </div>
  );
}

interface TabDef {
  id: MobileTab;
  label: string;
  Icon: typeof List;
}

const TABS: TabDef[] = [
  { id: "watchlist", label: "Watchlist", Icon: List },
  { id: "chart",     label: "Chart",     Icon: LineChart },
  { id: "trade",     label: "Trade",     Icon: ArrowLeftRight },
  { id: "menu",      label: "Menu",      Icon: MenuIcon },
];

function BottomTabBar() {
  const tab = useMobileStore((s) => s.tab);
  const setTab = useMobileStore((s) => s.setTab);

  return (
    <nav
      className="grid shrink-0 grid-cols-4 border-t border-tv-border bg-tv-panel"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      role="tablist"
      aria-label="Main navigation"
    >
      {TABS.map(({ id, label, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            role="tab"
            aria-selected={active}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 transition-colors",
              // Short viewport — a phone held sideways. There the nav and the
              // chart toolbar together were taking a quarter of a 412px-tall
              // screen, and rotating is the gesture whose whole purpose is to
              // give the chart more of it. Drop the labels and the padding;
              // the icons are the same four in the same order, so nothing
              // becomes unfindable.
              "[@media(max-height:500px)]:py-1",
              active ? "text-tv-text" : "text-tv-text-muted active:text-tv-text",
            )}
            aria-label={label}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium [@media(max-height:500px)]:hidden">
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
