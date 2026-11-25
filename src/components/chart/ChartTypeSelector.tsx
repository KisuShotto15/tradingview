"use client";

import { ChevronDown, Check } from "lucide-react";
import { useChartStore, type ChartType } from "@/lib/store/chart-store";
import { Fragment } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/* ── Icon set: tiny inline SVGs that mirror the TradingView chart-type bar.
 *  Drawn at 14×14 to fit the 28px square buttons in the header.            */

const ICON_VIEW = "0 0 14 14";

function CandlesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox={ICON_VIEW} className={className} fill="none" stroke="currentColor" strokeWidth={1.2}>
      <line x1="4" y1="1" x2="4" y2="13" />
      <rect x="2.5" y="3" width="3" height="6" fill="currentColor" />
      <line x1="10" y1="1" x2="10" y2="13" />
      <rect x="8.5" y="5" width="3" height="6" />
    </svg>
  );
}

function HollowCandlesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox={ICON_VIEW} className={className} fill="none" stroke="currentColor" strokeWidth={1.2}>
      <line x1="4" y1="1" x2="4" y2="13" />
      <rect x="2.5" y="3" width="3" height="6" />
      <line x1="10" y1="1" x2="10" y2="13" />
      <rect x="8.5" y="5" width="3" height="6" />
    </svg>
  );
}

function BarsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox={ICON_VIEW} className={className} fill="none" stroke="currentColor" strokeWidth={1.2}>
      <line x1="4" y1="1" x2="4" y2="13" />
      <line x1="2" y1="4" x2="4" y2="4" />
      <line x1="4" y1="9" x2="6" y2="9" />
      <line x1="10" y1="2" x2="10" y2="13" />
      <line x1="8" y1="5" x2="10" y2="5" />
      <line x1="10" y1="10" x2="12" y2="10" />
    </svg>
  );
}

function LineIcon({ className }: { className?: string }) {
  return (
    <svg viewBox={ICON_VIEW} className={className} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1,10 4,6 7,8 10,3 13,5" />
    </svg>
  );
}

function LineMarkersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox={ICON_VIEW} className={className} fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1,10 4,6 7,8 10,3 13,5" />
      <circle cx="4" cy="6" r="1.2" fill="currentColor" />
      <circle cx="7" cy="8" r="1.2" fill="currentColor" />
      <circle cx="10" cy="3" r="1.2" fill="currentColor" />
    </svg>
  );
}

function StepLineIcon({ className }: { className?: string }) {
  return (
    <svg viewBox={ICON_VIEW} className={className} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1,10 4,10 4,5 8,5 8,8 13,8" />
    </svg>
  );
}

function AreaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox={ICON_VIEW} className={className}>
      <path
        d="M 1,10 L 4,6 L 7,8 L 10,3 L 13,5 L 13,13 L 1,13 Z"
        fill="currentColor"
        fillOpacity={0.35}
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface ChartTypeOption {
  id: ChartType;
  label: string;
  Icon: (p: { className?: string }) => React.ReactElement;
}

const OPTIONS: ChartTypeOption[] = [
  { id: "bars",              label: "Bars",              Icon: BarsIcon },
  { id: "candles",           label: "Candles",           Icon: CandlesIcon },
  { id: "hollow-candles",    label: "Hollow candles",    Icon: HollowCandlesIcon },
  { id: "line",              label: "Line",              Icon: LineIcon },
  { id: "line-with-markers", label: "Line with markers", Icon: LineMarkersIcon },
  { id: "step-line",         label: "Step line",         Icon: StepLineIcon },
  { id: "area",              label: "Area",              Icon: AreaIcon },
];

/** Subset of options shown as quick-toggle buttons before the dropdown chevron. */
const QUICK_OPTIONS: ChartType[] = ["candles", "line", "area"];

interface Props {
  /**
   * Drop the three quick-toggle buttons and the frame around them, leaving a
   * single icon button that opens the full menu.
   *
   * The mobile toolbar is one horizontally-scrolling row, so the trio plus a
   * chevron inside its own bordered box was both the widest control in the bar
   * and a second frame drawn inside a frame. Chart type is also the control a
   * chart user reaches for least — candles are what the chart shows almost
   * always — so it does not earn three permanent slots. The icon shown is the
   * current type's, which is the state the quick toggles were conveying.
   */
  compact?: boolean;
}

export function ChartTypeSelector({ compact }: Props = {}) {
  const chartType = useChartStore((s) => s.chartType);
  const setChartType = useChartStore((s) => s.setChartType);
  const CurrentIcon = (OPTIONS.find((o) => o.id === chartType) ?? OPTIONS[1]).Icon;

  return (
    <div
      className={cn(
        "flex items-center",
        compact ? "" : "gap-0.5 rounded border border-tv-border bg-tv-bg/50 px-0.5",
      )}
    >
      {!compact && QUICK_OPTIONS.map((id) => {
        const opt = OPTIONS.find((o) => o.id === id);
        if (!opt) return null;
        const active = chartType === id;
        return (
          <button
            key={id}
            onClick={() => setChartType(id)}
            aria-label={opt.label}
            title={opt.label}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded transition-colors",
              active
                ? "bg-tv-text/15 text-tv-text"
                : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
            )}
          >
            <opt.Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Chart type"
          className={cn(
            "flex items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
            compact ? "h-7 w-7 active:bg-tv-panel-hover" : "h-6 w-5",
          )}
        >
          {compact ? <CurrentIcon className="h-4 w-4" /> : <ChevronDown className="h-3 w-3" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px] bg-tv-panel">
          {OPTIONS.map((opt, i) => {
            const active = chartType === opt.id;
            const showSeparator = i === 3; // separator between candle-family and line-family
            return (
              <Fragment key={opt.id}>
                {showSeparator && <DropdownMenuSeparator className="bg-tv-border" />}
                <DropdownMenuItem
                  onClick={() => setChartType(opt.id)}
                  className={cn(
                    "flex items-center gap-2 text-xs",
                    active && "bg-tv-panel-hover",
                  )}
                >
                  <opt.Icon className="h-3.5 w-3.5 text-tv-text-muted" />
                  <span className="flex-1">{opt.label}</span>
                  {active && <Check className="h-3 w-3 text-tv-text" />}
                </DropdownMenuItem>
              </Fragment>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
