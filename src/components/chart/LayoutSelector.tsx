"use client";

import { Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LAYOUTS, layoutSpec, type LayoutSpec } from "@/lib/chart/layouts";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

/**
 * The layout's own picture, drawn from its grid rather than kept as a set of
 * hand-drawn icons — one per layout would be six near-identical SVGs to keep
 * in step with `LAYOUTS`, and adding a layout would mean remembering to draw
 * one. The cells are inset by half a stroke so the outer edges are not clipped.
 */
function LayoutIcon({ spec, className }: { spec: LayoutSpec; className?: string }) {
  const S = 14;
  const pad = 1;
  const inner = S - pad * 2;
  const w = inner / spec.cols;
  const h = inner / spec.rows;
  const cells = [];
  for (let r = 0; r < spec.rows; r++) {
    for (let c = 0; c < spec.cols; c++) {
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={pad + c * w}
          y={pad + r * h}
          width={w}
          height={h}
          rx={1}
        />,
      );
    }
  }
  return (
    <svg
      viewBox={`0 0 ${S} ${S}`}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.1}
    >
      {cells}
    </svg>
  );
}

/**
 * Chart-layout picker: how many charts the page shows, and in what grid.
 *
 * Switching layout never discards a pane's symbol — `setLayout` keeps the
 * panes it can and seeds new ones from the focused chart, so going 1 → 4 → 1
 * leaves you where you started.
 */
export function LayoutSelector() {
  const layout = useChartStore((s) => s.layout);
  const setLayout = useChartStore((s) => s.setLayout);
  const current = layoutSpec(layout);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Chart layout"
        title={current.label}
        className="flex h-7 w-7 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <LayoutIcon spec={current} className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[190px] bg-tv-panel">
        {LAYOUTS.map((spec) => {
          const active = spec.kind === layout;
          return (
            <DropdownMenuItem
              key={spec.kind}
              onClick={() => setLayout(spec.kind)}
              aria-label={spec.label}
              className={cn("flex items-center gap-2 text-xs", active && "bg-tv-panel-hover")}
            >
              <LayoutIcon spec={spec} className="h-3.5 w-3.5 text-tv-text-muted" />
              <span className="flex-1">{spec.label}</span>
              {active && <Check className="h-3 w-3 text-tv-text" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
