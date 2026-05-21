"use client";

import { useRef, useState } from "react";
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
import { xToTime, timeframeToSeconds } from "@/lib/chart/coords";
import { useChartStore } from "@/lib/store/chart-store";
import { candlesRef as globalCandlesRef } from "@/lib/chart/candles-ref";

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

/** Tiny price pill at the right edge of a horizontal line. */
function PricePill({
  x, y, text, color,
}: {
  x: number; y: number; text: string; color: string;
}) {
  const w = text.length * 5.8 + 12;
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={x - w - 2} y={y - 8} width={w} height={15} fill={color} rx={2} opacity={0.85} />
      <text
        x={x - w / 2 - 2} y={y + 3}
        textAnchor="middle"
        fill="#fff" fontSize={9}
        fontFamily="var(--font-mono), monospace"
      >
        {text}
      </text>
    </g>
  );
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

  const profitColor = drawing.targetColor ?? "#26a69a";
  const lossColor = drawing.stopColor ?? "#ef5350";
  const profitFill = `${profitColor}20`;
  const lossFill = `${lossColor}20`;
  const entryColor = drawing.color ?? "#d1d4dc";

  const [hovered, setHovered] = useState(false);

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
      document.body.style.cursor = "ns-resize";
    };
  }

  function onRightHandleDrag(e: React.MouseEvent) {
    if (!chart || !container) return;
    e.preventDefault();
    e.stopPropagation();
    snap();
    const intervalSec = timeframeToSeconds(useChartStore.getState().timeframe);
    function onMove(ev: MouseEvent) {
      const rect = container!.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const t = xToTime(chart!, x, globalCandlesRef.current, intervalSec);
      if (t === null) return;
      updateLive(drawing.id, { timeB: t } as Partial<Drawing>);
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      commitEnd();
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "ew-resize";
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
  const zoneWidth = right - left;

  const profitY1 = Math.min(yEntry, yTarget);
  const profitY2 = Math.max(yEntry, yTarget);
  const lossY1 = Math.min(yEntry, yStop);
  const lossY2 = Math.max(yEntry, yStop);

  const risk = Math.abs(drawing.entry - drawing.stop);
  const reward = Math.abs(drawing.target - drawing.entry);
  const rr = risk === 0 ? 0 : reward / risk;
  const pctProfit = drawing.entry === 0 ? 0 : (reward / Math.abs(drawing.entry)) * 100;
  const pctLoss = drawing.entry === 0 ? 0 : (risk / Math.abs(drawing.entry)) * 100;

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

  // Zone centers for text
  const profitCenterY = (profitY1 + profitY2) / 2;
  const lossCenterY = (lossY1 + lossY2) / 2;
  const textX = left + zoneWidth / 2;

  const profitZoneH = profitY2 - profitY1;
  const lossZoneH = lossY2 - lossY1;

  // Bounding box that covers the full drawing + handle radius (8px) so
  // moving the cursor onto a handle doesn't trigger onMouseLeave.
  const handleR = 8;
  const boundTop = Math.min(profitY1, lossY1) - handleR;
  const boundBottom = Math.max(profitY2, lossY2) + handleR;
  const boundLeft = left - handleR;

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Invisible bounding rect — sole hover detector for the whole drawing */}
      <rect
        x={boundLeft} y={boundTop}
        width={zoneWidth + handleR * 2} height={boundBottom - boundTop}
        fill="transparent"
        style={{ pointerEvents: "all", cursor: zoneCursor }}
        onMouseDown={onZoneMouseDown}
        onDoubleClick={(e) => { e.stopPropagation(); onEdit(); }}
      />
      {/* Profit zone */}
      <rect
        x={left} y={profitY1} width={zoneWidth} height={profitZoneH}
        fill={profitFill}
        style={{ pointerEvents: "none" }}
      />
      {/* Loss zone */}
      <rect
        x={left} y={lossY1} width={zoneWidth} height={lossZoneH}
        fill={lossFill}
        style={{ pointerEvents: "none" }}
      />

      {/* Entry line */}
      <line
        x1={left} x2={right} y1={yEntry} y2={yEntry}
        stroke={entryColor} strokeWidth={drawing.lineWidth ?? 1.5}
        style={{ pointerEvents: "none" }}
      />

      {/* Price pills on the right edge — only when selected */}
      {selected && (
        <>
          <PricePill x={right} y={yEntry} text={formatPrice(drawing.entry)} color={entryColor} />
          <PricePill x={right} y={yStop} text={formatPrice(drawing.stop)} color={lossColor} />
          <PricePill x={right} y={yTarget} text={formatPrice(drawing.target)} color={profitColor} />
        </>
      )}

      {/* Stats text inside zones — only when selected and zone is tall enough */}
      {selected && profitZoneH > 28 && (
        <g style={{ pointerEvents: "none" }}>
          <text
            x={textX} y={profitCenterY + (profitZoneH > 52 ? -7 : 4)}
            textAnchor="middle" fill={profitColor}
            fontSize={11} fontWeight="600"
            fontFamily="var(--font-mono), monospace"
            opacity={0.9}
          >
            {isLong ? "+" : "-"}{pctProfit.toFixed(2)}%
          </text>
          {profitZoneH > 52 && (
            <text
              x={textX} y={profitCenterY + 10}
              textAnchor="middle" fill={profitColor}
              fontSize={9} opacity={0.55}
              fontFamily="var(--font-mono), monospace"
            >
              RR {rr.toFixed(2)}
            </text>
          )}
        </g>
      )}

      {selected && lossZoneH > 28 && (
        <g style={{ pointerEvents: "none" }}>
          <text
            x={textX} y={lossCenterY + 4}
            textAnchor="middle" fill={lossColor}
            fontSize={11} fontWeight="600"
            fontFamily="var(--font-mono), monospace"
            opacity={0.9}
          >
            {isLong ? "-" : "+"}{pctLoss.toFixed(2)}%
          </text>
        </g>
      )}

      {/* Handles — visible on hover or when selected */}
      {(hovered || selected) && (
        <>
          <DrawHandle x={left} y={yEntry} color={entryColor} selected={selected} onMouseDown={makeYDrag("entry")} />
          <DrawHandle x={left} y={yStop} color={lossColor} selected={selected} onMouseDown={makeYDrag("stop")} />
          <DrawHandle x={left} y={yTarget} color={profitColor} selected={selected} onMouseDown={makeYDrag("target")} />
          <DrawHandle
            x={xB}
            y={(Math.min(profitY1, lossY1) + Math.max(profitY2, lossY2)) / 2}
            color={entryColor}
            selected={selected}
            onMouseDown={onRightHandleDrag}
          />
        </>
      )}
    </g>
  );
}
