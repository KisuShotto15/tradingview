/**
 * Single source of truth for the TradingView palette.
 *
 * The canonical values live in `globals.css` as `--color-tv-*` custom
 * properties (consumed by Tailwind `tv-*` classes). lightweight-charts renders
 * to a canvas and needs real color strings — it cannot consume `var(...)` — so
 * we read those CSS variables at runtime instead of duplicating the hex values.
 *
 * The literal `FALLBACK` documents the expected keys and is returned during SSR
 * (before a `document` exists) and for any variable the stylesheet doesn't
 * define. Keep it in sync with `globals.css`; if they ever diverge, CSS wins on
 * the client.
 */
export interface TvColors {
  bg: string;
  panel: string;
  border: string;
  text: string;
  textMuted: string;
  green: string;
  red: string;
  blue: string;
  yellow: string;
  purple: string;
  grid: string;
}

const FALLBACK: TvColors = {
  bg: "#000000",
  panel: "#0a0a0a",
  border: "#1a1a1a",
  text: "#e6e6e6",
  textMuted: "#8a8a8a",
  green: "#26a69a",
  red: "#ef5350",
  blue: "#2962ff",
  yellow: "#ffb74d",
  purple: "#ab47bc",
  grid: "#0e0e0e",
};

const CSS_VAR: Record<keyof TvColors, string> = {
  bg: "--color-tv-bg",
  panel: "--color-tv-panel",
  border: "--color-tv-border",
  text: "--color-tv-text",
  textMuted: "--color-tv-text-muted",
  green: "--color-tv-green",
  red: "--color-tv-red",
  blue: "--color-tv-blue",
  yellow: "--color-tv-yellow",
  purple: "--color-tv-purple",
  grid: "--color-tv-grid",
};

/**
 * Read the TV palette from the CSS custom properties (the single source of
 * truth). Falls back to `FALLBACK` on the server or for any missing variable.
 */
export function getTvColors(): TvColors {
  if (typeof document === "undefined") return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const out = {} as TvColors;
  for (const key of Object.keys(CSS_VAR) as (keyof TvColors)[]) {
    const v = cs.getPropertyValue(CSS_VAR[key]).trim();
    out[key] = v || FALLBACK[key];
  }
  return out;
}
