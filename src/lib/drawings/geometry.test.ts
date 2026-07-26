import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { extendRay, extendLine, midpoint, harmonicRatios } from "./geometry";

describe("extendRay", () => {
  it("extends toward the box edge in the B direction", () => {
    // A=(0,50) B=(10,50) horizontal to the right → hits x=100.
    const p = extendRay({ x: 0, y: 50 }, { x: 10, y: 50 }, 100, 100);
    expect(p.x).toBeCloseTo(100, 6);
    expect(p.y).toBeCloseTo(50, 6);
  });
  it("returns B when A==B (degenerate)", () => {
    const p = extendRay({ x: 5, y: 5 }, { x: 5, y: 5 }, 100, 100);
    expect(p).toEqual({ x: 5, y: 5 });
  });
});

describe("extendLine", () => {
  it("extends both directions to the edges", () => {
    const { start, end } = extendLine({ x: 40, y: 50 }, { x: 60, y: 50 }, 100, 100);
    expect(start.x).toBeCloseTo(0, 6); // toward A
    expect(end.x).toBeCloseTo(100, 6); // toward B
  });
});

describe("midpoint", () => {
  it("averages the coordinates", () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });
});

describe("harmonicRatios", () => {
  it("computes AB/XA, BC/AB, CD/BC from absolute price legs", () => {
    // X=100 A=200 B=150 C=175 D=125 → XA=100, AB=50, BC=25, CD=50
    const r = harmonicRatios([100, 200, 150, 175, 125]);
    expect(r.abXa).toBeCloseTo(0.5, 9); // 50/100
    expect(r.bcAb).toBeCloseTo(0.5, 9); // 25/50
    expect(r.cdBc).toBeCloseTo(2, 9); // 50/25
  });
  it("returns NaN when a denominator leg is zero", () => {
    const r = harmonicRatios([100, 100, 150, 175, 125]); // XA = 0
    expect(Number.isNaN(r.abXa)).toBe(true);
  });
});
