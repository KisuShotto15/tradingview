export interface PixelPoint {
  x: number;
  y: number;
}

/**
 * Given a ray that starts at A and passes through B, extend it to the edge
 * of the bounding box (width x height) on the B-direction side.
 * Returns the end point inside the box (or B itself if the ray points to A).
 */
export function extendRay(
  a: PixelPoint,
  b: PixelPoint,
  width: number,
  height: number,
): PixelPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (dx === 0 && dy === 0) return b;

  // Parametric: P(t) = A + t * (B - A). Find largest t > 0 that keeps P inside [0..w] x [0..h].
  const tCandidates: number[] = [];
  if (dx > 0) tCandidates.push((width - a.x) / dx);
  if (dx < 0) tCandidates.push((0 - a.x) / dx);
  if (dy > 0) tCandidates.push((height - a.y) / dy);
  if (dy < 0) tCandidates.push((0 - a.y) / dy);

  if (tCandidates.length === 0) return b;
  const t = Math.min(...tCandidates.filter((v) => v > 0));
  if (!isFinite(t) || t <= 0) return b;

  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Extend a line through A and B in BOTH directions to the box edges. */
export function extendLine(
  a: PixelPoint,
  b: PixelPoint,
  width: number,
  height: number,
): { start: PixelPoint; end: PixelPoint } {
  const end = extendRay(a, b, width, height);
  const start = extendRay(b, a, width, height);
  return { start, end };
}

/** Midpoint of two points. Used by the Andrews pitchfork (median through BC). */
export function midpoint(a: PixelPoint, b: PixelPoint): PixelPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Harmonic-pattern leg ratios for an X-A-B-C-D price sequence:
 *   AB/XA, BC/AB, CD/BC  (absolute price distances).
 * Returns NaN for a ratio whose denominator leg is zero.
 */
export function harmonicRatios(prices: number[]): {
  abXa: number;
  bcAb: number;
  cdBc: number;
} {
  const [x, a, b, c, d] = prices;
  const leg = (p: number, q: number) => Math.abs(q - p);
  const ratio = (num: number, den: number) => (den === 0 ? NaN : num / den);
  return {
    abXa: ratio(leg(a, b), leg(x, a)),
    bcAb: ratio(leg(b, c), leg(a, b)),
    cdBc: ratio(leg(c, d), leg(b, c)),
  };
}
