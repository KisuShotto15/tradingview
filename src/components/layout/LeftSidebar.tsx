"use client";

import React, { useState } from "react";
import {
  MousePointer2,
  Bell,
  BellOff,
  ChevronRight,
  Star,
  Trash2,
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
import {
  TrendLineToolIcon,
  RayToolIcon,
  HLineToolIcon,
  HRayToolIcon,
  VLineToolIcon,
  ArrowToolIcon,
  ParallelChannelToolIcon,
  PitchforkToolIcon,
  FibRetraceToolIcon,
  FibExtToolIcon,
  XabcdToolIcon,
  PriceRangeToolIcon,
  DateRangeToolIcon,
  RectangleToolIcon,
  BrushToolIcon,
  HighlighterToolIcon,
  TextToolIcon,
  CalloutToolIcon,
  MeasureToolIcon,
  LongPositionToolIcon,
  ShortPositionToolIcon,
} from "./tool-icons";

type AnyIcon = LucideIcon | React.FC<{ className?: string }>;

interface ToolDef {
  key: DrawingTool;
  icon: AnyIcon;
  label: string;
  hint?: string;
}

interface ToolSection {
  label: string;
  tools: ToolDef[];
}

interface ToolGroup {
  /** The toolbar button's identity (also the flyout title for single-section groups). */
  label: string | null;
  /** Simple group: a flat tool list. */
  tools?: ToolDef[];
  /** Meta-group: a flyout split into labelled sub-sections (TradingView style). */
  sections?: ToolSection[];
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    label: null,
    tools: [{ key: "cursor", icon: MousePointer2, label: "Cursor", hint: "Pan & navigate" }],
  },
  // TradingView groups Lines, Channels and Pitchforks under one "Lines" button.
  {
    label: "Lines",
    sections: [
      {
        label: "Lines",
        tools: [
          { key: "trendline", icon: TrendLineToolIcon, label: "Trend line", hint: "Click start, then end. Drag endpoints to edit" },
          { key: "ray", icon: RayToolIcon, label: "Ray", hint: "Click origin, then direction — extends to infinity" },
          { key: "arrow", icon: ArrowToolIcon, label: "Arrow", hint: "Click start, then end — draws a line with an arrowhead" },
          { key: "hline", icon: HLineToolIcon, label: "Horizontal line", hint: "Click to mark a price across the chart" },
          { key: "hray", icon: HRayToolIcon, label: "Horizontal ray", hint: "Click anchor — extends to the right" },
          { key: "vline", icon: VLineToolIcon, label: "Vertical line", hint: "Click to mark a time across the chart" },
        ],
      },
      {
        label: "Channels",
        tools: [
          { key: "parallel-channel", icon: ParallelChannelToolIcon, label: "Parallel channel", hint: "Click A, then B (baseline), then C (parallel offset)" },
        ],
      },
      {
        label: "Pitchforks",
        tools: [
          { key: "pitchfork", icon: PitchforkToolIcon, label: "Pitchfork", hint: "Click A, then B and C — draws the Andrews median + tines" },
        ],
      },
    ],
  },
  {
    label: "Fibonacci",
    tools: [
      { key: "fib-retracement", icon: FibRetraceToolIcon, label: "Fib retracement", hint: "Click swing high, then swing low (or vice versa)" },
      { key: "fib-extension", icon: FibExtToolIcon, label: "Fib extension", hint: "Click A, B, then C — projects extension levels from C" },
    ],
  },
  {
    label: "Patterns",
    tools: [
      { key: "xabcd", icon: XabcdToolIcon, label: "XABCD pattern", hint: "Click five points (X, A, B, C, D) — shows leg ratios" },
    ],
  },
  {
    label: "Ranges",
    tools: [
      { key: "price-range", icon: PriceRangeToolIcon, label: "Price range", hint: "Click two prices to measure absolute & % range" },
      { key: "date-range", icon: DateRangeToolIcon, label: "Date range", hint: "Click two timestamps to measure duration" },
    ],
  },
  {
    label: "Positions",
    tools: [
      { key: "long", icon: LongPositionToolIcon, label: "Long position", hint: "Click entry, then target. Stop auto-set; drag handles to edit" },
      { key: "short", icon: ShortPositionToolIcon, label: "Short position", hint: "Click entry, then target. Stop auto-set; drag handles to edit" },
    ],
  },
  {
    label: "Shapes",
    tools: [{ key: "rectangle", icon: RectangleToolIcon, label: "Rectangle", hint: "Click two corners to draw a rectangle" }],
  },
  {
    label: "Brushes",
    tools: [
      { key: "brush", icon: BrushToolIcon, label: "Brush", hint: "Click and drag to draw freehand on the chart" },
      { key: "highlighter", icon: HighlighterToolIcon, label: "Highlighter", hint: "Click and drag to highlight areas on the chart" },
    ],
  },
  {
    label: "Annotations",
    tools: [
      { key: "text", icon: TextToolIcon, label: "Text", hint: "Click to place a text label, then type. Double-click to edit" },
      { key: "callout", icon: CalloutToolIcon, label: "Callout", hint: "Click the point to mark, then the bubble position, then type" },
    ],
  },
  {
    label: "Measure",
    tools: [{ key: "measure", icon: MeasureToolIcon, label: "Measure", hint: "Click two points to measure Δ price, %, bars, volume" }],
  },
];

