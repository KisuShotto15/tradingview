"use client";

import { cn } from "@/lib/utils";

/** Intrinsic geometry of the mark; `height` scales it and width follows. */
const VB_W = 11;
const VB_H = 20;

/**
 * Ribbon tag: a block flush against the row's left edge, its outer corners
 * rounded, with a triangular notch bitten out of the right side — the
 * swallowtail that reads as "flag" at this size.
 */
const SHAPE = `M${VB_W} 0 H2 Q0 0 0 2 V${VB_H - 2} Q0 ${VB_H} 2 ${VB_H} H${VB_W} L7.5 ${VB_H / 2} Z`;

interface Props {
  /** null = unflagged: the tag is drawn as a hollow outline. */
  color: string | null;
  className?: string;
  height?: number;
}

/**
 * The watchlist's flag mark.
 *
 * Drawn as an SVG rather than lucide's `Flag` because it has to read at ~18px
 * tall in a column barely wider than a scrollbar: a stroke-only glyph
 * disappears there, while a filled block keeps its colour legible down the
 * whole list. Unflagged rows get the same silhouette hollow, so the click
 * target is visible on hover instead of being an invisible strip.
 */
export function FlagPennant({ color, className, height = 18 }: Props) {
  const width = (height * VB_W) / VB_H;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <path
        d={SHAPE}
        fill={color ?? "none"}
        stroke={color ?? "currentColor"}
        strokeWidth={color ? 0 : 1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}
