import { test } from "node:test";
import { expect } from "@/test-utils/expect";
import { wheelIndex } from "./wheel-step";

test("a short move stays put", () => {
  expect(wheelIndex(2, -10, 6, 24)).toBe(2);
  expect(wheelIndex(2, 23, 6, 24)).toBe(2);
});

test("each full step of travel moves one value, up = next", () => {
  expect(wheelIndex(1, -24, 6, 24)).toBe(2);
  expect(wheelIndex(1, -72, 6, 24)).toBe(4);
  expect(wheelIndex(3, 48, 6, 24)).toBe(1);
});

test("clamps at both ends rather than wrapping", () => {
  expect(wheelIndex(4, -500, 6, 24)).toBe(5);
  expect(wheelIndex(1, 500, 6, 24)).toBe(0);
});

test("an empty list is index 0", () => {
  expect(wheelIndex(0, -100, 0, 24)).toBe(0);
});