/** All tools in a group (flattening sub-sections). */
function groupTools(g: ToolGroup): ToolDef[] {
  return g.sections ? g.sections.flatMap((s) => s.tools) : (g.tools ?? []);
}
/** The flyout sections for a group (a simple group becomes one section). */
function groupSections(g: ToolGroup): ToolSection[] {
  return g.sections ?? [{ label: g.label ?? "", tools: g.tools ?? [] }];
}

/** Flat lookup so the favorites strip can resolve a tool key to its definition. */
const ALL_TOOLS: Partial<Record<DrawingTool, ToolDef>> = Object.fromEntries(
  TOOL_GROUPS.flatMap(groupTools).map((t) => [t.key, t]),
);
const CURSOR_TOOLS = TOOL_GROUPS.find((g) => !g.label)?.tools ?? [];
const LABELED_GROUPS = TOOL_GROUPS.filter((g) => g.label);

/**
 * A single tool button. Right-click toggles favorite (works for every tool,
 * including single-tool categories that have no flyout). Favorited tools show a
 * small star badge.
 */
function ToolButton({
  t,
  active,
  favorite,
  onSelect,
  onToggleFavorite,
}: {
  t: ToolDef;
  active: boolean;
  favorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const Icon = t.icon;
  return (
    <Tooltip>
      <TooltipTrigger
        onClick={onSelect}
        onContextMenu={(e) => {
          e.preventDefault();
          onToggleFavorite();
        }}
        aria-label={t.label}
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded transition-colors hover:bg-tv-panel-hover",
          active ? "bg-tv-blue/15 text-tv-blue" : "text-tv-text-muted hover:text-tv-text",
        )}
      >
        <Icon className="h-5 w-5" />
        {favorite && <Star className="absolute right-0.5 top-0.5 h-2 w-2 fill-tv-yellow text-tv-yellow" />}
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        <div className="font-medium">{t.label}</div>
        {t.hint && <div className="mt-0.5 text-[10px] text-tv-text-muted">{t.hint}</div>}
        <div className="mt-0.5 text-[10px] text-tv-text-dim">
          {favorite ? "Right-click to unfavorite" : "Right-click to favorite"}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function LeftSidebar() {
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const symbol = useChartStore((s) => s.symbol);
  const favoriteTools = useChartStore((s) => s.favoriteTools);
  const toggleFavoriteTool = useChartStore((s) => s.toggleFavoriteTool);
  const selectedId = useDrawingsStore((s) => s.selectedId);
  const drawings = useDrawingsStore((s) => s.drawings);
  const { clear: clearDrawings, update } = useDrawings();

  // Per-category "active" tool — the one whose icon shows on the button.
  const [categoryActive, setCategoryActive] = useState<Record<string, DrawingTool>>(() => {
    const m: Record<string, DrawingTool> = {};
    for (const g of LABELED_GROUPS) {
      if (g.label) m[g.label] = groupTools(g)[0].key;
    }
    return m;
  });

  const selected = drawings.find((d) => d.id === selectedId);
  const canAlert =
    selected &&
    (selected.kind === "hline" ||
      selected.kind === "hray" ||
      selected.kind === "trendline" ||
      selected.kind === "ray");
  const alertOn = canAlert ? !!selected?.alert?.enabled : false;

  function toggleAlert() {
    if (!selected || !canAlert) return;
    const newAlert: AlertConfig = { enabled: !alertOn, sound: true, direction: "cross", lastTriggeredAt: undefined };
    void update(selected.id, { alert: newAlert } as Partial<Drawing>);
  }

  const favoriteDefs = favoriteTools
    .filter((k) => k !== "cursor")
    .map((k) => ALL_TOOLS[k])
    .filter((t): t is ToolDef => !!t);

  return (
    <aside className="flex w-14 flex-col items-center gap-1 border-r border-tv-border bg-tv-panel py-2">
      {/* Cursor */}
      {CURSOR_TOOLS.map((t) => (
        <ToolButton
          key={t.key}
          t={t}
          active={tool === t.key}
          favorite={false}
          onSelect={() => setTool(t.key)}
          onToggleFavorite={() => {}}
        />
      ))}

      {/* Favorites strip */}
      {favoriteDefs.length > 0 && (
        <>
          {favoriteDefs.map((t) => (
            <ToolButton
              key={`fav-${t.key}`}
              t={t}
              active={tool === t.key}
              favorite
              onSelect={() => setTool(t.key)}
              onToggleFavorite={() => toggleFavoriteTool(t.key)}
            />
          ))}
          <div className="my-1 h-px w-6 bg-tv-border" />
        </>
      )}

      {/* Tool categories */}
      {LABELED_GROUPS.map((group, gi) => {
        const tools = groupTools(group);
        if (tools.length === 1) {
          const t = tools[0];
          return (
            <ToolButton
              key={group.label}
              t={t}
              active={tool === t.key}
              favorite={favoriteTools.includes(t.key)}
              onSelect={() => setTool(t.key)}
              onToggleFavorite={() => toggleFavoriteTool(t.key)}
            />
          );
        }
        const activeKey = categoryActive[group.label!] ?? tools[0].key;
        const activeTool = tools.find((t) => t.key === activeKey) ?? tools[0];
        const ActiveIcon = activeTool.icon;
        const groupHasActive = tools.some((t) => t.key === tool);
        return (
          <div key={gi} className="relative">
            <Tooltip>
              <TooltipTrigger
                onClick={() => setTool(activeTool.key)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  toggleFavoriteTool(activeTool.key);
                }}
                aria-label={activeTool.label}
                className={cn(
                  "relative flex h-10 w-10 items-center justify-center rounded transition-colors hover:bg-tv-panel-hover",
                  groupHasActive ? "bg-tv-blue/15 text-tv-blue" : "text-tv-text-muted hover:text-tv-text",
                )}
              >
                <ActiveIcon className="h-5 w-5" />
                {favoriteTools.includes(activeTool.key) && (
                  <Star className="absolute right-0.5 top-0.5 h-2 w-2 fill-tv-yellow text-tv-yellow" />
                )}
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                <div className="font-medium">{activeTool.label}</div>
                {activeTool.hint && <div className="mt-0.5 text-[10px] text-tv-text-muted">{activeTool.hint}</div>}
              </TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`${group.label} tools`}
                className="absolute -right-0 bottom-0 flex h-3 w-3 items-center justify-center rounded-tl-[2px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
              >
                <ChevronRight className="h-2.5 w-2.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" sideOffset={4} className="min-w-52 bg-tv-panel">
                {groupSections(group).map((section) => (
                  <React.Fragment key={section.label}>
                    <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-tv-text-muted">
                      {section.label}
                    </div>
                    {section.tools.map((t) => {
                      const Icon = t.icon;
                      const isActive = tool === t.key;
                      const isFav = favoriteTools.includes(t.key);
                      return (
                        <DropdownMenuItem
                          key={t.key}
                          onClick={() => {
                            setTool(t.key);
                            setCategoryActive((m) => ({ ...m, [group.label!]: t.key }));
                          }}
                          className={cn("flex items-center gap-2 text-xs", isActive && "bg-tv-blue/15 text-tv-blue")}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{t.label}</span>
                          <span
                            role="button"
                            aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                            title={isFav ? "Remove from favorites" : "Add to favorites"}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleFavoriteTool(t.key);
                            }}
                            className="ml-auto flex h-5 w-5 items-center justify-center rounded text-tv-text-dim hover:bg-tv-panel-hover hover:text-tv-yellow"
                          >
                            <Star className={cn("h-3.5 w-3.5", isFav && "fill-tv-yellow text-tv-yellow")} />
                          </span>
                        </DropdownMenuItem>
                      );
                    })}
                  </React.Fragment>
                ))}
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
            <div className="font-medium">{alertOn ? "Disable alert" : "Enable alert"}</div>
            <div className="mt-0.5 text-[10px] text-tv-text-muted">
              {canAlert ? "Beeps + toast when price crosses this line" : "Select a horizontal/trend line or ray first"}
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
            <div className="mt-0.5 text-[10px] text-tv-text-muted">Remove all on this symbol</div>
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
