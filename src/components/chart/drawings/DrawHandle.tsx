"use client";

interface Props {
  x: number;
  y: number;
  color: string;
  selected?: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}

/** Small circle that the user can grab and drag. */
export function DrawHandle({ x, y, color, selected, onMouseDown }: Props) {
  return (
    <circle
      cx={x}
      cy={y}
      r={selected ? 6 : 4}
      fill={selected ? "#ffffff" : color}
      stroke={selected ? color : "#ffffff"}
      strokeWidth={1.5}
      style={{ pointerEvents: "all", cursor: "grab" }}
      onMouseDown={onMouseDown}
    />
  );
}
