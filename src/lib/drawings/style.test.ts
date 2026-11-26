import { test } from "node:test";
import { expect } from "@/test-utils/expect";
import { pickStyle, styleOf, WIDTH_KINDS, LINE_STYLE_KINDS } from "./style";
import type { Drawing } from "./types";

test("pickStyle keeps style and drops state", () => {
  const p = pickStyle({ color: "#ffffff", lineWidth: 3, hidden: true, locked: true, alert: null, z: 4, text: "hi" });
  expect(p).toEqual({ color: "#ffffff", lineWidth: 3 });
});

test("hiding or locking a drawing is not a style change", () => {
  expect(pickStyle({ hidden: true })).toEqual({});
  expect(pickStyle({ locked: false })).toEqual({});
});

test("styleOf captures every look field, including fib levels", () => {
  const d = {
    id: "x", symbol: "BTCUSDT", kind: "fib-retracement",
    a: { time: 1, price: 1 }, b: { time: 2, price: 2 },
    levels: [0, 0.5, 1], color: "#abcdef", lineStyle: 2,
  } as Drawing;
  expect(styleOf(d)).toEqual({ color: "#abcdef", lineStyle: 2, levels: [0, 0.5, 1] });
});

test("width and line-style controls are offered by kind", () => {
  expect(WIDTH_KINDS.has("trendline")).toBe(true);
  expect(WIDTH_KINDS.has("hray")).toBe(true);
  expect(WIDTH_KINDS.has("long")).toBe(false);
  expect(LINE_STYLE_KINDS.has("trendline")).toBe(true);
  expect(LINE_STYLE_KINDS.has("brush")).toBe(false);
});
