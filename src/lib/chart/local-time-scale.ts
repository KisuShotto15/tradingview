import {
  defaultHorzScaleBehavior,
  type LocalizationOptions,
  type Time,
  type TickMark,
  type TimeScalePoint,
} from "lightweight-charts";
import {
  fillWeights,
  formatCrosshairTime,
  formatTick,
  localTimeZone,
  tickMarkTypeFor,
  type WeightedPoint,
} from "./local-time";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const Base = defaultHorzScaleBehavior();

/**
 * lightweight-charts' own time scale, reading times in the viewer's zone (see
 * `local-time.ts` for why it is done here and not by shifting the data).
 *
 * Only public fields are read — `originalTime`, never the library's internal
 * time object, whose field names are mangled in the production build.
 */
export class LocalTimeScale extends Base {
  private tz = localTimeZone();
  private utc = false;

  /**
   * Intraday bars read in the local zone; daily and longer stay in UTC (the
   * exchange's day). Must be called before the new timeframe's data is set,
   * since that is when the tick weights are computed.
   */
  setIntraday(intraday: boolean): void {
    this.utc = !intraday;
  }

  zone(): string {
    return this.utc ? "UTC" : this.tz;
  }

  /** The crosshair label, for `localization.timeFormatter`. */
  formatCrosshair = (time: Time): string =>
    typeof time === "number" ? formatCrosshairTime(time, this.zone(), !this.utc) : String(time);

  override fillWeightsForPoints(points: readonly Mutable<TimeScalePoint>[], startIndex: number): void {
    if (!fillWeights(points as unknown as WeightedPoint[], startIndex, this.zone())) {
      super.fillWeightsForPoints(points, startIndex);
    }
  }

  override formatTickmark(tickMark: TickMark, localization: LocalizationOptions<Time>): string {
    if (typeof tickMark.originalTime !== "number") return super.formatTickmark(tickMark, localization);
    const ts = (this.options() as unknown as { timeScale: { timeVisible: boolean; secondsVisible: boolean } })
      .timeScale;
    const type = tickMarkTypeFor(tickMark.weight, ts.timeVisible, ts.secondsVisible);
    return formatTick(tickMark.originalTime, type, this.zone());
  }

  /**
   * Labels are cached per time; the same instant reads differently in the
   * two modes (20:00 local against the 27th in UTC), so the mode is part of
   * the key.
   */
  override cacheKey(item: Parameters<InstanceType<typeof Base>["cacheKey"]>[0]): number {
    return super.cacheKey(item) * 2 + (this.utc ? 1 : 0);
  }
}
