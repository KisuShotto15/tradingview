import type React from "react";
import { MousePointer2, type LucideIcon } from "lucide-react";
import type { DrawingTool } from "@/lib/store/chart-store";
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

export type AnyIcon = LucideIcon | React.FC<{ className?: string }>;

export interface ToolDef {
  key: DrawingTool;
  icon: AnyIcon;
  label: string;
  hint?: string;
}

export interface ToolSection {
  label: string;
  tools: ToolDef[];
}

export interface ToolGroup {
  /** The toolbar button's identity (also the flyout title for single-section groups). */
  label: string | null;
  /** Simple group: a flat tool list. */
  tools?: ToolDef[];
  /** Meta-group: a flyout split into labelled sub-sections (TradingView style). */
  sections?: ToolSection[];
}

export const TOOL_GROUPS: ToolGroup[] = [
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
export function groupTools(g: ToolGroup): ToolDef[] {
  return g.sections ? g.sections.flatMap((s) => s.tools) : (g.tools ?? []);
}
/** The flyout sections for a group (a simple group becomes one section). */
export function groupSections(g: ToolGroup): ToolSection[] {
  return g.sections ?? [{ label: g.label ?? "", tools: g.tools ?? [] }];
}

/** Flat lookup: tool key → definition. */
export const ALL_TOOLS: Partial<Record<DrawingTool, ToolDef>> = Object.fromEntries(
  TOOL_GROUPS.flatMap(groupTools).map((t) => [t.key, t]),
);
export const CURSOR_TOOLS = TOOL_GROUPS.find((g) => !g.label)?.tools ?? [];
export const LABELED_GROUPS = TOOL_GROUPS.filter((g) => g.label);
