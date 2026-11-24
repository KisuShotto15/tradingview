import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";

// Its own file on purpose: the store module is cached per process, so a second
// test in the same file would reuse the already-rehydrated store and silently
// read whatever the first test seeded.
/**
 * The palette migration, actually exercised.
 *
 * It was called verified once before on the strength of a check that read the
 * store before rehydration had run — so it only ever saw the defaults, which
 * were already purple. The assertion passed without the migration doing
 * anything. This seeds a v6 state holding hand-picked colours and asserts the
 * v7 migration rewrites them.
 */
describe("candle palette migration", () => {
  it("rewrites colours a user picked by hand, keeping bg and grid", async () => {
    localStorage.setItem(
      "tv-gratis-chart-state",
      JSON.stringify({
        state: {
          chartColors: {
            bg: "#050505",
            gridLines: "#111111",
            bodyUp: "#e1bee7",
            bodyDown: "#ba68c8",
            borderUp: "#e1bee7",
            borderDown: "#ba68c8",
            wickUp: "#e1bee7",
            wickDown: "#ba68c8",
          },
        },
        version: 6,
      }),
    );

    const { useChartStore } = await import("./chart-store");
    const { DEFAULT_CANDLE_PALETTE } = await import("@/lib/chart/candle-palette");
    await new Promise((r) => setTimeout(r, 0));
    const c = useChartStore.getState().chartColors;

    expect(c.bodyUp).toBe(DEFAULT_CANDLE_PALETTE.bodyUp);
    expect(c.bodyDown).toBe(DEFAULT_CANDLE_PALETTE.bodyDown);
    expect(c.borderDown).toBe(DEFAULT_CANDLE_PALETTE.borderDown);
    expect(c.wickDown).toBe(DEFAULT_CANDLE_PALETTE.wickDown);
    // Untouched by the migration.
    expect(c.bg).toBe("#050505");
    expect(c.gridLines).toBe("#111111");
  });
});
