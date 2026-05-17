"use client";

import type { HLineDrawing } from "@/lib/drawings/types";
import { formatPrice } from "@/lib/format";

interface Props {
  drawing: HLineDrawing;
  y: number;
  width: number;
  selected: boolean;
  onSelect: () => void;
}

export function HLineDraw({ drawing, y, width, selected, onSelect }: Props) {
  const color = drawing.color ?? "#2962ff";
  const stroke = selected ? "#ffffff" : color;
  const strokeWidth = selected ? 2 : drawing.lineWidth ?? 1;

  return (
    <g>
      {/* Hit area (invisible, easier to click) */}
      <line
        x1={0}
        x2={width}
        y1={y}
        y2={y}
        stroke="transparent"
        strokeWidth={10}
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />
      {/* Visible line */}
      <line
        x1={0}
        x2={width}
        y1={y}
        y2={y}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray="6,4"
        style={{ pointerEvents: "none" }}
      />
      {/* Price label */}
      <g style={{ pointerEvents: "none" }}>
        <rect
          x={4}
          y={y - 8}
          width={drawing.alert?.enabled ? 84 : 70}
          height={16}
          fill={color}
          rx={2}
        />
        <text
          x={8}
          y={y + 3}
          fill="#ffffff"
          fontSize={10}
          fontFamily="var(--font-mono), monospace"
        >
          {formatPrice(drawing.price)}
        </text>
        {drawing.alert?.enabled && (
          <text x={76} y={y + 3} fill="#ffffff" fontSize={11}>
            🔔
          </text>
        )}
      </g>
    </g>
  );
}
