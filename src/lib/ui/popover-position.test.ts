import { test, describe } from "node:test";
import { expect } from "@/test-utils/expect";
import { placePopover, type Box } from "@/lib/ui/popover-position";

const PHONE = { width: 412, height: 915 };
const DESKTOP = { width: 1920, height: 1080 };
const PALETTE = { width: 280, height: 330 };

function trigger(left: number, top: number, w = 36, h = 28): Box {
  return { left, top, right: left + w, bottom: top + h };
}

describe("placePopover", () => {
  test("opens below the trigger when there is room", () => {
    const p = placePopover(trigger(800, 200), PALETTE, DESKTOP);
    expect(p.side).toBe("below");
    expect(p.top).toBe(232);
    // Right-aligned to the trigger, as the CSS version was.
    expect(p.left).toBe(556);
  });

  test("flips above when the trigger sits near the bottom", () => {
    // The drawing toolbar on a phone: near the bottom of the chart.
    const p = placePopover(trigger(200, 820), PALETTE, PHONE);
    expect(p.side).toBe("above");
    expect(p.top).toBe(486);
    expect(p.top + PALETTE.height <= 820).toBe(true);
  });

  test("never hangs off the left edge of a narrow screen", () => {
    // Right-aligning a 280px palette to a trigger 60px from the left would
    // put its left edge at -184.
    const p = placePopover(trigger(60, 100), PALETTE, PHONE);
    expect(p.left).toBe(8);
  });

  test("never hangs off the right edge", () => {
    const p = placePopover(trigger(400, 100), PALETTE, PHONE);
    expect(p.left).toBe(124);
    expect(p.left + PALETTE.width <= PHONE.width - 8).toBe(true);
  });

  test("stays below rather than flipping into an even smaller gap", () => {
    // Mid-screen with no room either side: below is no worse, and flipping
    // would only move where it gets clipped.
    const p = placePopover(trigger(100, 300, 36, 28), { width: 280, height: 700 }, PHONE);
    expect(p.side).toBe("below");
  });

  test("a popover taller than the viewport shows its start", () => {
    const p = placePopover(trigger(100, 400), { width: 280, height: 2000 }, PHONE);
    expect(p.top).toBe(8);
  });

  test("honours custom margin and gap", () => {
    const p = placePopover(trigger(800, 200), PALETTE, DESKTOP, { margin: 16, gap: 10 });
    expect(p.top).toBe(238);
  });
});
