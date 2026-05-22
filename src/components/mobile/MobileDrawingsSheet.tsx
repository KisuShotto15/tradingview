"use client";

import {
  CalendarRange,
  GripVertical,
  Layers3,
  Minus,
  MousePointer2,
  MoveRight,
  Percent,
  RectangleHorizontal,
  Ruler,
  Slash,
  TrendingUp,
} from "lucide-react";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import { useMobileStore } from "@/lib/store/mobile-store";
import { MobileSheet } from "./MobileSheet";
import { cn } from "@/lib/utils";

/**
 * Mobile-friendly drawing tools picker — fullscreen sheet that replaces the
 * desktop LeftSidebar on small screens. Tapping a tool sets it as active and
 * closes the sheet so the user can immediately start placing on the chart.
 */

type AnyIcon = typeof MousePointer2;

interface ToolDef {
  key: DrawingTool;
  icon: AnyIcon;
  label: string;
  hint: string;
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
      { key: "trendline", icon: TrendingUp, label: "Trend line", hint: "Click start, then end" },
      { key: "ray", icon: Slash, label: "Ray", hint: "Click origin, then direction" },
      { key: "hline", icon: Minus, label: "Horizontal line", hint: "Click a price" },
      { key: "hray", icon: MoveRight, label: "Horizontal ray", hint: "Click anchor — extends right" },
      { key: "vline", icon: GripVertical, label: "Vertical line", hint: "Click a time" },
    ],
  },
  {
    label: "Channels",
    tools: [
      { key: "parallel-channel", icon: Layers3, label: "Parallel channel", hint: "A → B (baseline) → C (offset)" },
    ],
  },
  {
    label: "Fibonacci",
    tools: [
      { key: "fib-retracement", icon: Percent, label: "Fib retracement", hint: "Swing high → swing low" },
    ],
  },
  {
    label: "Ranges",
    tools: [
      { key: "price-range", icon: RectangleHorizontal, label: "Price range", hint: "Two prices" },
      { key: "date-range", icon: CalendarRange, label: "Date range", hint: "Two timestamps" },
    ],
  },
  {
    label: "Trade",
    tools: [
      { key: "long", icon: TrendingUp, label: "Long position", hint: "Entry + target; stop auto-set" },
      { key: "short", icon: TrendingUp, label: "Short position", hint: "Entry + target; stop auto-set" },
    ],
  },
  {
    label: "Tools",
    tools: [
      { key: "measure", icon: Ruler, label: "Measure", hint: "Δ price / % / bars" },
    ],
  },
];

export function MobileDrawingsSheet() {
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const closeSheet = useMobileStore((s) => s.closeSheet);

  function pick(t: DrawingTool) {
    setTool(t);
    closeSheet();
  }

  return (
    <MobileSheet title="Drawing tools" onClose={closeSheet}>
      <div>
        {TOOL_GROUPS.map((g) => (
          <section key={g.label ?? "default"}>
            {g.label && (
              <h3 className="bg-tv-panel/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
                {g.label}
              </h3>
            )}
            {g.tools.map((t) => {
              const Icon = t.icon;
              const active = tool === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => pick(t.key)}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-tv-border/60 px-3 py-3 text-left active:bg-tv-panel-hover",
                    active && "bg-tv-blue/15",
                  )}
                >
                  <Icon className={cn("h-5 w-5", active ? "text-tv-blue" : "text-tv-text-muted")} />
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium">{t.label}</span>
                    <span className="text-[10px] text-tv-text-muted">{t.hint}</span>
                  </div>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </MobileSheet>
  );
}
