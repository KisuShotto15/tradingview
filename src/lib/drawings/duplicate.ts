import type { Drawing } from "./types";
import { generateId } from "./types";
import { translateDrawing } from "./translate";

/**
 * Duplicate a drawing with a fresh id, offset by (dt, dp) so the copy doesn't
 * sit exactly on top of the original. `z` resets to `undefined` so `add()`
 * (see use-drawings.ts) assigns it a fresh top stacking order.
 */
export function duplicateDrawing(d: Drawing, dt: number, dp: number): Drawing {
  const moved = translateDrawing(d, dt, dp);
  return { ...moved, id: generateId(), z: undefined };
}
