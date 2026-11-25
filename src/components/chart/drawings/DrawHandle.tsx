"use client";

interface Props {
  x: number;
  y: number;
  color: string;
  selected?: boolean;
  /** "square" for handles with resize-only behavior; default "circle". */
  shape?: "circle" | "square";
  onPointerDown: (e: React.PointerEvent) => void;
}

/** Small circle or square that the user can grab and drag. */
export function DrawHandle({ x, y, color, selected, shape = "circle", onPointerDown }: Props) {
  const commonProps = {
    fill: "#0d0d0d",
    stroke: "#4a1d8a",
    strokeWidth: 1.5,
    className: "drawing-hit",
    style: { pointerEvents: "all" as const, cursor: "grab" },
    onPointerDown,
  };
  if (shape === "square") {
    const size = 9;
    return <rect x={x - size / 2} y={y - size / 2} width={size} height={size} {...commonProps} />;
  }
  return <circle cx={x} cy={y} r={5} {...commonProps} />;
}
