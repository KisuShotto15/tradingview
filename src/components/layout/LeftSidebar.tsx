"use client";

import React, { useState } from "react";
import {
  MousePointer2,
  Minus,
  Bell,
  BellOff,
  CalendarRange,
  ChevronRight,
  GripVertical,
  Layers3,
  MoveRight,
  Percent,
  RectangleHorizontal,
  Ruler,
  Slash,
  Trash2,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useDrawings } from "@/lib/supabase/use-drawings";
import type { Drawing, AlertConfig } from "@/lib/drawings/types";
import { cn } from "@/lib/utils";

type AnyIcon = LucideIcon | React.FC<{ className?: string }>;

function LongPositionIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="4" width="16" height="5.5" fill="#26a69a" fillOpacity="0.35" />
      <rect x="2" y="10.5" width="16" height="5.5" fill="#ef5350" fillOpacity="0.35" />
      <line x1="2" y1="10" x2="18" y2="10" stroke="#d1d4dc" strokeWidth="1.4" />
      <line x1="2" y1="4" x2="18" y2="4" stroke="#26a69a" strokeWidth="1" />
      <line x1="2" y1="16" x2="18" y2="16" stroke="#ef5350" strokeWidth="1" />
    </svg>
  );
}

function ShortPositionIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="4" width="16" height="5.5" fill="#ef5350" fillOpacity="0.35" />
      <rect x="2" y="10.5" width="16" height="5.5" fill="#26a69a" fillOpacity="0.35" />
      <line x1="2" y1="10" x2="18" y2="10" stroke="#d1d4dc" strokeWidth="1.4" />
      <line x1="2" y1="4" x2="18" y2="4" stroke="#ef5350" strokeWidth="1" />
      <line x1="2" y1="16" x2="18" y2="16" stroke="#26a69a" strokeWidth="1" />
    </svg>
  );
}

interface ToolDef {
  key: DrawingTool;
  icon: AnyIcon;
  label: string;
  hint?: string;
}

interface ToolGroup {
  label: string | null;
  tools: ToolDef[];
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    label: null,
    tools: [
      { key: "cursor", icon: MousePointer2, label: "Cursor", hint: "Pan & navigate" },
    ],
  },
  {
    label: "Lines",
    tools: [
      { key: "trendline", icon: TrendingUp, label: "Trend line", hint: "Click start, then end. Drag endpoints to edit" },
      { key: "ray", icon: Slash, label: "Ray", hint: "Click origin, then direction — extends to infinity" },
      { key: "hline", icon: Minus, label: "Horizontal line", hint: "Click to mark a price across the chart" },
      { key: "hray", icon: MoveRight, label: "Horizontal ray", hint: "Click anchor — extends to the right" },
      { key: "vline", icon: GripVertical, label: "Vertical line", hint: "Click to mark a time across the chart" },
    ],
  },
  {
    label: "Channels",
    tools: [
      { key: "parallel-channel", icon: Layers3, label: "Parallel channel", hint: "Click A, then B (baseline), then C (parallel offset)" },
    ],
  },
  {
    label: "Fibonacci",
    tools: [
      { key: "fib-retracement", icon: Percent, label: "Fib retracement", hint: "Click swing high, then swing low (or vice versa)" },
    ],
  },
  {
    label: "Ranges",
    tools: [
      { key: "price-range", icon: RectangleHorizontal, label: "Price range", hint: "Click two prices to measure absolute & % range" },
      { key: "date-range", icon: CalendarRange, label: "Date range", hint: "Click two timestamps to measure duration" },
    ],
  },
  {
    label: "Trade",
    tools: [
      { key: "long", icon: LongPositionIcon, label: "Long position", hint: "Click entry, then target. Stop auto-set; drag handles to edit" },
      { key: "short", icon: ShortPositionIcon, label: "Short position", hint: "Click entry, then target. Stop auto-set; drag handles to edit" },
    ],
  },
  {
    label: "Tools",
    tools: [
      { key: "measure", icon: Ruler, label: "Measure", hint: "Click two points to measure Δ price, %, bars, volume" },
    ],
  },
];

