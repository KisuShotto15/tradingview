"use client";

import { useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { TrendLineDrawing, Point } from "@/lib/drawings/types";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { DrawHandle } from "./DrawHandle";
import { useDragPoint } from "./use-drag-point";
import { useDrawings } from "@/lib/supabase/use-drawings";

interface Props {
  drawing: TrendLineDrawing;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  selected: boolean;
  onSelect: () => void;
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
  container: HTMLElement | null;
}

export function TrendLineDraw({
  drawing,
  ax,
  ay,
  bx,
  by,
  selected,
  onSelect,
  chart,
  candleSeries,
  container,
}: Props) {
  const color = drawing.color ?? "#2962ff";
  const stroke = selected ? "#ffffff" : color;
  const strokeWidth = selected ? 2 : drawing.lineWidth ?? 1.5;
  const { updateLive, commit } = useDrawings();
  const snapshotRef = useRef<TrendLineDrawing | null>(null);

  function snap() {
    const current = useDrawingsStore.getState().drawings.find((d) => d.id === drawing.id);
    if (current && current.kind === "trendline") snapshotRef.current = current;
  }

  const dragA = useDragPoint(chart, candleSeries, container, {
    onStart: snap,
    onMove: (pt: Point) => updateLive(drawing.id, { a: pt } as Partial<TrendLineDrawing>),
    onEnd: () => {
      if (snapshotRef.current) void commit(drawing.id, snapshotRef.current);
    },
  });
  const dragB = useDragPoint(chart, candleSeries, container, {
    onStart: snap,
    onMove: (pt: Point) => updateLive(drawing.id, { b: pt } as Partial<TrendLineDrawing>),
    onEnd: () => {
      if (snapshotRef.current) void commit(drawing.id, snapshotRef.current);
    },
  });

  return (
    <g>
      <line
        x1={ax}
        x2={bx}
        y1={ay}
        y2={by}
        stroke="transparent"
        strokeWidth={10}
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />
      <line
        x1={ax}
        x2={bx}
        y1={ay}
        y2={by}
        stroke={stroke}
        strokeWidth={strokeWidth}
        style={{ pointerEvents: "none" }}
      />
      {selected && (
        <>
          <DrawHandle x={ax} y={ay} color={color} selected onMouseDown={dragA} />
          <DrawHandle x={bx} y={by} color={color} selected onMouseDown={dragB} />
        </>
      )}
    </g>
  );
}
