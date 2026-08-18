/**
 * Decimal places to show for a price, scaled to its magnitude so a
 * fractions-of-a-cent altcoin (e.g. 0.00012) gets enough digits to read
 * while a BTC-sized price stays at 2. Drives the chart's native price
 * scale (`priceFormat`), which lightweight-charts otherwise defaults to a
 * flat 2 decimals regardless of the instrument.
 */
export function pricePrecisionFor(price: number): number {
  const abs = Math.abs(price);
  if (!isFinite(abs) || abs === 0) return 2;
  if (abs >= 1) return 2;
  if (abs >= 0.01) return 4;
  // Sub-cent: keep ~5 significant digits past the leading zeros.
  const leadingZeros = Math.max(0, -Math.floor(Math.log10(abs)) - 1);
  return Math.min(leadingZeros + 5, 10);
}

/** `priceFormat` fields (precision + matching minMove) for a series. */
export function priceFormatFor(price: number): { precision: number; minMove: number } {
  const precision = pricePrecisionFor(price);
  return { precision, minMove: Math.pow(10, -precision) };
}

export function formatPrice(n: number): string {
  if (!isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

export function formatPct(n: number): string {
  if (!isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function formatVolume(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}
