"use client";

import { useState, useRef, useEffect } from "react";
import { useChartStore } from "@/lib/store/chart-store";
import type { Timeframe } from "@/lib/binance/types";
import { cn } from "@/lib/utils";
import { Plus, Star } from "lucide-react";

const ALL_TIMEFRAMES: Timeframe[] = [
  "1m", "3m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
];

const TF_SECONDS: Record<Timeframe, number> = {
  "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
  "1h": 3600, "2h": 7200, "4h": 14400, "6h": 21600,
  "8h": 28800, "12h": 43200, "1d": 86400, "3d": 259200,
  "1w": 604800, "1M": 2592000,
};

/** Short label shown in the top bar */
const TF_LABEL: Record<Timeframe, string> = {
  "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "2h": "2h", "4h": "4h", "6h": "6h", "8h": "8h", "12h": "12h",
  "1d": "D", "3d": "3D", "1w": "W", "1M": "M",
};

/** Full label shown in the dropdown */
const TF_FULL: Record<Timeframe, string> = {
  "1m": "1 minute", "3m": "3 minutes", "5m": "5 minutes",
  "15m": "15 minutes", "30m": "30 minutes",
  "1h": "1 hour", "2h": "2 hours", "4h": "4 hours",
  "6h": "6 hours", "8h": "8 hours", "12h": "12 hours",
  "1d": "1 day", "3d": "3 days", "1w": "1 week", "1M": "1 month",
};

const TF_GROUPS: { label: string; values: Timeframe[] }[] = [
  { label: "Minutes", values: ["1m", "3m", "5m", "15m", "30m"] },
  { label: "Hours",   values: ["1h", "2h", "4h", "6h", "8h", "12h"] },
  { label: "Days+",   values: ["1d", "3d", "1w", "1M"] },
];

export function TimeframeSelector() {
  const tf = useChartStore((s) => s.timeframe);
  const setTf = useChartStore((s) => s.setTimeframe);
  const pinned = useChartStore((s) => s.pinnedTimeframes);
  const setPinned = useChartStore((s) => s.setPinnedTimeframes);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function onDown(e: MouseEvent) {
      if (!dropdownRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [dropdownOpen]);

  function toggleFavorite(t: Timeframe) {
    if (pinned.includes(t)) {
      if (pinned.length <= 1) return; // keep at least one
      const next = pinned.filter((p) => p !== t);
      setPinned(next);
      if (tf === t) setTf(next[0]);
    } else {
      const next = [...pinned, t].sort((a, b) => TF_SECONDS[a] - TF_SECONDS[b]);
      setPinned(next);
    }
  }

  function selectTf(t: Timeframe) {
    setTf(t);
    setDropdownOpen(false);
  }

  return (
    <div className="flex items-center gap-0.5 rounded bg-tv-bg p-0.5">
      {/* Pinned timeframes */}
      {pinned.map((t) => (
        <button
          key={t}
          onClick={() => setTf(t)}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium uppercase transition-colors",
            tf === t
              ? "bg-tv-panel-hover text-tv-text"
              : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
          )}
        >
          {TF_LABEL[t]}
        </button>
      ))}

      {/* Dropdown trigger */}
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
          title="Manage timeframes"
        >
          <Plus className="h-3 w-3" />
          <span className="hidden sm:inline">Add interval</span>
        </button>

        {dropdownOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-52 overflow-hidden rounded border border-tv-border bg-tv-panel shadow-xl">
            {TF_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted/60">
                  {group.label}
                </div>
                {group.values.map((t) => {
                  const fav = pinned.includes(t);
                  const active = tf === t;
                  return (
                    <div
                      key={t}
                      className={cn(
                        "group flex cursor-pointer items-center justify-between px-3 py-1.5 transition-colors",
                        active
                          ? "bg-tv-panel-hover text-tv-text"
                          : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                      )}
                    >
                      {/* Label — click to select */}
                      <span
                        className="flex-1 text-sm"
                        onClick={() => selectTf(t)}
                      >
                        {TF_FULL[t]}
                      </span>

                      {/* Star — click to toggle favorite */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(t); }}
                        className={cn(
                          "ml-2 shrink-0 transition-colors",
                          fav
                            ? "text-yellow-400 hover:text-yellow-300"
                            : "text-tv-text-dim opacity-0 hover:text-tv-text-muted group-hover:opacity-100",
                        )}
                        title={fav ? "Remove from bar" : "Add to bar"}
                      >
                        <Star
                          className="h-3.5 w-3.5"
                          fill={fav ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
