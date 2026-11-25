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

/**
 * The absolute 24h move, derived from the current price and the percentage.
 *
 * Both venues' ticker payloads carry the percentage, and Bybit's WebSocket
 * delta frames carry nothing else — so rather than plumb a third field that
 * is only sometimes present, recover it: price = open * (1 + pct/100), hence
 * change = price - price / (1 + pct/100). Exact for any pct except -100%,
 * where the open was zero and there is no meaningful move to show.
 */
export function changeFromPct(price: number, pct: number): number | null {
  if (!isFinite(price) || !isFinite(pct)) return null;
  const ratio = 1 + pct / 100;
  if (ratio === 0) return null;
  return price - price / ratio;
}

/** Signed absolute move, formatted like a price. */
export function formatChange(n: number): string {
  if (!isFinite(n)) return "—";
  return `${n >= 0 ? "+" : "−"}${formatPrice(Math.abs(n))}`;
}

/**
 * Axis/label formatter for the chart's own price scale.
 *
 * lightweight-charts' built-in price format writes a 5-figure price as
 * "61450.5", with no group separator — readable on a wide desktop axis, much
 * less so on a phone where that column is a sliver. Grouping is what every
 * charting app does there, this one included everywhere else (`formatPrice`).
 *
 * The decimal count is passed in rather than guessed, because it comes from
 * the instrument's real tick size; a formatter that re-derived it would
 * quietly disagree with the scale's own step and print levels that never
 * occur.
 */
export function axisPriceFormatter(precision: number): (p: number) => string {
  return (p: number) => {
    if (!isFinite(p)) return "—";
    return p.toLocaleString("en-US", {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
  };
}

export function formatVolume(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}
