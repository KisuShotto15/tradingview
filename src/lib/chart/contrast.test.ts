import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { parseColorChannels, relativeLuminance, readableTextOn } from "./contrast";

describe("parseColorChannels", () => {
  it("reads the hex forms the colour picker emits", () => {
    expect(parseColorChannels("#b39ed7")).toEqual({ r: 179, g: 158, b: 215 });
    expect(parseColorChannels("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColorChannels("#b39ed7ff")).toEqual({ r: 179, g: 158, b: 215 });
  });

  it("reads rgb() and rgba(), which is what it emits below full opacity", () => {
    expect(parseColorChannels("rgba(179, 158, 215, 0.30)")).toEqual({ r: 179, g: 158, b: 215 });
    expect(parseColorChannels("rgb(0,0,0)")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("returns null rather than guessing at something it cannot read", () => {
    expect(parseColorChannels("rebeccapurple")).toBe(null);
    expect(parseColorChannels("")).toBe(null);
  });
});

describe("relativeLuminance", () => {
  it("anchors at black and white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 6);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 6);
  });

  it("weights green most, as the eye does", () => {
    const g = relativeLuminance("#00ff00") as number;
    const r = relativeLuminance("#ff0000") as number;
    const bl = relativeLuminance("#0000ff") as number;
    expect(g > r && r > bl).toBe(true);
  });
});

describe("readableTextOn", () => {
  it("puts dark text on the light purple the default palette uses", () => {
    expect(readableTextOn("#b39ed7")).toBe("#0a0a0a");
  });

  it("puts white text on the dark purple of a down candle", () => {
    expect(readableTextOn("#4f33a3")).toBe("#ffffff");
  });

  it("handles the old teal/red palette both ways", () => {
    expect(readableTextOn("#26a69a")).toBe("#ffffff");
    expect(readableTextOn("#ef5350")).toBe("#ffffff");
  });

  it("falls back to white for a colour it cannot parse", () => {
    expect(readableTextOn("var(--whatever)")).toBe("#ffffff");
  });
});
