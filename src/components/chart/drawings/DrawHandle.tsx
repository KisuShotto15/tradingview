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
      r={5}
      fill="#0d0d0d"
      stroke="#4a1d8a"
      strokeWidth={1.5}
      style={{ pointerEvents: "all", cursor: "grab" }}
      onMouseDown={onMouseDown}
    />
  );
}
