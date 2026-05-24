"use client";

import { useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { ParallelChannelDrawing, Point } from "@/lib/drawings/types";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { DrawHandle } from "./DrawHandle";
import { useDragPoint } from "./use-drag-point";
import { useDrawings } from "@/lib/supabase/use-drawings";

interface Props {
  drawing: ParallelChannelDrawing;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
  container: HTMLElement | null;
}

export function ParallelChannelDraw({
  drawing,
  ax,
  ay,
  bx,
  by,
  cx,
  cy,
  selected,
  onSelect,
  onEdit,
  chart,
  candleSeries,
  container,
}: Props) {
  const color = drawing.color ?? "#2962ff";
  const stroke = color;
  const strokeWidth = drawing.lineWidth ?? 1.5;
  const fill = `${color}1a`; // ~10% alpha
  const { updateLive, commit } = useDrawings();
  const snapshotRef = useRef<ParallelChannelDrawing | null>(null);

  function snap() {
    const current = useDrawingsStore.getState().drawings.find((d) => d.id === drawing.id);
    if (current && current.kind === "parallel-channel") snapshotRef.current = current;
  }

  function commitEnd() {
    if (snapshotRef.current) void commit(drawing.id, snapshotRef.current);
  }

  const dragA = useDragPoint(chart, candleSeries, container, {
    onStart: snap,
    onMove: (pt: Point) => updateLive(drawing.id, { a: pt } as Partial<ParallelChannelDrawing>),
    onEnd: commitEnd,
  });
  const dragB = useDragPoint(chart, candleSeries, container, {
    onStart: snap,
    onMove: (pt: Point) => updateLive(drawing.id, { b: pt } as Partial<ParallelChannelDrawing>),
    onEnd: commitEnd,
  });
  const dragC = useDragPoint(chart, candleSeries, container, {
    onStart: snap,
    onMove: (pt: Point) => updateLive(drawing.id, { c: pt } as Partial<ParallelChannelDrawing>),
    onEnd: commitEnd,
  });

  // Parallel line offset: project C onto AB, offset = (cx, cy) - projection
  const proj = projectOnto(ax, ay, bx, by, cx, cy);
  const offsetX = cx - proj.x;
  const offsetY = cy - proj.y;
  const a2x = ax + offsetX;
  const a2y = ay + offsetY;
  const b2x = bx + offsetX;
  const b2y = by + offsetY;

  return (
    <g>
      <polygon
        points={`${ax},${ay} ${bx},${by} ${b2x},${b2y} ${a2x},${a2y}`}
        fill={fill}
        style={{ pointerEvents: "all", cursor: "pointer" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />
      <line x1={ax} x2={bx} y1={ay} y2={by} stroke={stroke} strokeWidth={strokeWidth} style={{ pointerEvents: "none" }} />
      <line x1={a2x} x2={b2x} y1={a2y} y2={b2y} stroke={stroke} strokeWidth={strokeWidth} style={{ pointerEvents: "none" }} />
      {selected && (
        <>
          <DrawHandle x={ax} y={ay} color={color} selected onMouseDown={dragA} />
          <DrawHandle x={bx} y={by} color={color} selected onMouseDown={dragB} />
          <DrawHandle x={cx} y={cy} color={color} selected onMouseDown={dragC} />
        </>
      )}
    </g>
  );
}

function projectOnto(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: ax, y: ay };
  const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  return { x: ax + t * dx, y: ay + t * dy };
}
