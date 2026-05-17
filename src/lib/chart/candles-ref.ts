import type { Candle } from "@/lib/binance/types";

/**
 * Module-level ref to the active chart's candles. Updated by PriceChart on
 * fetch and WS tick. Read by drawing tooling (e.g., drag handles) that needs
 * to extrapolate timestamps past the last bar.
 */
export const candlesRef: { current: Candle[] } = { current: [] };
