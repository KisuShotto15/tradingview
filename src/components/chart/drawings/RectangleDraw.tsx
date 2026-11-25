"use client";

import { useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { RectangleDrawing, Point } from "@/lib/drawings/types";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { DrawHandle } from "./DrawHandle";
import { useDragPoint } from "./use-drag-point";
import { useDragShape } from "./use-drag-shape";
import { useDrawings } from "@/lib/supabase/use-drawings";

interface Props {
  drawing: RectangleDrawing;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
  container: HTMLElement | null;
}

export function RectangleDraw({
  drawing,
  ax, ay, bx, by,
  selected,
  onSelect,
  onEdit,
  chart,
  candleSeries,
  container,
}: Props) {
  const { updateLive, commit } = useDrawings();
  const snapshotRef = useRef<RectangleDrawing | null>(null);

  function snap() {
    const c = useDrawingsStore.getState().drawings.find((d) => d.id === drawing.id);
    if (c && c.kind === "rectangle") snapshotRef.current = c;
  }
  function commitEnd() {
    if (snapshotRef.current) void commit(drawing.id, snapshotRef.current);
  }

  const dragA = useDragPoint(chart, candleSeries, container, {
    onStart: snap,
    onMove: (pt: Point) => updateLive(drawing.id, { a: pt } as Partial<RectangleDrawing>),
    onEnd: commitEnd,
  });
  const dragB = useDragPoint(chart, candleSeries, container, {
    onStart: snap,
    onMove: (pt: Point) => updateLive(drawing.id, { b: pt } as Partial<RectangleDrawing>),
    onEnd: commitEnd,
  });
  /**
   * The two corners that are not stored anchors.
   *
   * A rectangle keeps only `a` and `b`; its other two corners are the mixed
   * pairs (b.time, a.price) and (a.time, b.price). Both used to be wired to
   * whichever single anchor they shared an x with, so grabbing the top-right
   * corner moved the *bottom*-right one: the corner you held stayed put while
   * the opposite edge followed your finger, and the only way to get the shape
   * you wanted was to drag the two real anchors instead. Each now writes one
   * coordinate into each anchor, which is what makes a corner resize the two
   * edges that meet at it.
   */
  const current = () => {
    const c = useDrawingsStore.getState().drawings.find((d) => d.id === drawing.id);
    return c && c.kind === "rectangle" ? c : null;
  };
  const dragBA = useDragPoint(chart, candleSeries, container, {
    onStart: snap,
    onMove: (pt: Point) => {
      const c = current();
      if (!c) return;
      updateLive(drawing.id, {
        a: { time: c.a.time, price: pt.price },
        b: { time: pt.time, price: c.b.price },
      } as Partial<RectangleDrawing>);
    },
    onEnd: commitEnd,
  });
  const dragAB = useDragPoint(chart, candleSeries, container, {
    onStart: snap,
    onMove: (pt: Point) => {
      const c = current();
      if (!c) return;
      updateLive(drawing.id, {
        a: { time: pt.time, price: c.a.price },
        b: { time: c.b.time, price: pt.price },
      } as Partial<RectangleDrawing>);
    },
    onEnd: commitEnd,
  });

  const dragRect = useDragShape<RectangleDrawing>(
    chart,
    candleSeries,
    container,
    (orig, dt, dp) => ({
      a: { time: orig.a.time + dt, price: orig.a.price + dp },
      b: { time: orig.b.time + dt, price: orig.b.price + dp },
    }),
    () => {
      const c = useDrawingsStore.getState().drawings.find((d) => d.id === drawing.id);
      return c && c.kind === "rectangle" ? c : null;
    },
    { onStart: snap, onMove: (p) => updateLive(drawing.id, p as Partial<RectangleDrawing>), onEnd: commitEnd },
  );

  const borderColor = drawing.color ?? "#2962ff";
  const stroke = borderColor;
  const strokeWidth = drawing.lineWidth ?? 1;
  const strokeDasharray = drawing.lineStyle === 1 ? "6 4" : drawing.lineStyle === 2 ? "2 4" : "none";
  const fillBase = drawing.fillColor ?? borderColor;
  const fillOpacity = drawing.fillOpacity ?? 0.1;

  const left = Math.min(ax, bx);
  const top = Math.min(ay, by);
  const w = Math.abs(bx - ax);
  const h = Math.abs(by - ay);

  return (
    <g>
      {/* Transparent fill hit area for body drag */}
      <rect
        x={left} y={top} width={w} height={h}
        fill="transparent"
        stroke="none"
        className="drawing-hit"
        style={{ cursor: selected ? "move" : "pointer", pointerEvents: "all" }}
        onPointerDown={(e) => {
          if (drawing.locked) return;
          if (selected) {
            dragRect(e);
          } else {
            e.stopPropagation();
            onSelect();
          }
        }}
        onDoubleClick={(e) => { e.stopPropagation(); onEdit(); }}
      />
      {/* Fill */}
      <rect
        x={left} y={top} width={w} height={h}
        fill={fillBase}
        fillOpacity={fillOpacity}
        stroke="none"
        style={{ pointerEvents: "none" }}
      />
      {/* Border */}
      <rect
        x={left} y={top} width={w} height={h}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        style={{ pointerEvents: "none" }}
      />
      {/* Corner handles */}
      {selected && (
        <>
          <DrawHandle x={ax} y={ay} color={borderColor} selected onPointerDown={dragA} />
          <DrawHandle x={bx} y={by} color={borderColor} selected onPointerDown={dragB} />
          <DrawHandle x={bx} y={ay} color={borderColor} selected onPointerDown={dragBA} />
          <DrawHandle x={ax} y={by} color={borderColor} selected onPointerDown={dragAB} />
        </>
      )}
    </g>
  );
}
