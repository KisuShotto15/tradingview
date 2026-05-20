"use client";

import { useState, useRef, useEffect } from "react";
import { useChartStore } from "@/lib/store/chart-store";
import type { Timeframe } from "@/lib/binance/types";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

const ALL_TIMEFRAMES: Timeframe[] = [
  "1m", "3m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
];

const TF_LABEL: Record<Timeframe, string> = {
  "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "2h": "2h", "4h": "4h", "6h": "6h", "8h": "8h", "12h": "12h",
  "1d": "D", "3d": "3D", "1w": "W", "1M": "M",
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
  const [hoveredTf, setHoveredTf] = useState<Timeframe | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function onDown(e: MouseEvent) {
      if (!dropdownRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [dropdownOpen]);

  const available = ALL_TIMEFRAMES.filter((t) => !pinned.includes(t));

  function add(t: Timeframe) {
    setPinned([...pinned, t]);
    setTf(t);
    setDropdownOpen(false);
  }

  function remove(t: Timeframe) {
    if (pinned.length <= 1) return;
    const next = pinned.find((p) => p !== t) ?? pinned[0];
    setPinned(pinned.filter((p) => p !== t));
    if (tf === t) setTf(next);
  }

  return (
    <div className="flex items-center gap-0.5 rounded bg-tv-bg p-0.5">
      {pinned.map((t) => (
        <div
          key={t}
          className="group relative"
          onMouseEnter={() => setHoveredTf(t)}
          onMouseLeave={() => setHoveredTf(null)}
        >
          <button
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
          {hoveredTf === t && pinned.length > 1 && (
            <button
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); remove(t); }}
              className="absolute -right-1 -top-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-tv-border text-[9px] leading-none text-tv-text-muted hover:bg-red-500/70 hover:text-white"
              title="Remove from bar"
            >
              ×
            </button>
          )}
        </div>
      ))}

      {/* Add timeframe */}
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          disabled={available.length === 0}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-text disabled:opacity-30"
          title="Add timeframe"
        >
          <Plus className="h-3 w-3" />
          <span className="hidden sm:inline">Add custom interval...</span>
        </button>

        {dropdownOpen && available.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[130px] overflow-hidden rounded border border-tv-border bg-tv-panel shadow-lg">
            {TF_GROUPS.map((group) => {
              const opts = group.values.filter((t) => available.includes(t));
              if (opts.length === 0) return null;
              return (
                <div key={group.label}>
                  <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-tv-text-muted/60">
                    {group.label}
                  </div>
                  {opts.map((t) => (
                    <button
                      key={t}
                      onClick={() => add(t)}
                      className="block w-full px-3 py-1.5 text-left text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
                    >
                      {TF_LABEL[t]}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
