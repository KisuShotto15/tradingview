"use client";

import { cn } from "@/lib/utils";

interface Props {
  /** null = unflagged: the pennant is drawn as a hollow outline. */
  color: string | null;
  className?: string;
  height?: number;
}

/**
 * Little pennant on a staff, used as the watchlist's flag mark.
 *
 * Drawn as an SVG rather than lucide's `Flag` because it has to read at ~13px
 * on the row's left edge: the icon set's stroke-only glyph disappears at that
 * size, while a filled triangle keeps its colour legible. Unflagged rows get
 * the same shape hollow, so the click target is visible on hover instead of
 * being an invisible strip the user has to discover.
 */
export function FlagPennant({ color, className, height = 13 }: Props) {
  const w = (height * 9) / 13;
  return (
    <svg
      width={w}
      height={height}
      viewBox="0 0 9 13"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      {/* Staff */}
      <path
        d="M1.25 0.75V12.25"
        stroke={color ?? "currentColor"}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      {/* Pennant */}
      <path
        d="M1.25 1.4L8 4.1L1.25 6.8Z"
        fill={color ?? "none"}
        stroke={color ?? "currentColor"}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
