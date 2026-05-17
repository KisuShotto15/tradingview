"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Material-inspired 10×10 palette + grayscale row at the top. */
const PALETTE_ROWS: string[][] = [
  ["#ffffff", "#f5f5f5", "#e0e0e0", "#bdbdbd", "#9e9e9e", "#757575", "#616161", "#424242", "#212121", "#000000"],
  ["#ffebee", "#ffcdd2", "#ef9a9a", "#e57373", "#ef5350", "#f44336", "#e53935", "#d32f2f", "#c62828", "#b71c1c"],
  ["#fff3e0", "#ffe0b2", "#ffcc80", "#ffb74d", "#ffa726", "#ff9800", "#fb8c00", "#f57c00", "#ef6c00", "#e65100"],
  ["#fffde7", "#fff9c4", "#fff59d", "#fff176", "#ffee58", "#ffeb3b", "#fdd835", "#fbc02d", "#f9a825", "#f57f17"],
  ["#e8f5e9", "#c8e6c9", "#a5d6a7", "#81c784", "#66bb6a", "#4caf50", "#43a047", "#388e3c", "#2e7d32", "#1b5e20"],
  ["#e0f7fa", "#b2ebf2", "#80deea", "#4dd0e1", "#26c6da", "#00bcd4", "#00acc1", "#0097a7", "#00838f", "#006064"],
  ["#e3f2fd", "#bbdefb", "#90caf9", "#64b5f6", "#42a5f5", "#2196f3", "#1e88e5", "#1976d2", "#1565c0", "#0d47a1"],
  ["#ede7f6", "#d1c4e9", "#b39ddb", "#9575cd", "#7e57c2", "#673ab7", "#5e35b1", "#512da8", "#4527a0", "#311b92"],
  ["#fce4ec", "#f8bbd0", "#f48fb1", "#f06292", "#ec407a", "#e91e63", "#d81b60", "#c2185b", "#ad1457", "#880e4f"],
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
        style={{
          background: `linear-gradient(45deg, #555 25%, transparent 25%, transparent 75%, #555 75%) 0 0/8px 8px, ${value}`,
        }}
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
              style={{
                background: `linear-gradient(45deg, #555 25%, transparent 25%, transparent 75%, #555 75%) 0 0/6px 6px, ${value}`,
              }}
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
