/**
 * Where a held, dragged wheel lands: one value per `stepPx` of vertical
 * travel, up = next (a negative `dy`), down = previous, clamped to the list.
 *
 * Clamped rather than wrapped: the gesture is a wheel you hold and slide, and
 * a wheel that jumps from its last value back to its first mid-drag reads as
 * a glitch, not a feature. Stepping is by whole steps from where the finger
 * went down, so a jittering finger at one spot does not flicker the value.
 */
export function wheelIndex(startIdx: number, dy: number, len: number, stepPx: number): number {
  if (len <= 0) return 0;
  const steps = Math.trunc(-dy / stepPx);
  return Math.min(len - 1, Math.max(0, startIdx + steps));
}
