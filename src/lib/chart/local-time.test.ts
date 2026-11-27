import { test } from "node:test";
import { expect } from "@/test-utils/expect";
import {
  W, fillWeights, formatCrosshairTime, formatTick, tickMarkTypeFor, weightBetween, zoneOffsetSec,
  type WeightedPoint,
} from "./local-time";

const CCS = "America/Caracas"; // UTC-4, no DST
const NY = "America/New_York";
const ts = (iso: string) => Date.parse(iso) / 1000;

test("offset: Caracas is four hours behind UTC, New York follows DST", () => {
  expect(zoneOffsetSec(ts("2026-11-27T17:00:00Z"), CCS)).toBe(-4 * 3600);
  expect(zoneOffsetSec(ts("2026-07-01T12:00:00Z"), NY)).toBe(-4 * 3600);
  expect(zoneOffsetSec(ts("2026-12-01T12:00:00Z"), NY)).toBe(-5 * 3600);
  expect(zoneOffsetSec(ts("2026-12-01T12:00:00Z"), "UTC")).toBe(0);
});

test("labels read the local wall clock", () => {
  // 17:11 UTC is 13:11 in Caracas.
  expect(formatTick(ts("2026-11-27T17:11:00Z"), 3, CCS)).toBe("13:11");
  expect(formatCrosshairTime(ts("2026-11-27T17:11:00Z"), CCS, true)).toBe("27 Nov '26   13:11");
  // 02:00 UTC on the 27th is still the evening of the 26th there.
  expect(formatCrosshairTime(ts("2026-11-27T02:00:00Z"), CCS, true)).toBe("26 Nov '26   22:00");
  expect(formatTick(ts("2026-11-27T04:00:00Z"), 2, CCS)).toBe("27");
});

test("daily bars stay on the exchange's UTC day", () => {
  expect(formatCrosshairTime(ts("2026-11-27T00:00:00Z"), "UTC", false)).toBe("27 Nov '26");
  expect(formatTick(ts("2026-12-01T00:00:00Z"), 1, "UTC")).toBe("Dec");
});

test("the day boundary falls on local midnight, not UTC midnight", () => {
  // In Caracas, UTC midnight is 20:00 — an ordinary hour mark.
  expect(weightBetween(ts("2026-11-27T00:00:00Z"), ts("2026-11-26T23:00:00Z"), CCS)).toBe(W.Hour1);
  // Local midnight (04:00 UTC) is the day mark.
  expect(weightBetween(ts("2026-11-27T04:00:00Z"), ts("2026-11-27T03:00:00Z"), CCS)).toBe(W.Day);
  // And in UTC it is the other way round.
  expect(weightBetween(ts("2026-11-27T00:00:00Z"), ts("2026-11-26T23:00:00Z"), "UTC")).toBe(W.Day);
  expect(weightBetween(ts("2026-12-01T04:00:00Z"), ts("2026-12-01T03:00:00Z"), CCS)).toBe(W.Month);
});

test("fillWeights weights every point, guessing the first, and from an index", () => {
  const pts: WeightedPoint[] = [0, 1, 2, 3, 4, 5].map((h) => ({
    timeWeight: -1,
    originalTime: ts("2026-11-27T01:00:00Z") + h * 3600,
  }));
  expect(fillWeights(pts, 0, CCS)).toBe(true);
  // 01:00Z..06:00Z is 21:00..02:00 local; 04:00Z is local midnight.
  expect(pts.map((p) => p.timeWeight)).toEqual([W.Hour3, W.Hour1, W.Hour1, W.Day, W.Hour1, W.Hour1]);
  pts[5].timeWeight = -1;
  expect(fillWeights(pts, 5, CCS)).toBe(true);
  expect(pts[5].timeWeight).toBe(W.Hour1);
});

test("fillWeights declines times that are not timestamps", () => {
  const pts: WeightedPoint[] = [{ timeWeight: -1, originalTime: "2026-11-27" }];
  expect(fillWeights(pts, 0, CCS)).toBe(false);
  expect(pts[0].timeWeight).toBe(-1);
});

test("tick types follow the library's mapping", () => {
  expect(tickMarkTypeFor(W.Year, true, false)).toBe(0);
  expect(tickMarkTypeFor(W.Month, true, false)).toBe(1);
  expect(tickMarkTypeFor(W.Day, true, false)).toBe(2);
  expect(tickMarkTypeFor(W.Hour6, true, false)).toBe(3);
  expect(tickMarkTypeFor(W.Hour6, false, false)).toBe(2);
  expect(tickMarkTypeFor(W.Second, true, true)).toBe(4);
});
