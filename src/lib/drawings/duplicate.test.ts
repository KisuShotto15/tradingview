import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { duplicateDrawing } from "./duplicate";
import type { Drawing } from "./types";

const base = { id: "d1", symbol: "BTCUSDT" };

describe("duplicateDrawing", () => {
  it("offsets the copy and gives it a fresh id", () => {
    const d: Drawing = {
      ...base,
      kind: "trendline",
      a: { time: 100, price: 10 },
      b: { time: 200, price: 20 },
    };
    const copy = duplicateDrawing(d, 50, 5);
    if (copy.kind !== "trendline") throw new Error("kind changed");
    assert.notStrictEqual(copy.id, d.id);
    expect(copy.a).toEqual({ time: 150, price: 15 });
    expect(copy.b).toEqual({ time: 250, price: 25 });
  });

  it("resets z so the copy gets a fresh top stacking order", () => {
    const d: Drawing = { ...base, kind: "hline", price: 10, z: 3 };
    const copy = duplicateDrawing(d, 0, 1);
    expect(copy.z).toBe(undefined);
  });

  it("leaves the original untouched", () => {
    const d: Drawing = { ...base, kind: "hline", price: 10 };
    duplicateDrawing(d, 0, 5);
    expect(d.price).toBe(10);
  });
});
