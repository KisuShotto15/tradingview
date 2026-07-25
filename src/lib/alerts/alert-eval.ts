import type { AlertCondition } from "@/lib/store/alerts-store";
import type { Drawing } from "@/lib/drawings/types";

/** True if a crossing (up/down) satisfies the alert condition. */
export function conditionHit(condition: AlertCondition, up: boolean, down: boolean): boolean {
  return (
    (condition === "crossing" && (up || down)) ||
    (condition === "crossing-up" && up) ||
    (condition === "crossing-down" && down)
  );
}

/**
 * The price level a drawing represents at time `nowTime`. Horizontal lines are
 * constant; sloped lines (trend line / ray) are interpolated/extrapolated to the
 * current bar so a moving price can cross the projected line. Returns null for
 * kinds that don't define a crossable level.
 */
export function priceLevelFor(d: Drawing, nowTime: number | null): number | null {
  switch (d.kind) {
    case "hline":
      return d.price;
    case "hray":
      return d.anchor.price;
    case "trendline":
    case "ray": {
      if (nowTime === null || d.b.time === d.a.time) return null;
      const slope = (d.b.price - d.a.price) / (d.b.time - d.a.time);
      return d.a.price + slope * (nowTime - d.a.time);
    }
    default:
      return null;
  }
}
