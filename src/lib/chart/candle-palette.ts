/**
 * The default candle colours, and the one-time migration onto them.
 *
 * Dependency-free leaf module: the store, the cloud-sync loader and the tests
 * all read it, so it must not import any of them.
 */

/** The six colours a candle is drawn from. A structural subset of `ChartColors`. */
export interface CandlePalette {
  bodyUp: string;
  bodyDown: string;
  borderUp: string;
  borderDown: string;
  wickUp: string;
  wickDown: string;
}

/**
 * Purple candles: bodies at 30% opacity, solid borders and wicks.
 *
 * The bodies are written as `rgba()` rather than an 8-digit hex because that
 * is exactly what `ColorPicker`'s `formatColor` emits below full opacity —
 * so opening the settings dialog shows the slider at 30% and round-trips the
 * value unchanged instead of rewriting it on the first interaction.
 *
 * Note the bearish border is a lighter purple than the bearish wick. That is
 * not a slip: it is what the design being matched uses, and it is what keeps
 * a down candle's outline readable against its near-transparent body.
 */
export const DEFAULT_CANDLE_PALETTE: CandlePalette = {
  bodyUp: "rgba(179, 158, 215, 0.30)",
  bodyDown: "rgba(79, 51, 163, 0.30)",
  borderUp: "#b39ed7",
  borderDown: "#7e5abd",
  wickUp: "#b39ed7",
  wickDown: "#4f33a3",
};

/**
 * The teal/red palette that was the default before the purple one.
 *
 * Kept so the migration can tell "never touched the colours" apart from
 * "deliberately chose teal and red", which are indistinguishable in the
 * stored state otherwise — both are just six strings.
 */
export const LEGACY_CANDLE_PALETTE: CandlePalette = {
  bodyUp: "#26a69a",
  bodyDown: "#ef5350",
  borderUp: "#26a69a",
  borderDown: "#ef5350",
  wickUp: "#26a69a",
  wickDown: "#ef5350",
};

const KEYS = Object.keys(LEGACY_CANDLE_PALETTE) as (keyof CandlePalette)[];

/** True when every one of the six candle colours is still the old default. */
export function isLegacyCandlePalette(colors: Partial<CandlePalette> | null | undefined): boolean {
  if (!colors) return false;
  return KEYS.every(
    (k) => colors[k]?.toLowerCase() === LEGACY_CANDLE_PALETTE[k],
  );
}

/**
 * Move a stored colour set onto the new palette, but only if it is untouched.
 *
 * Changing `DEFAULT_CHART_COLORS` alone would have changed nothing for anyone
 * who had already used the app: `chartColors` is persisted to localStorage
 * *and* mirrored to Supabase, so an existing user keeps seeing the old colours
 * on every device. Both load paths run this, and a partial match (someone who
 * recoloured only the wicks, say) is left exactly as it is.
 */
export function migrateCandlePalette<T extends Partial<CandlePalette>>(colors: T): T {
  if (!isLegacyCandlePalette(colors)) return colors;
  return { ...colors, ...DEFAULT_CANDLE_PALETTE };
}
