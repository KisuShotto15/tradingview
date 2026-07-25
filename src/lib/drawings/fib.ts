export interface FibLevel {
  ratio: number;
  price: number;
}

/** Default ratios for the trend-based fib extension tool. */
export const FIB_EXT_RATIOS_DEFAULT = [0, 0.382, 0.618, 1, 1.618, 2.618];

/**
 * Trend-based Fibonacci extension. Measures the A→B move and projects each ratio
 * forward from C: price(ratio) = C + (B - A) * ratio.
 */
export function fibExtensionLevels(
  aPrice: number,
  bPrice: number,
  cPrice: number,
  ratios: number[],
): FibLevel[] {
  const move = bPrice - aPrice;
  return ratios.map((r) => ({ ratio: r, price: cPrice + move * r }));
}
