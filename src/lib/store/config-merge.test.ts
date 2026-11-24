import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";

/**
 * Regression test for a bug that shipped twice.
 *
 * `config` is a single top-level key in the persisted state, so Zustand's
 * shallow merge lets a stored `config` object replace `DEFAULT_CONFIG` whole.
 * Every field added to `IndicatorConfig` afterwards then arrives as
 * `undefined` for existing users, and does so *silently*: the value flows
 * into a calculation or a chart option rather than throwing. It first bit
 * `adxKeyLevel`, then the RSI zone levels, which rendered as
 * `baseValue: { price: undefined }` and filled the whole pane.
 */
describe("persisted config merge", () => {
  it("fills in fields the stored config predates", async () => {
    localStorage.setItem(
      "tv-gratis-chart-state",
      JSON.stringify({
        // A config from before the RSI zones and Stoch RSI existed.
        state: { config: { rsi: 21, macdFast: 12, macdSlow: 26, macdSignal: 9 } },
        version: 7,
      }),
    );

    const { useChartStore, DEFAULT_CONFIG } = await import("./chart-store");
    // Zustand 5 rehydrates asynchronously even from a synchronous storage, so
    // reading the state straight after the import sees only the defaults —
    // which silently makes any assertion that matches a default pass.
    await new Promise((r) => setTimeout(r, 0));
    const cfg = useChartStore.getState().config;

    // The user's own value survives.
    expect(cfg.rsi).toBe(21);

    // Everything else is defined, not undefined.
    for (const key of Object.keys(DEFAULT_CONFIG) as (keyof typeof DEFAULT_CONFIG)[]) {
      expect(typeof cfg[key]).toBe("number");
      expect(Number.isFinite(cfg[key])).toBe(true);
    }

    // The specific fields that broke.
    expect(cfg.rsiUpperZone).toBe(DEFAULT_CONFIG.rsiUpperZone);
    expect(cfg.rsiLowerZone).toBe(DEFAULT_CONFIG.rsiLowerZone);
    expect(cfg.rsiMaLength).toBe(DEFAULT_CONFIG.rsiMaLength);
    expect(cfg.stochRsiLength).toBe(DEFAULT_CONFIG.stochRsiLength);
    expect(cfg.stochRsiStochLength).toBe(DEFAULT_CONFIG.stochRsiStochLength);
    expect(cfg.stochRsiK).toBe(DEFAULT_CONFIG.stochRsiK);
    expect(cfg.stochRsiD).toBe(DEFAULT_CONFIG.stochRsiD);
  });
});
