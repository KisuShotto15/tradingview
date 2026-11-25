/**
 * Pick black or white text for a given background.
 *
 * The chart's last-price block is painted in the candle colour, which the user
 * chooses: the purple default is light enough that white text on it is barely
 * legible, while a dark teal needs white. Hard-coding either one makes the
 * block unreadable for half the palettes the colour pickers offer.
 *
 * Dependency-free leaf module so both the overlay and its test can use it.
 */

/** Parses `#rgb`, `#rrggbb`, `#rrggbbaa` and `rgb()/rgba()`. */
export function parseColorChannels(color: string): { r: number; g: number; b: number } | null {
  const s = color.trim();
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    const expand = (h: string) => parseInt(h.length === 1 ? h + h : h, 16);
    if (hex.length === 3 || hex.length === 4) {
      return { r: expand(hex[0]), g: expand(hex[1]), b: expand(hex[2]) };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
    return null;
  }
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

/**
 * WCAG relative luminance, 0 (black) to 1 (white).
 *
 * The sRGB→linear step matters: a naive average of the channels calls the
 * default purple dark and picks white text for it, which is the case this
 * exists to get right.
 */
export function relativeLuminance(color: string): number | null {
  const c = parseColorChannels(color);
  if (!c) return null;
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/**
 * Readable text colour for `background`. Falls back to white for anything
 * unparseable, matching what the overlay did before this existed.
 */
export function readableTextOn(background: string): string {
  const l = relativeLuminance(background);
  if (l === null) return "#ffffff";
  // 0.35 rather than the midpoint: white-on-mid-tone fails sooner than
  // black-on-mid-tone, so the threshold leans toward dark text.
  return l > 0.35 ? "#0a0a0a" : "#ffffff";
}
