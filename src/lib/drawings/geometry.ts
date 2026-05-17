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
