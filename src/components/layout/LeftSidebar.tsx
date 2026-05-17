"use client";

import {
  MousePointer2,
  Minus,
  ArrowDownToLine,
  ArrowUpToLine,
  Bell,
  BellOff,
  CalendarRange,
  GripVertical,
  Layers3,
  MoveRight,
  Percent,
  RectangleHorizontal,
  Ruler,
  Slash,
  Trash2,
  TrendingUp,
  Undo2,
  Redo2,
  type LucideIcon,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useDrawings } from "@/lib/supabase/use-drawings";
import type { Drawing, AlertConfig } from "@/lib/drawings/types";
import { cn } from "@/lib/utils";

interface ToolDef {
  key: DrawingTool;
  icon: LucideIcon;
  label: string;
  hint?: string;
}

const TOOLS: ToolDef[] = [
  { key: "cursor", icon: MousePointer2, label: "Cursor", hint: "Pan & navigate" },
  {
    key: "hline",
    icon: Minus,
    label: "Horizontal line",
    hint: "Click to mark a price across the chart",
  },
  {
    key: "vline",
    icon: GripVertical,
    label: "Vertical line",
    hint: "Click to mark a time across the chart",
  },
  {
    key: "hray",
    icon: MoveRight,
    label: "Horizontal ray",
    hint: "Click anchor — extends to the right",
  },
  {
    key: "trendline",
    icon: TrendingUp,
    label: "Trend line",
    hint: "Click start, then end. Drag endpoints to edit",
  },
  {
    key: "ray",
    icon: Slash,
    label: "Ray",
    hint: "Click origin, then direction — extends to infinity",
  },
  {
    key: "parallel-channel",
    icon: Layers3,
    label: "Parallel channel",
    hint: "Click A, then B (baseline), then C (parallel offset)",
  },
  {
    key: "fib-retracement",
    icon: Percent,
    label: "Fib retracement",
    hint: "Click swing high, then swing low (or vice versa)",
  },
  {
    key: "price-range",
    icon: RectangleHorizontal,
    label: "Price range",
    hint: "Click two prices to measure absolute & % range",
  },
  {
    key: "date-range",
    icon: CalendarRange,
    label: "Date range",
    hint: "Click two timestamps to measure duration",
  },
  {
    key: "long",
    icon: ArrowUpToLine,
    label: "Long position",
    hint: "Click entry, then target. Stop auto-set; drag handles to edit",
  },
  {
    key: "short",
    icon: ArrowDownToLine,
    label: "Short position",
    hint: "Click entry, then target. Stop auto-set; drag handles to edit",
  },
  {
    key: "measure",
    icon: Ruler,
    label: "Measure",
    hint: "Click two points to measure Δ price, %, bars, volume",
  },
];

export function LeftSidebar() {
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const symbol = useChartStore((s) => s.symbol);
  const selectedId = useDrawingsStore((s) => s.selectedId);
  const drawings = useDrawingsStore((s) => s.drawings);
  const { clear: clearDrawings, undo, redo, update } = useDrawings();

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
    <aside className="flex w-11 flex-col items-center gap-0.5 border-r border-tv-border bg-tv-panel py-1.5">
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const active = tool === t.key;
        return (
          <Tooltip key={t.key}>
            <TooltipTrigger
              onClick={() => setTool(t.key)}
              aria-label={t.label}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-tv-panel-hover",
                active
                  ? "bg-tv-blue/15 text-tv-blue"
                  : "text-tv-text-muted hover:text-tv-text",
              )}
            >
              <Icon className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              <div className="font-medium">{t.label}</div>
              {t.hint && (
                <div className="mt-0.5 text-[10px] text-tv-text-muted">{t.hint}</div>
              )}
            </TooltipContent>
          </Tooltip>
        );
      })}

      <div className="my-1 h-px w-6 bg-tv-border" />

      <Tooltip>
        <TooltipTrigger
          onClick={() => void undo()}
          aria-label="Undo"
          className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <Undo2 className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          <div className="font-medium">Undo</div>
          <div className="mt-0.5 text-[10px] text-tv-text-muted">Ctrl+Z</div>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          onClick={() => void redo()}
          aria-label="Redo"
          className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <Redo2 className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          <div className="font-medium">Redo</div>
          <div className="mt-0.5 text-[10px] text-tv-text-muted">Ctrl+Shift+Z</div>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          onClick={toggleAlert}
          disabled={!canAlert}
          aria-label="Toggle alert"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded transition-colors",
            !canAlert && "cursor-not-allowed opacity-30",
            canAlert && alertOn && "bg-tv-yellow/15 text-tv-yellow",
            canAlert && !alertOn && "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
          )}
        >
          {alertOn ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
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
          className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-red"
        >
          <Trash2 className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          <div className="font-medium">Clear drawings</div>
          <div className="mt-0.5 text-[10px] text-tv-text-muted">
            Remove all on this symbol
          </div>
        </TooltipContent>
      </Tooltip>
    </aside>
  );
}
