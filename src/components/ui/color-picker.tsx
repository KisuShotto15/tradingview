"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * TradingView-style palette.
 * Layout: columns = hue families, rows = lightness levels (light at top → dark at bottom).
 * Row 0 = grayscale from white (#ffffff, leftmost) to black (#000000, rightmost).
 * Rows 1-9 = 10 hue columns, lightest tints in row 1 down to near-black in row 9.
 *
 * Columns: [red, orange, yellow, lime, green, teal, sky-blue, TV-blue, purple, pink]
 */
const PALETTE_ROWS: string[][] = [
  // Row 0 — Grayscale: white → black
  ["#ffffff", "#d6d6d6", "#b3b3b3", "#919191", "#6e6e6e", "#4b4b4b", "#363636", "#242424", "#141414", "#000000"],
  // Row 1 — Lightest tints
  ["#fce8e8", "#fff3e0", "#fffde7", "#f9fbe7", "#e8f5e9", "#e0f2f1", "#e3f2fd", "#e8edff", "#f3e5f5", "#fce4ec"],
  // Row 2
  ["#f9b3b3", "#ffcc80", "#fff59d", "#f0f4c3", "#c8e6c9", "#b2dfdb", "#bbdefb", "#c5d2ff", "#e1bee7", "#f8bbd0"],
  // Row 3
  ["#f47272", "#ffb74d", "#ffee58", "#dce775", "#81c784", "#4db6ac", "#64b5f6", "#82b1ff", "#ba68c8", "#f06292"],
  // Row 4 — Vivid / saturated (TradingView primary shades)
  ["#ef5350", "#ff9800", "#ffeb3b", "#c6ca52", "#4caf50", "#26a69a", "#2196f3", "#448aff", "#9c27b0", "#e91e63"],
  // Row 5
  ["#e53935", "#f57c00", "#fbc02d", "#9e9d24", "#388e3c", "#00897b", "#1976d2", "#2962ff", "#7b1fa2", "#c2185b"],
  // Row 6
  ["#c62828", "#e65100", "#f57f17", "#6d6f1a", "#2e7d32", "#006064", "#1565c0", "#1a46d9", "#6a1b9a", "#ad1457"],
  // Row 7
  ["#921010", "#bf360c", "#e65c00", "#4a4e00", "#1b5e20", "#004d40", "#0d47a1", "#0d2da6", "#4a148c", "#880e4f"],
  // Row 8
  ["#5c0000", "#7a2200", "#8d3e00", "#2e3100", "#0a3d15", "#002b26", "#07306c", "#071a73", "#2e0a5c", "#560a33"],
  // Row 9 — Darkest (near-black per hue)
  ["#2e0000", "#3d1100", "#4e2200", "#161800", "#031e09", "#001514", "#031838", "#030d40", "#160530", "#2b051a"],
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
