"use client";

import { useCoarsePointer } from "@/hooks/useCoarsePointer";

interface Props {
  x: number;
  y: number;
  /**
   * The drawing's own colour. Accepted from every call site and deliberately
   * not painted with: a handle in the drawing's colour is invisible whenever
   * that colour is close to the background, and these have to be findable
   * under a fingertip. Kept on the interface so the call sites stay honest
   * about which drawing a handle belongs to.
   */
  color?: string;
  selected?: boolean;
  /** "square" for handles with resize-only behavior; default "circle". */
  shape?: "circle" | "square";
  onPointerDown: (e: React.PointerEvent) => void;
}

/**
 * The visible handle, in CSS pixels. A finger gets a slightly larger mark,
 * because at 9px it is hard even to *see* which anchor you are about to grab
 * under your own fingertip.
 */
const VISUAL = { mouse: { r: 5, square: 9 }, touch: { r: 7, square: 13 } };

/**
 * Radius of the invisible grab area around the handle.
 *
 * This is the number that made the drawings unusable on a phone: the handle
 * was its own hit area at 9–10px across, about a fifth of a fingertip, so
 * resizing a shape meant hitting a target smaller than the pointer aiming at
 * it. Missing it does not fail quietly either — the press lands on the shape's
 * body instead and *moves* the whole drawing, so a failed resize silently
 * becomes an unwanted translation.
 *
 * 16px of radius is a 32px target, which is what the venues' own mobile charts
 * use: enough to hit reliably, small enough that two adjacent anchors (a long
 * position's entry and stop, pushed close together) still have distinct
 * targets. The mouse keeps a tight 8px so a precise click lands where it looks
 * like it should.
 */
const GRAB_R = { mouse: 8, touch: 16 };

/** Small circle or square that the user can grab and drag. */
export function DrawHandle({ x, y, shape = "circle", onPointerDown }: Props) {
  const coarse = useCoarsePointer();
  const visual = coarse ? VISUAL.touch : VISUAL.mouse;
  const grab = coarse ? GRAB_R.touch : GRAB_R.mouse;

  /*
   * White, with a dark ring.
   *
   * It used to be a near-black disc with a dark purple outline, which on a
   * dark chart is only visible where it happens to cross a candle — so the
   * anchors of a selected drawing were hard to find at all, and on a phone
   * the one under your fingertip was hidden by the finger as well. White is
   * the one fill that stands out over candles, grid and indicator lines
   * alike, and it matches the white the rest of the app uses to mean
   * "selected". The ring keeps it from disappearing into a light background.
   */
  const paint = {
    fill: "#ffffff",
    stroke: "#0d0d0d",
    strokeWidth: 1.5,
    // The grab circle underneath takes the gesture. Without this the visible
    // mark would swallow presses inside its own bounds, which is fine, but a
    // press in the ring *between* the mark and the grab radius would be
    // handled by one element and a press in the middle by another — and only
    // one of them carries the drag.
    style: { pointerEvents: "none" as const },
  };

  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={grab}
        fill="transparent"
        className="drawing-hit"
        style={{ pointerEvents: "all", cursor: "grab" }}
        onPointerDown={onPointerDown}
      />
      {shape === "square" ? (
        <rect
          x={x - visual.square / 2}
          y={y - visual.square / 2}
          width={visual.square}
          height={visual.square}
          {...paint}
        />
      ) : (
        <circle cx={x} cy={y} r={visual.r} {...paint} />
      )}
    </g>
  );
}
