"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Settings, X } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";

interface Props {
  name: string;
  value?: string;
  color: string;
  hidden: boolean;
  onToggleHide: () => void;
  onSettings: () => void;
  onRemove: () => void;
}

/**
 * The legend chip for one study, sitting over the chart.
 *
 * On a phone the three action buttons are collapsed until the chip is tapped.
 * Carrying them always, as the desktop chip does, cost about a third of the
 * plot width per study and stacked: with a couple of EMAs, volume, RSI and
 * Stoch RSI the chips covered more of the candles than the candles did. That
 * is also how TradingView's own mobile chart behaves — the study name alone,
 * with its controls one tap away — and the reason the layout reads as calm
 * there and as clutter here.
 *
 * Expanding is a tap rather than a long-press on purpose: a long-press on the
 * chart is already the drawing context gesture, and overloading it here would
 * make the chip feel like part of the canvas.
 */
export function IndicatorPill({
  name,
  value,
  color,
  hidden,
  onToggleHide,
  onSettings,
  onRemove,
}: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Tapping anywhere else puts the chip back to its compact form, so a forgotten
  // open chip can't go on covering the chart.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const showActions = !isMobile || open;

  return (
    <div
      ref={ref}
      onClick={isMobile ? () => setOpen((o) => !o) : undefined}
      className={cn(
        "group/pill pointer-events-auto flex items-center rounded bg-tv-panel/95 shadow-sm ring-1 ring-tv-border backdrop-blur",
        // Tighter on a phone: the chip is a label there, not a toolbar.
        isMobile ? "gap-1 px-1 py-0 text-[11px]" : "gap-1.5 px-1.5 py-0.5 text-[11px]",
        hidden && "opacity-50",
        isMobile && "cursor-pointer select-none",
      )}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span className="font-medium text-tv-text">{name}</span>
      {value !== undefined && (
        <span className="tabular-nums text-tv-text-muted">{value}</span>
      )}
      {showActions && (
        <div className="ml-1 flex items-center gap-0.5">
          <button
            onClick={onToggleHide}
            title={hidden ? "Show" : "Hide"}
            aria-label={hidden ? "Show" : "Hide"}
            className={cn(
              "rounded text-tv-text-dim transition-colors hover:bg-tv-panel-hover hover:text-tv-text",
              isMobile ? "p-1" : "p-0.5",
            )}
          >
            {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </button>
          <button
            onClick={onSettings}
            title="Settings"
            aria-label="Settings"
            className={cn(
              "rounded text-tv-text-dim transition-colors hover:bg-tv-panel-hover hover:text-tv-text",
              isMobile ? "p-1" : "p-0.5",
            )}
          >
            <Settings className="h-3 w-3" />
          </button>
          <button
            onClick={onRemove}
            title="Remove"
            aria-label="Remove"
            className={cn(
              "rounded text-tv-text-dim transition-colors hover:bg-tv-panel-hover hover:text-tv-red",
              isMobile ? "p-1" : "p-0.5",
            )}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
