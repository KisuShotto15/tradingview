"use client";

import type { HRayDrawing } from "@/lib/drawings/types";
import { formatPrice } from "@/lib/format";

interface Props {
  drawing: HRayDrawing;
  /** Pixel x of the anchor */
  anchorX: number;
  /** Pixel y of the price */
  y: number;
  /** Container width — ray extends to this */
  width: number;
  selected: boolean;
  onSelect: () => void;
}

export function HRayDraw({ drawing, anchorX, y, width, selected, onSelect }: Props) {
  const color = drawing.color ?? "#2962ff";
  const stroke = selected ? "#ffffff" : color;
  const strokeWidth = selected ? 2 : drawing.lineWidth ?? 1;

  return (
    <g>
      <line
        x1={anchorX}
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
      <line
        x1={anchorX}
        x2={width}
        y1={y}
        y2={y}
        stroke={stroke}
        strokeWidth={strokeWidth}
        style={{ pointerEvents: "none" }}
      />
      {/* Anchor handle */}
      <circle
        cx={anchorX}
        cy={y}
        r={4}
        fill={color}
        stroke="#ffffff"
        strokeWidth={1}
        style={{ pointerEvents: "none" }}
      />
      {/* Price label */}
      <g style={{ pointerEvents: "none" }}>
        <rect
          x={anchorX + 8}
          y={y - 8}
          width={70}
          height={16}
          fill={color}
          rx={2}
        />
        <text
          x={anchorX + 12}
          y={y + 3}
          fill="#ffffff"
          fontSize={10}
          fontFamily="var(--font-mono), monospace"
        >
          {formatPrice(drawing.anchor.price)}
        </text>
      </g>
    </g>
  );
}
