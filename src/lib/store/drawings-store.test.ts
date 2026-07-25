import { beforeEach, describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { useDrawingsStore } from "./drawings-store";
import type { Drawing } from "@/lib/drawings/types";

function hline(id: string, symbol = "BTCUSDT"): Drawing {
  return { id, symbol, kind: "hline", price: 100 } as Drawing;
}
const ids = () => useDrawingsStore.getState().drawings.map((d) => d.id);
const zs = () => useDrawingsStore.getState().drawings.map((d) => d.z);

beforeEach(() => {
  useDrawingsStore.setState({ drawings: [], selectedId: null, editingId: null });
});

describe("drawings-store ordering", () => {
  it("moveDrawing 'forward' swaps toward the front (later in array)", () => {
    useDrawingsStore.setState({ drawings: [hline("a"), hline("b"), hline("c")] });
    useDrawingsStore.getState().moveDrawing("a", "forward");
    expect(ids()).toEqual(["b", "a", "c"]);
  });

  it("moveDrawing 'backward' swaps toward the back", () => {
    useDrawingsStore.setState({ drawings: [hline("a"), hline("b"), hline("c")] });
    useDrawingsStore.getState().moveDrawing("c", "backward");
    expect(ids()).toEqual(["a", "c", "b"]);
  });

  it("moveDrawing 'front' and 'back' move to the ends", () => {
    useDrawingsStore.setState({ drawings: [hline("a"), hline("b"), hline("c")] });
    useDrawingsStore.getState().moveDrawing("a", "front");
    expect(ids()).toEqual(["b", "c", "a"]);
    useDrawingsStore.getState().moveDrawing("a", "back");
    expect(ids()).toEqual(["a", "b", "c"]);
  });

  it("assigns z equal to the final array index", () => {
    useDrawingsStore.setState({ drawings: [hline("a"), hline("b"), hline("c")] });
    useDrawingsStore.getState().moveDrawing("a", "front");
    expect(zs()).toEqual([0, 1, 2]);
  });

  it("reorders only within the same symbol, preserving other symbols' slots", () => {
    useDrawingsStore.setState({
      drawings: [hline("a", "BTC"), hline("x", "ETH"), hline("b", "BTC")],
    });
    useDrawingsStore.getState().moveDrawing("a", "forward");
    // BTC siblings [a,b] → [b,a] land in their original slots (0 and 2); ETH untouched.
    expect(ids()).toEqual(["b", "x", "a"]);
  });

  it("applyOrderForSymbol places drawings in the requested id order", () => {
    useDrawingsStore.setState({ drawings: [hline("a"), hline("b"), hline("c")] });
    useDrawingsStore.getState().applyOrderForSymbol("BTCUSDT", ["c", "a", "b"]);
    expect(ids()).toEqual(["c", "a", "b"]);
  });

  it("moveDrawing is a no-op at the edges", () => {
    useDrawingsStore.setState({ drawings: [hline("a"), hline("b")] });
    useDrawingsStore.getState().moveDrawing("a", "back");
    expect(ids()).toEqual(["a", "b"]);
    useDrawingsStore.getState().moveDrawing("b", "front");
    expect(ids()).toEqual(["a", "b"]);
  });
});
