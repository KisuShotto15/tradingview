"use client";

/**
 * Pointer-based dragging for the SVG chart overlays (drawings, order lines).
 *
 * These used to listen for `mousedown` and then `mousemove`/`mouseup` on the
 * document, which cannot work on a touch screen. A browser does synthesise
 * compatibility mouse events for a tap, but it emits them *after* `touchend`
 * and never streams `mousemove` during the gesture — so a drawing could be
 * selected with a tap and then simply would not move, with no error anywhere.
 * Pointer events cover mouse, touch and pen through one path.
 *
 * Two things beyond the rename matter:
 *
 * - **Pointer capture.** Without it the first `pointermove` that leaves the
 *   10px-wide hit line retargets to whatever is underneath, and the drag dies
 *   mid-gesture. Capturing routes every move back to the element that was
 *   grabbed, which is also what lets a thin line be dragged at all. The events
 *   still bubble to the document, so the listeners below see them.
 * - **`touch-action: none`.** The overlay sits on top of lightweight-charts,
 *   which is itself a pan/pinch surface. Unless the hit areas opt out, the
 *   browser claims the gesture as a scroll and fires `pointercancel` — the
 *   drag would start and then be taken away. The rule is applied globally to
 *   `.drawing-hit` in `DrawingsLayer`.
 */

/**
 * How far the pointer must travel before a press counts as a drag.
 *
 * A finger is not a mouse: a tap meant purely to select a line lands with a
 * few pixels of travel, and without a threshold every one of those committed a
 * tiny move to the undo history and to Supabase. The value is in CSS pixels
 * and deliberately on the generous side, since the alternative error — a drag
 * that needs a few extra pixels before it takes — is invisible to the user.
 */
export const DRAG_SLOP_PX = 4;

interface PointerDragOptions {
  /** Called for every move once the slop threshold has been passed. */
  onMove: (ev: PointerEvent) => void;
  /** Called once when the gesture ends. `moved` is false for a tap. */
  onEnd?: (moved: boolean) => void;
  /** Pixels of travel before the press counts as a drag. */
  slop?: number;
}

/**
 * Start tracking a drag from a React pointer-down event.
 *
 * Returns nothing: the listeners remove themselves on pointerup/pointercancel.
 */
export function beginPointerDrag(
  e: React.PointerEvent,
  { onMove, onEnd, slop = DRAG_SLOP_PX }: PointerDragOptions,
): void {
  const pointerId = e.pointerId;
  const target = e.currentTarget as Element | null;
  const startX = e.clientX;
  const startY = e.clientY;
  let moved = false;

  try {
    target?.setPointerCapture?.(pointerId);
  } catch {
    // Element gone, or a browser that refuses capture — document listeners
    // below still deliver the gesture in the common case.
  }

  function handleMove(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return;
    if (!moved) {
      if (Math.abs(ev.clientX - startX) < slop && Math.abs(ev.clientY - startY) < slop) return;
      moved = true;
    }
    onMove(ev);
  }

  function finish(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return;
    document.removeEventListener("pointermove", handleMove);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", finish);
    document.body.style.cursor = "";
    try {
      target?.releasePointerCapture?.(pointerId);
    } catch {
      // Already released (the element unmounted mid-drag); nothing to undo.
    }
    onEnd?.(moved);
  }

  document.addEventListener("pointermove", handleMove);
  document.addEventListener("pointerup", finish);
  document.addEventListener("pointercancel", finish);
  document.body.style.cursor = "grabbing";
}
