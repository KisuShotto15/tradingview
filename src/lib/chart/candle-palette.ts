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
 * Bumped whenever `DEFAULT_CANDLE_PALETTE` changes in a way that should reach
 * users who already have colours stored.
 *
 * This is what makes the migration run **once** rather than on every load.
 * It has to exist on both sides: localStorage has the `persist` version to
 * key off, but the Supabase copy carries no version of its own, and the cloud
 * load runs *after* rehydration — so without a marker travelling with the
 * cloud payload, every sign-in would restore the pre-migration colours (or,
 * if the migration were unconditional there, would stomp any colour the user
 * had since chosen and make the pickers useless).
 */
export const CANDLE_PALETTE_VERSION = 1;

/**
 * Put the current palette onto a stored colour set, keeping everything else
 * (background, grid lines) exactly as it is.
 *
 * Deliberately unconditional. An earlier version only rewrote a set that
 * still matched the old teal/red default, on the theory that a customised
 * palette should be left alone — but that meant a requested palette change
 * reached nobody who had ever touched the colour pickers, which is the one
 * person most likely to have asked for it. Changing the palette is a product
 * decision; the pickers are still there to override it afterwards, and the
 * version marker keeps this from running a second time.
 */
export function applyCandlePalette<T extends Partial<CandlePalette>>(colors: T): T {
  return { ...colors, ...DEFAULT_CANDLE_PALETTE };
}
