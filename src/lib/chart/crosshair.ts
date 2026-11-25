/**
 * Chart-scale bridge for pointing the crosshair at a screen position.
 *
 * lightweight-charts moves its own crosshair from the mouse events it
 * receives on its canvas — and during a drawing drag it receives none. The
 * drag takes pointer capture (which is what lets a one-pixel line be dragged
 * at all), so every `pointermove` is retargeted to the SVG overlay and the
 * canvas underneath never hears about it. The result is a crosshair frozen
 * where the drag began while the shape follows the pointer: on a long/short
 * the horizontal line sits at the old price, which is precisely the readout
 * you are dragging the level against.
 *
 * `PriceChart` registers the aimer (same approach as the viewport applier and
 * the nudge probe), so `beginPointerDrag` can keep the crosshair under the
 * pointer without holding a chart reference of its own.
 */

let _aim: ((clientX: number, clientY: number) => void) | null = null;

export function registerCrosshairAimer(
  fn: ((clientX: number, clientY: number) => void) | null,
) {
  _aim = fn;
}

/** Point the crosshair at a viewport position. No-op with no chart mounted. */
export function aimCrosshairAt(clientX: number, clientY: number) {
  _aim?.(clientX, clientY);
}
