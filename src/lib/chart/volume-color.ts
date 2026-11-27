/**
 * Volume bar colours, derived from the candle palette.
 *
 * Dependency-free leaf module. The bars take the candle's *border* colour —
 * the solid one; the bodies are 30% opacity and would vanish at volume-bar
 * width — at `VOLUME_ALPHA`, so they read as the candles' own colour, a step
 * quieter than the price, and still show up when a phone is zoomed far out
 * and each bar is a pixel or two wide. Following the palette rather than
 * fixed greens and reds is what keeps them matching after the user recolours
 * the candles.
 */

export const VOLUME_ALPHA = 0.65;

/**
 * `color` at opacity `alpha`, as `rgba()`. Takes `#rgb`, `#rrggbb`,
 * `#rrggbbaa`, `rgb()` and `rgba()`; any existing alpha is replaced, not
 * multiplied. Anything it cannot parse comes back unchanged.
 */
export function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  let r: number, g: number, b: number;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(c);
    if (!m) return color;
    r = Number(m[1]);
    g = Number(m[2]);
    b = Number(m[3]);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function volumeColor(
  colors: { borderUp: string; borderDown: string },
  up: boolean,
): string {
  return withAlpha(up ? colors.borderUp : colors.borderDown, VOLUME_ALPHA);
}
