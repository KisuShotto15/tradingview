"use client";

import { useRef } from "react";
import type { ISeriesApi } from "lightweight-charts";
import type {
  LongPositionDrawing,
  ShortPositionDrawing,
  Drawing,
} from "@/lib/drawings/types";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { DrawHandle } from "./DrawHandle";
import { useDrawings } from "@/lib/supabase/use-drawings";
import { formatPrice } from "@/lib/format";

type PositionDrawing = LongPositionDrawing | ShortPositionDrawing;

interface Props {
  drawing: PositionDrawing;
  /** Pixel x of timeA */
  xA: number;
  /** Pixel x of timeB */
  xB: number;
  /** Pixel y of entry */
  yEntry: number;
  /** Pixel y of stop */
  yStop: number;
  /** Pixel y of target */
  yTarget: number;
  selected: boolean;
  onSelect: () => void;
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
  candleSeries,
  container,
}: Props) {
  const isLong = drawing.kind === "long";
  const profitColor = "#26a69a";
  const lossColor = "#ef5350";
  const profitFill = `${profitColor}26`;
  const lossFill = `${lossColor}26`;
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

  const left = Math.min(xA, xB);
  const right = Math.max(xA, xB);

  // Profit/loss zones depend on direction
  const profitY1 = Math.min(yEntry, yTarget);
  const profitY2 = Math.max(yEntry, yTarget);
  const lossY1 = Math.min(yEntry, yStop);
  const lossY2 = Math.max(yEntry, yStop);

  // Risk:Reward
  const risk = Math.abs(drawing.entry - drawing.stop);
  const reward = Math.abs(drawing.target - drawing.entry);
  const rr = risk === 0 ? 0 : reward / risk;
  const rrLabel = `RR ${rr.toFixed(2)}`;

  return (
    <g>
      {/* Profit zone */}
      <rect
        x={left}
        y={profitY1}
        width={right - left}
        height={profitY2 - profitY1}
        fill={profitFill}
        stroke="none"
        style={{ pointerEvents: "all", cursor: "pointer" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />
      {/* Loss zone */}
      <rect
        x={left}
        y={lossY1}
        width={right - left}
        height={lossY2 - lossY1}
        fill={lossFill}
        stroke="none"
        style={{ pointerEvents: "all", cursor: "pointer" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />
      {/* Entry, stop, target lines */}
      <line x1={left} x2={right} y1={yEntry} y2={yEntry} stroke="#d1d4dc" strokeWidth={1} style={{ pointerEvents: "none" }} />
      <line x1={left} x2={right} y1={yStop} y2={yStop} stroke={lossColor} strokeWidth={1} strokeDasharray="3,3" style={{ pointerEvents: "none" }} />
      <line x1={left} x2={right} y1={yTarget} y2={yTarget} stroke={profitColor} strokeWidth={1} strokeDasharray="3,3" style={{ pointerEvents: "none" }} />

      {/* Labels */}
      <text x={left + 6} y={yEntry - 3} fill="#d1d4dc" fontSize={10} fontFamily="var(--font-mono), monospace" style={{ pointerEvents: "none" }}>
        {`Entry  ${formatPrice(drawing.entry)}`}
      </text>
      <text x={left + 6} y={yTarget - 3} fill={profitColor} fontSize={10} fontFamily="var(--font-mono), monospace" style={{ pointerEvents: "none" }}>
        {`Target  ${formatPrice(drawing.target)}  · ${rrLabel}`}
      </text>
      <text x={left + 6} y={yStop - 3} fill={lossColor} fontSize={10} fontFamily="var(--font-mono), monospace" style={{ pointerEvents: "none" }}>
        {`Stop  ${formatPrice(drawing.stop)}`}
      </text>

      {/* Direction badge */}
      <rect x={right - 50} y={yEntry - 8} width={44} height={16} fill={isLong ? profitColor : lossColor} rx={2} style={{ pointerEvents: "none" }} />
      <text x={right - 28} y={yEntry + 3} textAnchor="middle" fill="#ffffff" fontSize={10} fontFamily="var(--font-mono), monospace" style={{ pointerEvents: "none" }}>
        {isLong ? "LONG" : "SHORT"}
      </text>

      {selected && (
        <>
          <DrawHandle x={(left + right) / 2} y={yEntry} color="#d1d4dc" selected onMouseDown={makeYDrag("entry")} />
          <DrawHandle x={(left + right) / 2} y={yStop} color={lossColor} selected onMouseDown={makeYDrag("stop")} />
          <DrawHandle x={(left + right) / 2} y={yTarget} color={profitColor} selected onMouseDown={makeYDrag("target")} />
        </>
      )}
    </g>
  );
}
