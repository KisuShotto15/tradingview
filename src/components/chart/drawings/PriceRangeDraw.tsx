"use client";

import { useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { PriceRangeDrawing, Point } from "@/lib/drawings/types";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { DrawHandle } from "./DrawHandle";
import { useDragPoint } from "./use-drag-point";
import { useDrawings } from "@/lib/supabase/use-drawings";
import { formatPrice } from "@/lib/format";

interface Props {
  drawing: PriceRangeDrawing;
  xA: number;
  xB: number;
  yA: number;
  yB: number;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
  container: HTMLElement | null;
}

export function PriceRangeDraw({
  drawing,
  xA,
  xB,
  yA,
  yB,
  selected,
  onSelect,
  onEdit,
  chart,
  candleSeries,
  container,
}: Props) {
  const { updateLive, commit } = useDrawings();
  const snapshotRef = useRef<PriceRangeDrawing | null>(null);

  function snap() {
    const current = useDrawingsStore.getState().drawings.find((d) => d.id === drawing.id);
    if (current && current.kind === "price-range") snapshotRef.current = current;
  }
  function commitEnd() {
    if (snapshotRef.current) void commit(drawing.id, snapshotRef.current);
  }

  const dragA = useDragPoint(chart, candleSeries, container, {
    onStart: snap,
    onMove: (pt: Point) =>
      updateLive(drawing.id, { priceA: pt.price, timeA: pt.time } as Partial<PriceRangeDrawing>),
    onEnd: commitEnd,
  });
  const dragB = useDragPoint(chart, candleSeries, container, {
    onStart: snap,
    onMove: (pt: Point) =>
      updateLive(drawing.id, { priceB: pt.price, timeB: pt.time } as Partial<PriceRangeDrawing>),
    onEnd: commitEnd,
  });

  const isUp = drawing.priceB >= drawing.priceA;
  const baseColor = isUp ? "#26a69a" : "#ef5350";
  const fill = `${baseColor}1a`;
  const stroke = baseColor;

  const left = Math.min(xA, xB);
  const right = Math.max(xA, xB);
  const top = Math.min(yA, yB);
  const bottom = Math.max(yA, yB);
  const diff = drawing.priceB - drawing.priceA;
  const pct = drawing.priceA === 0 ? 0 : (diff / drawing.priceA) * 100;
  const sign = diff >= 0 ? "+" : "";

  return (
    <g>
      <rect
        x={left}
        y={top}
        width={right - left}
        height={bottom - top}
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
        style={{ pointerEvents: "all", cursor: "pointer" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />
      <text
        x={(left + right) / 2}
        y={Math.max(top - 6, 12)}
        textAnchor="middle"
        fill={baseColor}
        fontSize={11}
        fontFamily="var(--font-mono), monospace"
        style={{ pointerEvents: "none" }}
      >
        {`${sign}${formatPrice(diff)} (${sign}${pct.toFixed(2)}%)`}
      </text>
      {selected && (
        <>
          <DrawHandle x={xA} y={yA} color={baseColor} selected onMouseDown={dragA} />
          <DrawHandle x={xB} y={yB} color={baseColor} selected onMouseDown={dragB} />
        </>
      )}
    </g>
  );
}
