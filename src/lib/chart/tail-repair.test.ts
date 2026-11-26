import { test, describe } from "node:test";
import { expect } from "@/test-utils/expect";
import { missingBars, tailConnects, tailIsNoop, type BarLike } from "@/lib/chart/tail-repair";

const MIN = 60;

function bar(time: number, close = 100, volume = 1): BarLike {
  return { time, open: close, high: close, low: close, close, volume };
}

describe("missingBars", () => {
  test("none while the newest bar is still forming", () => {
    // Bar opened at 0, closes at 60, it is 30s past the open.
    expect(missingBars(0, MIN, 30)).toBe(0);
    expect(missingBars(0, MIN, MIN)).toBe(0);
  });

  test("one as soon as the close has passed", () => {
    expect(missingBars(0, MIN, MIN + 1)).toBe(1);
    expect(missingBars(0, MIN, 2 * MIN)).toBe(1);
  });

  test("counts whole bars missed over a long outage", () => {
    // 10 minutes past the close of a 1m bar.
    expect(missingBars(0, MIN, MIN + 10 * MIN)).toBe(10);
  });

  test("zero rather than NaN on garbage input", () => {
    expect(missingBars(NaN, MIN, 1000)).toBe(0);
    expect(missingBars(0, 0, 1000)).toBe(0);
  });
});

describe("tailConnects", () => {
  test("a tail reaching our newest bar connects", () => {
    expect(tailConnects(600, 600, MIN)).toBe(true);
  });

  test("a tail starting at the very next bar connects", () => {
    expect(tailConnects(600, 660, MIN)).toBe(true);
  });

  test("a tail that starts past the next bar leaves a hole", () => {
    expect(tailConnects(600, 720, MIN)).toBe(false);
  });

  test("nothing held means nothing to splice onto", () => {
    expect(tailConnects(null, 600, MIN)).toBe(false);
  });
});

describe("tailIsNoop", () => {
  const held = [bar(0), bar(60), bar(120, 101)];

  test("an identical tail changes nothing", () => {
    expect(tailIsNoop(held, [bar(60), bar(120, 101)])).toBe(true);
  });

  test("a changed live bar is not a no-op", () => {
    expect(tailIsNoop(held, [bar(60), bar(120, 102)])).toBe(false);
  });

  test("a changed volume on the live bar is not a no-op", () => {
    expect(tailIsNoop(held, [{ ...bar(120, 101), volume: 9 }])).toBe(false);
  });

  test("a newer bar is not a no-op", () => {
    expect(tailIsNoop(held, [bar(120, 101), bar(180, 103)])).toBe(false);
  });

  test("older bars alone change nothing, since history is immutable", () => {
    // The splice skips anything below the newest held bar, so a tail that
    // disagrees about settled history would not be applied anyway.
    expect(tailIsNoop(held, [bar(0, 999), bar(60, 999)])).toBe(true);
  });

  test("an empty tail changes nothing; an empty chart is never a no-op", () => {
    expect(tailIsNoop(held, [])).toBe(true);
    expect(tailIsNoop([], [bar(0)])).toBe(false);
  });
});
