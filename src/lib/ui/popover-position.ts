/**
 * Keeping a hand-positioned popover on the screen.
 *
 * A popover anchored with plain CSS (`absolute right-0 top-full`) is placed
 * relative to its trigger and knows nothing about the window, which is fine
 * on a wide desktop and wrong on a phone: the colour palette hanging off the
 * drawing toolbar is 280px wide and ~330px tall, the toolbar sits near the
 * bottom of the chart because that is where a thumb reaches, and the palette
 * therefore opened straight off the bottom edge — and off the left edge too,
 * since right-aligning it to a trigger near the left of a narrow screen
 * pushes its other edge past zero.
 *
 * This decides the position against the viewport instead: open on the
 * preferred side when there is room, flip when there is not, then clamp. Pure
 * so the arithmetic can be tested without a browser.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  /** Where it ended up, for a caller that wants to flip an arrow or animation. */
  side: "below" | "above";
}

export interface PlaceOptions {
  /** Smallest gap kept between the popover and the edge of the viewport. */
  margin?: number;
  /** Gap between the trigger and the popover. */
  gap?: number;
}

/**
 * Place `size` against `trigger` inside `viewport`, in viewport coordinates
 * (what `position: fixed` wants).
 *
 * Vertically it prefers below the trigger and flips above only when below
 * does not fit *and* above fits better — flipping into an even smaller gap
 * would just move the clipping. Horizontally it keeps the existing
 * right-aligned look and then clamps, which on a narrow screen slides the
 * popover back inside rather than letting it hang off an edge.
 *
 * A popover taller or wider than the viewport cannot be made to fit; it is
 * pinned to the top-left margin so the start of it is readable.
 */
export function placePopover(
  trigger: Box,
  size: Size,
  viewport: Size,
  opts: PlaceOptions = {},
): Placement {
  const margin = opts.margin ?? 8;
  const gap = opts.gap ?? 4;

  const roomBelow = viewport.height - trigger.bottom - gap - margin;
  const roomAbove = trigger.top - gap - margin;
  const side: "below" | "above" =
    size.height <= roomBelow || roomBelow >= roomAbove ? "below" : "above";

  const rawTop =
    side === "below" ? trigger.bottom + gap : trigger.top - gap - size.height;

  return {
    left: clamp(trigger.right - size.width, margin, viewport.width - size.width - margin),
    top: clamp(rawTop, margin, viewport.height - size.height - margin),
    side,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  // An element larger than the space it has to fit in makes `hi < lo`; show
  // its start rather than its end, which is where the controls are.
  if (hi < lo) return lo;
  return Math.max(lo, Math.min(hi, v));
}
