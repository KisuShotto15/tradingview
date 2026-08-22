/**
 * Watchlist flag palette. Dependency-free leaf module: the chart store needs
 * the default colour for its `lastFlagColor` seed, and both the desktop strip
 * and the mobile sheet need the full list, so it can't live in either.
 */
export const FLAG_COLORS = [
  "#ef5350",
  "#2962ff",
  "#26a69a",
  "#ffb74d",
  "#ab47bc",
  "#00bcd4",
  "#f06292",
];

/** Colour a plain click applies before the user has picked one. */
export const DEFAULT_FLAG_COLOR = FLAG_COLORS[0];
