import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import type { Timeframe } from "@/lib/binance/types";
import {
  LAYOUTS,
  layoutSpec,
  paneCount,
  reconcilePanes,
  resolveActivePane,
  type ChartPane,
} from "./layouts";

const TF = "15m" as Timeframe;

describe("layout specs", () => {
  it("counts the panes of every layout from its grid", () => {
    for (const spec of LAYOUTS) {
      expect(paneCount(spec.kind)).toBe(spec.cols * spec.rows);
    }
  });

  it("falls back to the single chart for a layout this build no longer has", () => {
    // A layout saved by another build, or a hand-edited localStorage.
    expect(layoutSpec("9x9" as never).kind).toBe("1");
    expect(paneCount("9x9" as never)).toBe(1);
  });
});

describe("reconcilePanes", () => {
  /*
   * The case that shipped broken for a few minutes and would have hit every
   * existing user on their first load: nothing persisted, because layouts did
   * not exist when they last used the app. The fallbacks are their symbol and
   * timeframe, so they come back to the chart they left — reading the saved
   * panes off the *merged* store instead handed them the default pane, and
   * through the active-pane mirror that then overwrote their real symbol.
   */
  it("seeds a missing pane list from the symbol the user had", () => {
    const panes = reconcilePanes("1", undefined, "SOLUSDT.P", "1h" as Timeframe);
    expect(panes).toEqual([{ id: "p1", symbol: "SOLUSDT.P", timeframe: "1h" }]);
  });

  it("seeds every pane of a bigger layout from it too", () => {
    const panes = reconcilePanes("4", undefined, "ETHUSDT", TF);
    expect(panes.length).toBe(4);
    expect(panes.every((p) => p.symbol === "ETHUSDT")).toBe(true);
    // Ids are distinct, or React keys collide and the panes share a chart.
    expect(new Set(panes.map((p) => p.id)).size).toBe(4);
  });

  it("keeps what was saved, pane by pane", () => {
    const saved: ChartPane[] = [
      { id: "p1", symbol: "BTCUSDT", timeframe: "5m" as Timeframe },
      { id: "p2", symbol: "ETHUSDT", timeframe: "1d" as Timeframe },
    ];
    expect(reconcilePanes("2h", saved, "SOLUSDT", TF)).toEqual(saved);
  });

  it("tops up a list that is short for its layout", () => {
    const saved: ChartPane[] = [{ id: "p1", symbol: "BTCUSDT", timeframe: "5m" as Timeframe }];
    const panes = reconcilePanes("4", saved, "SOLUSDT", TF);
    expect(panes.length).toBe(4);
    expect(panes[0]).toEqual(saved[0]);
    expect(panes[3]).toEqual({ id: "p4", symbol: "SOLUSDT", timeframe: TF });
  });

  it("drops the extras when the layout shrinks", () => {
    const saved: ChartPane[] = [
      { id: "p1", symbol: "A", timeframe: TF },
      { id: "p2", symbol: "B", timeframe: TF },
      { id: "p3", symbol: "C", timeframe: TF },
      { id: "p4", symbol: "D", timeframe: TF },
    ];
    expect(reconcilePanes("2h", saved, "SOLUSDT", TF).map((p) => p.symbol)).toEqual(["A", "B"]);
  });

  it("fills the gaps in a half-written pane", () => {
    const saved = [{ symbol: "BTCUSDT" }];
    const panes = reconcilePanes("1", saved, "SOLUSDT", "4h" as Timeframe);
    expect(panes[0]).toEqual({ id: "p1", symbol: "BTCUSDT", timeframe: "4h" });
  });
});

describe("resolveActivePane", () => {
  const panes: ChartPane[] = [
    { id: "p1", symbol: "A", timeframe: TF },
    { id: "p2", symbol: "B", timeframe: TF },
  ];

  it("keeps the saved pane when it is still there", () => {
    expect(resolveActivePane(panes, "p2")).toBe("p2");
  });

  it("falls back to the first when the focused pane was cut by a smaller layout", () => {
    // Nothing is focused otherwise, and the header would act on no chart.
    expect(resolveActivePane(panes, "p4")).toBe("p1");
    expect(resolveActivePane(panes, undefined)).toBe("p1");
  });
});
