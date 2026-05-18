"use client";

import { useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { VLineDrawing } from "@/lib/drawings/types";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useDragShape } from "./use-drag-shape";
import { useDrawings } from "@/lib/supabase/use-drawings";

interface Props {
  drawing: VLineDrawing;
  x: number;
  height: number;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
  container: HTMLElement | null;
}

export function VLineDraw({
  drawing,
  x,
  height,
  selected,
  onSelect,
  onEdit,
  chart,
  candleSeries,
  container,
}: Props) {
  const color = drawing.color ?? "#2962ff";
  const stroke = selected ? "#ffffff" : color;
  const strokeWidth = selected ? 2 : drawing.lineWidth ?? 1;
  const { updateLive, commit } = useDrawings();
  const snapshotRef = useRef<VLineDrawing | null>(null);

  function snap() {
    const c = useDrawingsStore.getState().drawings.find((d) => d.id === drawing.id);
    if (c && c.kind === "vline") snapshotRef.current = c;
  }
  function commitEnd() {
    if (snapshotRef.current) void commit(drawing.id, snapshotRef.current);
  }

  const dragLine = useDragShape<VLineDrawing>(
    chart,
    candleSeries,
    container,
    (orig, dt, _dp) => ({ time: orig.time + dt }),
    () => {
      const c = useDrawingsStore.getState().drawings.find((d) => d.id === drawing.id);
      return c && c.kind === "vline" ? (c as VLineDrawing) : null;
    },
    {
      onStart: snap,
      onMove: (patch) => updateLive(drawing.id, patch as Partial<VLineDrawing>),
      onEnd: commitEnd,
    },
  );

  return (
    <g>
      <line
        x1={x}
        x2={x}
        y1={0}
        y2={height}
        stroke="transparent"
        strokeWidth={10}
        style={{
          pointerEvents: "stroke",
          cursor: selected ? "ew-resize" : "pointer",
        }}
        onMouseDown={(e) => {
          if (selected) {
            dragLine(e);
          } else {
            e.stopPropagation();
            onSelect();
          }
        }}
        onDoubleClick={(e) => { e.stopPropagation(); onEdit(); }}
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
