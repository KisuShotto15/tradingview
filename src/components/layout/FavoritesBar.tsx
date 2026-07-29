"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ALL_TOOLS, type ToolDef } from "./drawing-tools";

/**
 * Floating, draggable favorites toolbar (TradingView style). Renders over the
 * chart rather than inside the vertical drawing sidebar. Shows the user's
 * starred tools; right-click a tool to remove it from favorites.
 */
export function FavoritesBar() {
  const favoriteTools = useChartStore((s) => s.favoriteTools);
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const toggleFavoriteTool = useChartStore((s) => s.toggleFavoriteTool);

  const barRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);

  const favs = favoriteTools
    .filter((k) => k !== "cursor")
    .map((k) => ALL_TOOLS[k])
    .filter((t): t is ToolDef => !!t);

  // Center horizontally near the top the first time it appears.
  useLayoutEffect(() => {
    if (pos || !barRef.current || favs.length === 0) return;
    const parent = barRef.current.offsetParent as HTMLElement | null;
    const pw = parent?.clientWidth ?? 0;
    const bw = barRef.current.offsetWidth;
    setPos({ x: Math.max(8, Math.round((pw - bw) / 2)), y: 8 });
  }, [pos, favs.length]);

  if (favs.length === 0) return null;

  function clampToParent(x: number, y: number) {
    const parent = barRef.current?.offsetParent as HTMLElement | null;
    const bw = barRef.current?.offsetWidth ?? 0;
    const bh = barRef.current?.offsetHeight ?? 0;
    const pw = parent?.clientWidth ?? Infinity;
    const ph = parent?.clientHeight ?? Infinity;
    return {
      x: Math.max(0, Math.min(x, pw - bw)),
      y: Math.max(0, Math.min(y, ph - bh)),
    };
  }

  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    dragRef.current = { ox: e.clientX, oy: e.clientY, px: pos?.x ?? 0, py: pos?.y ?? 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const nx = dragRef.current.px + e.clientX - dragRef.current.ox;
    const ny = dragRef.current.py + e.clientY - dragRef.current.oy;
    setPos(clampToParent(nx, ny));
  }
  function endDrag() {
    dragRef.current = null;
  }

  return (
    <div
      ref={barRef}
      className="pointer-events-auto absolute z-30 flex items-center gap-0.5 rounded-md border border-tv-border bg-tv-panel/95 p-0.5 shadow-lg backdrop-blur"
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? 8, userSelect: "none" }}
    >
      <div
        className="flex cursor-grab items-center px-0.5 text-tv-text-dim hover:text-tv-text-muted active:cursor-grabbing"
        onPointerDown={startDrag}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        title="Drag to move"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      {favs.map((t) => {
        const Icon = t.icon;
        const active = tool === t.key;
        return (
          <Tooltip key={t.key}>
            <TooltipTrigger
              onClick={() => setTool(t.key)}
              onContextMenu={(e) => {
                e.preventDefault();
                toggleFavoriteTool(t.key);
              }}
              aria-label={t.label}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-tv-panel-hover",
                active ? "bg-tv-blue/15 text-tv-blue" : "text-tv-text-muted hover:text-tv-text",
              )}
            >
              <Icon className="h-6 w-6" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <div className="font-medium">{t.label}</div>
              <div className="mt-0.5 text-[10px] text-tv-text-dim">Right-click to remove from favorites</div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
