"use client";

import { useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { TrendLineDrawing, Point } from "@/lib/drawings/types";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { DrawHandle } from "./DrawHandle";
import { useDragPoint } from "./use-drag-point";
import { useDragShape } from "./use-drag-shape";
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
  function commitEnd() {
    if (snapshotRef.current) void commit(drawing.id, snapshotRef.current);
  }

  const dragA = useDragPoint(chart, candleSeries, container, {
    onStart: snap,
    onMove: (pt: Point) => updateLive(drawing.id, { a: pt } as Partial<TrendLineDrawing>),
    onEnd: commitEnd,
  });
  const dragB = useDragPoint(chart, candleSeries, container, {
    onStart: snap,
    onMove: (pt: Point) => updateLive(drawing.id, { b: pt } as Partial<TrendLineDrawing>),
    onEnd: commitEnd,
  });
  const dragLine = useDragShape<TrendLineDrawing>(
    chart,
    candleSeries,
    container,
    (orig, dt, dp) => ({
      a: { time: orig.a.time + dt, price: orig.a.price + dp },
      b: { time: orig.b.time + dt, price: orig.b.price + dp },
    }),
    () => {
      const current = useDrawingsStore.getState().drawings.find(
        (d) => d.id === drawing.id,
      );
      return current && current.kind === "trendline"
        ? (current as TrendLineDrawing)
        : null;
    },
    {
      onStart: snap,
      onMove: (patch) => updateLive(drawing.id, patch as Partial<TrendLineDrawing>),
      onEnd: commitEnd,
    },
  );

  return (
    <g>
      <line
        x1={ax}
        x2={bx}
        y1={ay}
        y2={by}
        stroke="transparent"
        strokeWidth={10}
        style={{
          pointerEvents: "stroke",
          cursor: selected ? "move" : "pointer",
        }}
        onMouseDown={(e) => {
          if (selected) {
            dragLine(e);
          } else {
            e.stopPropagation();
            onSelect();
          }
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
