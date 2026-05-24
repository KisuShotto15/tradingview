export interface Point {
  time: number;
  price: number;
}

export type DrawingKind =
  | "hline"
  | "vline"
  | "trendline"
  | "ray"
  | "hray"
  | "parallel-channel"
  | "fib-retracement"
  | "price-range"
  | "date-range"
  | "long"
  | "short"
  | "brush"
  | "highlighter"
  | "rectangle";

export interface AlertConfig {
  enabled: boolean;
  sound: boolean;
  direction: "cross" | "cross-up" | "cross-down";
  lastTriggeredAt?: number;
}

interface BaseDrawing {
  id: string;
  symbol: string;
  color?: string;
  lineWidth?: number;
  /** 0 = solid, 1 = dashed, 2 = dotted */
  lineStyle?: 0 | 1 | 2;
  hidden?: boolean;
  /** When true, the drawing cannot be moved or resized (UI handlers must
   *  short-circuit). Toggled from the floating context toolbar. */
  locked?: boolean;
  alert?: AlertConfig | null;
}

export interface HLineDrawing extends BaseDrawing {
  kind: "hline";
  price: number;
}

export interface VLineDrawing extends BaseDrawing {
  kind: "vline";
  time: number;
}

export interface TrendLineDrawing extends BaseDrawing {
  kind: "trendline";
  a: Point;
  b: Point;
}

export interface RayDrawing extends BaseDrawing {
  kind: "ray";
  a: Point;
  b: Point;
}

export interface HRayDrawing extends BaseDrawing {
  kind: "hray";
  anchor: Point;
}

export interface ParallelChannelDrawing extends BaseDrawing {
  kind: "parallel-channel";
  a: Point;
  b: Point;
  c: Point;
}

export interface FibRetracementDrawing extends BaseDrawing {
  kind: "fib-retracement";
  a: Point;
  b: Point;
  levels: number[];
}

export interface PriceRangeDrawing extends BaseDrawing {
  kind: "price-range";
  priceA: number;
  priceB: number;
  timeA: number;
  timeB: number;
}

export interface DateRangeDrawing extends BaseDrawing {
  kind: "date-range";
  timeA: number;
  timeB: number;
}

export interface LongPositionDrawing extends BaseDrawing {
  kind: "long";
  entry: number;
  stop: number;
  target: number;
  timeA: number;
  timeB: number;
  stopColor?: string;
  targetColor?: string;
  textColor?: string;
  showLabels?: boolean;
}

export interface ShortPositionDrawing extends BaseDrawing {
  kind: "short";
  entry: number;
  stop: number;
  target: number;
  timeA: number;
  timeB: number;
  stopColor?: string;
  targetColor?: string;
  textColor?: string;
  showLabels?: boolean;
}

export interface BrushDrawing extends BaseDrawing {
  kind: "brush";
  points: Point[];
  /** Float logical bar indices (from coordinateToLogical) — parallel to points.
   *  When present, rendering uses logicalToCoordinate for pixel-accurate x positions
   *  without any time-based round-trip quantization. */
  logicals?: number[];
}

export interface HighlighterDrawing extends BaseDrawing {
  kind: "highlighter";
  points: Point[];
  logicals?: number[];
}

export interface RectangleDrawing extends BaseDrawing {
  kind: "rectangle";
  a: Point;
  b: Point;
  fillColor?: string;
  fillOpacity?: number;
}

export type Drawing =
  | HLineDrawing
  | VLineDrawing
  | TrendLineDrawing
  | RayDrawing
  | HRayDrawing
  | ParallelChannelDrawing
  | FibRetracementDrawing
  | PriceRangeDrawing
  | DateRangeDrawing
  | LongPositionDrawing
  | ShortPositionDrawing
  | BrushDrawing
  | HighlighterDrawing
  | RectangleDrawing;

export const FIB_LEVELS_DEFAULT = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
