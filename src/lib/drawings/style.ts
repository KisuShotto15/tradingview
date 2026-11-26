import type { Drawing, DrawingKind } from "./types";

/**
 * What counts as a drawing's *style*: everything that describes how it looks,
 * and nothing that describes where it sits or what state it is in.
 *
 * This is the single definition shared by every path that remembers a style —
 * the "last style used" (`toolDefaults`), named templates, and the settings
 * dialog — so the three can never disagree about what carries over. Fib
 * `levels` count as style deliberately: carrying a customised ladder onto the
 * next fib is the point.
 *
 * `hidden`, `locked`, `alert`, `z` and `text` are *not* style. The toolbar used
 * to write whatever it patched into the defaults, so hiding or locking one
 * line made every following line of that kind arrive hidden or locked.
 */
export const STYLE_FIELDS = [
  "color",
  "lineWidth",
  "lineStyle",
  "stopColor",
  "targetColor",
  "textColor",
  "showLabels",
  "fillColor",
  "fillOpacity",
  "fontSize",
  "levels",
] as const;

export type StyleField = (typeof STYLE_FIELDS)[number];
export type DrawingStyle = {
  color?: string;
  lineWidth?: number;
  lineStyle?: 0 | 1 | 2;
  [key: string]: unknown;
};

/** The style fields present in a patch (or a whole drawing), and only those. */
export function pickStyle(src: object): DrawingStyle {
  const rec = src as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of STYLE_FIELDS) {
    if (rec[f] !== undefined) out[f] = rec[f];
  }
  return out as DrawingStyle;
}

/** A drawing's full style — what "save as default" and templates capture. */
export function styleOf(d: Drawing): DrawingStyle {
  return pickStyle(d);
}

/**
 * Kinds whose renderer reads `lineWidth`. Decided by kind, not by whether the
 * field happens to be set: a fresh drawing has no `lineWidth` until someone
 * sets one, and the toolbar used to ask `"lineWidth" in drawing` — so the
 * width control never appeared on a new line, and the width could not carry
 * over to the next one because it could not be set in the first place.
 */
export const WIDTH_KINDS: ReadonlySet<DrawingKind> = new Set<DrawingKind>([
  "trendline",
  "ray",
  "arrow",
  "hline",
  "hray",
  "vline",
  "parallel-channel",
  "pitchfork",
  "price-range",
  "rectangle",
  "callout",
  "xabcd",
  "brush",
  "highlighter",
]);

/** Kinds whose renderer reads `lineStyle` (solid / dashed / dotted). */
export const LINE_STYLE_KINDS: ReadonlySet<DrawingKind> = new Set<DrawingKind>([
  "trendline",
  "ray",
  "arrow",
  "hline",
  "hray",
  "vline",
  "parallel-channel",
  "price-range",
  "rectangle",
]);
