"use client";

import { useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type {
  LongPositionDrawing,
  ShortPositionDrawing,
  Drawing,
} from "@/lib/drawings/types";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { DrawHandle } from "./DrawHandle";
import { useDragShape } from "./use-drag-shape";
import { useDrawings } from "@/lib/supabase/use-drawings";
import { formatPrice } from "@/lib/format";

type PositionDrawing = LongPositionDrawing | ShortPositionDrawing;

interface Props {
  drawing: PositionDrawing;
  xA: number;
  xB: number;
  yEntry: number;
  yStop: number;
  yTarget: number;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
  container: HTMLElement | null;
}

export function PositionDraw({
  drawing,
  xA,
  xB,
  yEntry,
  yStop,
  yTarget,
  selected,
  onSelect,
  onEdit,
  chart,
  candleSeries,
  container,
}: Props) {
  const isLong = drawing.kind === "long";

  const profitColor = isLong
    ? (drawing.targetColor ?? "#26a69a")
    : (drawing.stopColor ?? "#ef5350");
  const lossColor = isLong
    ? (drawing.stopColor ?? "#ef5350")
    : (drawing.targetColor ?? "#26a69a");

  const profitFill = `${profitColor}26`;
  const lossFill = `${lossColor}26`;
  const entryColor = drawing.color ?? "#d1d4dc";
  const labelColor = drawing.textColor ?? "#d1d4dc";

  const { updateLive, commit } = useDrawings();
  const snapshotRef = useRef<PositionDrawing | null>(null);

  function snap() {
    const current = useDrawingsStore.getState().drawings.find((d) => d.id === drawing.id);
    if (current && (current.kind === "long" || current.kind === "short")) {
      snapshotRef.current = current;
    }
  }
  function commitEnd() {
    if (snapshotRef.current) void commit(drawing.id, snapshotRef.current);
  }

  function makeYDrag(field: "entry" | "stop" | "target") {
    return (e: React.MouseEvent) => {
      if (!candleSeries || !container) return;
      e.preventDefault();
      e.stopPropagation();
      snap();
      function onMove(ev: MouseEvent) {
        const rect = container!.getBoundingClientRect();
        const y = ev.clientY - rect.top;
        const p = candleSeries!.coordinateToPrice(y);
        if (p === null) return;
        updateLive(drawing.id, { [field]: p } as Partial<Drawing>);
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        commitEnd();
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "grabbing";
    };
  }

  const dragShape = useDragShape<PositionDrawing>(
    chart,
    candleSeries,
    container,
    (orig, dt, dp) => ({
      entry: orig.entry + dp,
      stop: orig.stop + dp,
      target: orig.target + dp,
      timeA: orig.timeA + dt,
      timeB: orig.timeB + dt,
    }),
    () => {
      const c = useDrawingsStore.getState().drawings.find((d) => d.id === drawing.id);
      return c && (c.kind === "long" || c.kind === "short")
        ? (c as PositionDrawing)
        : null;
    },
    {
      onStart: snap,
      onMove: (patch) => updateLive(drawing.id, patch as Partial<Drawing>),
      onEnd: commitEnd,
    },
  );

  const left = Math.min(xA, xB);
  const right = Math.max(xA, xB);
  const width = right - left;

  const profitY1 = Math.min(yEntry, yTarget);
  const profitY2 = Math.max(yEntry, yTarget);
  const lossY1 = Math.min(yEntry, yStop);
  const lossY2 = Math.max(yEntry, yStop);

  const risk = Math.abs(drawing.entry - drawing.stop);
  const reward = Math.abs(drawing.target - drawing.entry);
  const rr = risk === 0 ? 0 : reward / risk;

  const showLabels = selected || (drawing.showLabels ?? false);

  function onZoneMouseDown(e: React.MouseEvent) {
    if (selected) {
      dragShape(e);
    } else {
      e.stopPropagation();
      onSelect();
    }
  }
  const zoneCursor = selected ? "move" : "pointer";

  // Stats box: price diff + RR, shown centered in profit zone when selected
  const profitCenterY = (profitY1 + profitY2) / 2;
  const lossCenterY = (lossY1 + lossY2) / 2;
  const pctProfit = drawing.entry === 0 ? 0 : (reward / Math.abs(drawing.entry)) * 100;
  const pctLoss = drawing.entry === 0 ? 0 : (risk / Math.abs(drawing.entry)) * 100;

  return (
    <g>
      {/* Profit zone */}
      <rect
        x={left}
        y={profitY1}
        width={width}
        height={profitY2 - profitY1}
        fill={profitFill}
        stroke={selected ? profitColor : "none"}
        strokeWidth={selected ? 0.5 : 0}
        style={{ pointerEvents: "all", cursor: zoneCursor }}
        onMouseDown={onZoneMouseDown}
        onDoubleClick={(e) => { e.stopPropagation(); onEdit(); }}
      />
      {/* Loss zone */}
      <rect
        x={left}
        y={lossY1}
        width={width}
        height={lossY2 - lossY1}
        fill={lossFill}
        stroke={selected ? lossColor : "none"}
        strokeWidth={selected ? 0.5 : 0}
        style={{ pointerEvents: "all", cursor: zoneCursor }}
        onMouseDown={onZoneMouseDown}
        onDoubleClick={(e) => { e.stopPropagation(); onEdit(); }}
      />

      {/* Entry line — always visible */}
      <line
        x1={left} x2={right} y1={yEntry} y2={yEntry}
        stroke={entryColor} strokeWidth={1.5}
        style={{ pointerEvents: "none" }}
      />

      {/* Stop / Target lines — only when selected */}
      {showLabels && (
        <>
          <line
            x1={left} x2={right} y1={yStop} y2={yStop}
            stroke={lossColor} strokeWidth={1} strokeDasharray="4,3"
            style={{ pointerEvents: "none" }}
          />
          <line
            x1={left} x2={right} y1={yTarget} y2={yTarget}
            stroke={profitColor} strokeWidth={1} strokeDasharray="4,3"
            style={{ pointerEvents: "none" }}
          />
        </>
      )}

      {/* LONG / SHORT badge — always visible */}
      <rect
        x={right - 52} y={yEntry - 9} width={46} height={17}
        fill={isLong ? profitColor : lossColor} rx={2}
        style={{ pointerEvents: "none" }}
      />
      <text
        x={right - 29} y={yEntry + 3.5}
        textAnchor="middle" fill="#ffffff" fontSize={10}
        fontFamily="var(--font-mono), monospace"
        fontWeight={600}
        style={{ pointerEvents: "none" }}
      >
        {isLong ? "LONG" : "SHORT"}
      </text>

      {/* Stats labels — only when selected */}
      {showLabels && (
        <>
          {/* Entry label */}
          <text
            x={left + 6} y={yEntry - 5}
            fill={labelColor} fontSize={10}
            fontFamily="var(--font-mono), monospace"
            style={{ pointerEvents: "none" }}
          >
            {`Entry  ${formatPrice(drawing.entry)}`}
          </text>

          {/* Target label */}
          <text
            x={left + 6} y={profitY1 + 14}
            fill={profitColor} fontSize={10}
            fontFamily="var(--font-mono), monospace"
            style={{ pointerEvents: "none" }}
          >
            {`${formatPrice(drawing.target)}  (+${pctProfit.toFixed(2)}%)`}
          </text>

          {/* Stop label */}
          <text
            x={left + 6} y={lossY2 - 5}
            fill={lossColor} fontSize={10}
            fontFamily="var(--font-mono), monospace"
            style={{ pointerEvents: "none" }}
          >
            {`${formatPrice(drawing.stop)}  (-${pctLoss.toFixed(2)}%)`}
          </text>

          {/* RR badge — center of profit zone */}
          {profitY2 - profitY1 > 24 && (
            <g style={{ pointerEvents: "none" }}>
              <rect
                x={(left + right) / 2 - 28} y={profitCenterY - 9}
                width={56} height={17}
                fill={profitColor} rx={2} opacity={0.85}
              />
              <text
                x={(left + right) / 2} y={profitCenterY + 3}
                textAnchor="middle" fill="#ffffff" fontSize={9}
                fontFamily="var(--font-mono), monospace"
              >
                {`RR ${rr.toFixed(2)}`}
              </text>
            </g>
          )}

          {/* Loss RR info — center of loss zone */}
          {lossY2 - lossY1 > 24 && (
            <g style={{ pointerEvents: "none" }}>
              <rect
                x={(left + right) / 2 - 28} y={lossCenterY - 9}
                width={56} height={17}
                fill={lossColor} rx={2} opacity={0.7}
              />
              <text
                x={(left + right) / 2} y={lossCenterY + 3}
                textAnchor="middle" fill="#ffffff" fontSize={9}
                fontFamily="var(--font-mono), monospace"
              >
                {`1 : ${rr.toFixed(2)}`}
              </text>
            </g>
          )}
        </>
      )}

      {selected && (
        <>
          <DrawHandle x={(left + right) / 2} y={yEntry} color={entryColor} selected onMouseDown={makeYDrag("entry")} />
          <DrawHandle x={(left + right) / 2} y={yStop} color={lossColor} selected onMouseDown={makeYDrag("stop")} />
          <DrawHandle x={(left + right) / 2} y={yTarget} color={profitColor} selected onMouseDown={makeYDrag("target")} />
          {/* Time handles */}
          <DrawHandle x={xA} y={yEntry} color={entryColor} selected onMouseDown={makeYDrag("entry")} />
          <DrawHandle x={xB} y={yEntry} color={entryColor} selected onMouseDown={makeYDrag("entry")} />
        </>
      )}
    </g>
  );
}
