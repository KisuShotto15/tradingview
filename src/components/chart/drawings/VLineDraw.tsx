"use client";

import type { VLineDrawing } from "@/lib/drawings/types";

interface Props {
  drawing: VLineDrawing;
  x: number;
  height: number;
  selected: boolean;
  onSelect: () => void;
}

export function VLineDraw({ drawing, x, height, selected, onSelect }: Props) {
  const color = drawing.color ?? "#2962ff";
  const stroke = selected ? "#ffffff" : color;
  const strokeWidth = selected ? 2 : drawing.lineWidth ?? 1;

  return (
    <g>
      <line
        x1={x}
        x2={x}
        y1={0}
        y2={height}
        stroke="transparent"
        strokeWidth={10}
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />
      <line
        x1={x}
        x2={x}
        y1={0}
        y2={height}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray="6,4"
        style={{ pointerEvents: "none" }}
      />
    </g>
  );
}
