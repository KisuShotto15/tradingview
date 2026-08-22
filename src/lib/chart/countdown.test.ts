import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { barCloseTime, secondsToBarClose, formatCountdown } from "./countdown";

const JAN_1_2024 = Date.UTC(2024, 0, 1) / 1000;

describe("barCloseTime", () => {
  it("adds the fixed interval for sub-monthly timeframes", () => {
    expect(barCloseTime(JAN_1_2024, "1m")).toBe(JAN_1_2024 + 60);
    expect(barCloseTime(JAN_1_2024, "4h")).toBe(JAN_1_2024 + 14400);
    expect(barCloseTime(JAN_1_2024, "1d")).toBe(JAN_1_2024 + 86400);
    expect(barCloseTime(JAN_1_2024, "1w")).toBe(JAN_1_2024 + 604800);
  });

  it("uses the real calendar boundary for monthly bars", () => {
    // January is 31 days — the 30-day approximation would land a day early.
    expect(barCloseTime(JAN_1_2024, "1M")).toBe(Date.UTC(2024, 1, 1) / 1000);
    // February 2024 is a leap month (29 days).
    expect(barCloseTime(Date.UTC(2024, 1, 1) / 1000, "1M")).toBe(
      Date.UTC(2024, 2, 1) / 1000,
    );
    // December rolls the year over.
    expect(barCloseTime(Date.UTC(2024, 11, 1) / 1000, "1M")).toBe(
      Date.UTC(2025, 0, 1) / 1000,
    );
  });
});

describe("secondsToBarClose", () => {
  it("counts down within the bar", () => {
    expect(secondsToBarClose(JAN_1_2024, "1m", (JAN_1_2024 + 20) * 1000)).toBe(40);
  });

  it("never goes negative on a stale bar", () => {
    expect(secondsToBarClose(JAN_1_2024, "1m", (JAN_1_2024 + 500) * 1000)).toBe(0);
  });

  it("rounds a partial second up, so it never shows 0 early", () => {
    expect(secondsToBarClose(JAN_1_2024, "1m", (JAN_1_2024 + 59.4) * 1000)).toBe(1);
  });
});

describe("formatCountdown", () => {
  it("shows mm:ss inside the hour", () => {
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(9)).toBe("00:09");
    expect(formatCountdown(65)).toBe("01:05");
    expect(formatCountdown(3599)).toBe("59:59");
  });

  it("adds hours past the hour", () => {
    expect(formatCountdown(3600)).toBe("1:00:00");
    expect(formatCountdown(3661)).toBe("1:01:01");
  });

  it("adds a day count past the day", () => {
    expect(formatCountdown(86400)).toBe("1d 00:00:00");
    expect(formatCountdown(3 * 86400 + 3661)).toBe("3d 01:01:01");
  });

  it("floors negatives to zero", () => {
    expect(formatCountdown(-5)).toBe("00:00");
  });
});
