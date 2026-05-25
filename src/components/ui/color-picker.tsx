"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** TradingView color palette — each row is a hue family, dark → light left to right. */
const PALETTE_ROWS: string[][] = [
  // Grayscale
  ["#000000", "#1e222d", "#2a2e39", "#363a45", "#434651", "#787b86", "#9598a1", "#b2b5be", "#d1d4dc", "#ffffff"],
  // Red
  ["#4e0000", "#730000", "#990000", "#c62828", "#e53935", "#ef5350", "#f47272", "#f99898", "#fbbebe", "#fce8e8"],
  // Orange
  ["#3d1200", "#6b2200", "#9e3600", "#c84a00", "#e65100", "#f57c00", "#fb8c00", "#ffa726", "#ffcc80", "#fff3e0"],
  // Yellow
  ["#2d2600", "#4d3f00", "#6e5900", "#917300", "#b89200", "#ddb800", "#f9dc00", "#fff176", "#fff9c4", "#fffde7"],
  // Green
  ["#003000", "#004d00", "#006600", "#1b5e20", "#2e7d32", "#388e3c", "#43a047", "#66bb6a", "#a5d6a7", "#e8f5e9"],
  // Teal
  ["#003030", "#004d49", "#006e69", "#00897b", "#009688", "#26a69a", "#4db6ac", "#80cbc4", "#b2dfdb", "#e0f2f1"],
  // Blue (standard)
  ["#001a66", "#0d2f99", "#1565c0", "#1976d2", "#1e88e5", "#2196f3", "#42a5f5", "#64b5f6", "#90caf9", "#bbdefb"],
  // TradingView blue (primary: #2962ff)
  ["#001266", "#0d1fa8", "#1631e0", "#2962ff", "#3d71ff", "#5585ff", "#7ba2ff", "#a8bfff", "#c5d2ff", "#e0e8ff"],
  // Purple
  ["#1a0040", "#2d006e", "#4a0099", "#6a1ab3", "#7b1fa2", "#9c27b0", "#ab47bc", "#ba68c8", "#ce93d8", "#e1bee7"],
  // Pink / Magenta
  ["#2d0025", "#500040", "#800066", "#ad1457", "#c2185b", "#e91e63", "#f06292", "#f48fb1", "#f8bbd0", "#fce4ec"],
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

/**
 * Color picker with a preset palette, opacity slider and custom color input.
 * Output is a CSS color string: hex (#RRGGBB) when opacity is 1, otherwise rgba().
 */
export function ColorPicker({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const { hex, opacity } = parseColor(value);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (
        !popupRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function pickHex(h: string) {
    onChange(formatColor(h, opacity));
  }

  function changeOpacity(op: number) {
    onChange(formatColor(hex, op));
  }

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Pick color"
        className="h-7 w-9 cursor-pointer rounded border border-tv-border"
        style={
          opacity < 0.99
            ? {
                backgroundImage: `linear-gradient(${value}, ${value}), linear-gradient(45deg, #444 25%, transparent 25%, transparent 75%, #444 75%), linear-gradient(45deg, #444 25%, transparent 25%, transparent 75%, #444 75%)`,
                backgroundSize: "100% 100%, 8px 8px, 8px 8px",
                backgroundPosition: "0 0, 0 0, 4px 4px",
              }
            : { background: value }
        }
      />
      {open && (
        <div
          ref={popupRef}
          className="absolute right-0 top-full z-50 mt-1 w-[280px] rounded-md border border-tv-border bg-tv-panel p-3 shadow-xl"
        >
          <div className="grid grid-cols-10 gap-[3px]">
            {PALETTE_ROWS.flat().map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => pickHex(c)}
                title={c}
                className={cn(
                  "h-5 w-5 rounded-[3px] border transition-transform hover:scale-110",
                  c === hex
                    ? "border-tv-blue ring-1 ring-tv-blue"
                    : "border-tv-border/30",
                )}
                style={{ background: c }}
              />
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-tv-border pt-3">
            <div
              className="h-6 w-6 rounded border border-tv-border"
              style={
                opacity < 0.99
                  ? {
                      backgroundImage: `linear-gradient(${value}, ${value}), linear-gradient(45deg, #444 25%, transparent 25%, transparent 75%, #444 75%), linear-gradient(45deg, #444 25%, transparent 25%, transparent 75%, #444 75%)`,
                      backgroundSize: "100% 100%, 6px 6px, 6px 6px",
                      backgroundPosition: "0 0, 0 0, 3px 3px",
                    }
                  : { background: value }
              }
            />
            <label
              title="Add custom color"
              className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-tv-border text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
            >
              <Plus className="h-3 w-3" />
              <input
                type="color"
                value={hex}
                onChange={(e) => pickHex(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            <span className="ml-auto font-mono text-[10px] uppercase text-tv-text-muted">
              {hex}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
              Opacity
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(opacity * 100)}
              onChange={(e) => changeOpacity(parseInt(e.target.value, 10) / 100)}
              className="flex-1 accent-tv-blue"
            />
            <span className="w-10 rounded bg-tv-bg px-1 text-right text-[10px] tabular-nums text-tv-text-muted">
              {Math.round(opacity * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

interface ParsedColor {
  hex: string;
  opacity: number;
}

function parseColor(s: string): ParsedColor {
  if (!s) return { hex: "#ffffff", opacity: 1 };
  if (s.startsWith("#")) {
    if (s.length === 9) {
      return {
        hex: s.slice(0, 7),
        opacity: parseInt(s.slice(7, 9), 16) / 255,
      };
    }
    if (s.length === 7) return { hex: s, opacity: 1 };
    if (s.length === 4) {
      const r = s[1];
      const g = s[2];
      const b = s[3];
      return { hex: `#${r}${r}${g}${g}${b}${b}`, opacity: 1 };
    }
  }
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) {
    const r = clamp(parseInt(m[1], 10), 0, 255);
    const g = clamp(parseInt(m[2], 10), 0, 255);
    const b = clamp(parseInt(m[3], 10), 0, 255);
    const a = m[4] !== undefined ? clamp(parseFloat(m[4]), 0, 1) : 1;
    return {
      hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
      opacity: a,
    };
  }
  return { hex: "#ffffff", opacity: 1 };
}

function formatColor(hex: string, opacity: number): string {
  const op = clamp(opacity, 0, 1);
  if (op >= 0.999) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${op.toFixed(2)})`;
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, "0");
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