export function LeftSidebar() {
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const symbol = useChartStore((s) => s.symbol);
  const selectedId = useDrawingsStore((s) => s.selectedId);
  const drawings = useDrawingsStore((s) => s.drawings);
  const { clear: clearDrawings, update } = useDrawings();

  // Per-category "active" tool — the one whose icon shows on the button
  const [categoryActive, setCategoryActive] = useState<Record<string, DrawingTool>>(
    () => {
      const m: Record<string, DrawingTool> = {};
      for (const g of TOOL_GROUPS) {
        if (g.label) m[g.label] = g.tools[0].key;
      }
      return m;
    },
  );

  const selected = drawings.find((d) => d.id === selectedId);
  const canAlert = selected && (selected.kind === "hline" || selected.kind === "hray");
  const alertOn = canAlert ? !!selected?.alert?.enabled : false;

  function toggleAlert() {
    if (!selected || !canAlert) return;
    const newAlert: AlertConfig = {
      enabled: !alertOn,
      sound: true,
      direction: "cross",
      lastTriggeredAt: undefined,
    };
    void update(selected.id, { alert: newAlert } as Partial<Drawing>);
  }

  return (
    <aside className="flex w-14 flex-col items-center gap-1 border-r border-tv-border bg-tv-panel py-2">
      {TOOL_GROUPS.map((group, gi) => {
        if (!group.label) {
          // Cursor (no category)
          return group.tools.map((t) => renderSimpleTool(t, tool === t.key, () => setTool(t.key)));
        }
        if (group.tools.length === 1) {
          // Single-tool category: simple button
          const t = group.tools[0];
          return renderSimpleTool(t, tool === t.key, () => setTool(t.key), gi);
        }
        // Multi-tool category: button + dropdown menu
        const activeKey = categoryActive[group.label] ?? group.tools[0].key;
        const activeTool = group.tools.find((t) => t.key === activeKey) ?? group.tools[0];
        const ActiveIcon = activeTool.icon;
        const groupHasActive = group.tools.some((t) => t.key === tool);
        return (
          <div key={gi} className="relative">
            <Tooltip>
              <TooltipTrigger
                onClick={() => setTool(activeTool.key)}
                aria-label={activeTool.label}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded transition-colors hover:bg-tv-panel-hover",
                  groupHasActive
                    ? "bg-tv-blue/15 text-tv-blue"
                    : "text-tv-text-muted hover:text-tv-text",
                )}
              >
                <ActiveIcon className="h-5 w-5" />
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                <div className="font-medium">{activeTool.label}</div>
                {activeTool.hint && (
                  <div className="mt-0.5 text-[10px] text-tv-text-muted">{activeTool.hint}</div>
                )}
              </TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`${group.label} tools`}
                className="absolute -right-0 bottom-0 flex h-3 w-3 items-center justify-center rounded-tl-[2px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
              >
                <ChevronRight className="h-2.5 w-2.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="start"
                sideOffset={4}
                className="min-w-44 bg-tv-panel"
              >
                <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-tv-text-muted">
                  {group.label}
                </div>
                {group.tools.map((t) => {
                  const Icon = t.icon;
                  const isActive = tool === t.key;
                  return (
                    <DropdownMenuItem
                      key={t.key}
                      onClick={() => {
                        setTool(t.key);
                        setCategoryActive((m) => ({ ...m, [group.label!]: t.key }));
                      }}
                      className={cn(
                        "flex items-center gap-2 text-xs",
                        isActive && "bg-tv-blue/15 text-tv-blue",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{t.label}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}

      <div className="mt-auto flex w-full flex-col items-center gap-0.5 pb-0.5">
        <div className="my-1 h-px w-6 bg-tv-border" />

        <Tooltip>
          <TooltipTrigger
            onClick={toggleAlert}
            disabled={!canAlert}
            aria-label="Toggle alert"
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded transition-colors",
              !canAlert && "cursor-not-allowed opacity-30",
              canAlert && alertOn && "bg-tv-yellow/15 text-tv-yellow",
              canAlert && !alertOn && "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
            )}
          >
            {alertOn ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            <div className="font-medium">
              {alertOn ? "Disable alert" : "Enable alert"}
            </div>
            <div className="mt-0.5 text-[10px] text-tv-text-muted">
              {canAlert
                ? "Beeps + toast when price crosses this level"
                : "Select a horizontal line or ray first"}
            </div>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            onClick={() => void clearDrawings(symbol)}
            aria-label="Clear drawings"
            className="flex h-10 w-10 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-red"
          >
            <Trash2 className="h-5 w-5" />
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            <div className="font-medium">Clear drawings</div>
            <div className="mt-0.5 text-[10px] text-tv-text-muted">
              Remove all on this symbol
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}

function renderSimpleTool(
  t: ToolDef,
  active: boolean,
  onClick: () => void,
  key?: React.Key,
) {
  const Icon = t.icon;
  return (
    <Tooltip key={key ?? t.key}>
      <TooltipTrigger
        onClick={onClick}
        aria-label={t.label}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded transition-colors hover:bg-tv-panel-hover",
          active
            ? "bg-tv-blue/15 text-tv-blue"
            : "text-tv-text-muted hover:text-tv-text",
        )}
      >
        <Icon className="h-5 w-5" />
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        <div className="font-medium">{t.label}</div>
        {t.hint && (
          <div className="mt-0.5 text-[10px] text-tv-text-muted">{t.hint}</div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
