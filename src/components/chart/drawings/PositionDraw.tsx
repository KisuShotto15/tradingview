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

/** Estimate SVG text box width given string and font size in px (monospace). */
function textBoxWidth(text: string, fontSize: number, padX = 8): number {
  return Math.max(text.length * fontSize * 0.62 + padX * 2, 60);
}

/** Rounded-rect label with colored fill and white text. */
function StatsBubble({
  x, y, w, h = 20, text, fill, textSize = 10, anchor = "start",
}: {
  x: number; y: number; w: number; h?: number;
  text: string; fill: string; textSize?: number; anchor?: "start" | "middle" | "end";
}) {
  const tx = anchor === "start" ? x + 7 : anchor === "end" ? x + w - 7 : x + w / 2;
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={x} y={y} width={w} height={h} fill={fill} rx={3} />
      <text
        x={tx} y={y + h / 2 + textSize * 0.38}
        textAnchor={anchor === "start" ? "start" : anchor === "end" ? "end" : "middle"}
        fill="#ffffff" fontSize={textSize}
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
  const profitFill = `${profitColor}26`;
  const lossFill = `${lossColor}26`;
  const entryColor = drawing.color ?? "#d1d4dc";

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

  // Outside stats bubbles
  const profitText = isLong
    ? `${formatPrice(drawing.target)}  (+${pctProfit.toFixed(2)}%)`
    : `${formatPrice(drawing.target)}  (-${pctProfit.toFixed(2)}%)`;
  const lossText = isLong
    ? `${formatPrice(drawing.stop)}  (-${pctLoss.toFixed(2)}%)`
    : `${formatPrice(drawing.stop)}  (+${pctLoss.toFixed(2)}%)`;

  const bubbleH = 22;
  const profitBubbleW = Math.min(textBoxWidth(profitText, 10), zoneWidth);
  const lossBubbleW = Math.min(textBoxWidth(lossText, 10), zoneWidth);

  // RR badge inside profit zone (center)
  const profitCenterY = (profitY1 + profitY2) / 2;
  const rrText = `${formatPrice(reward)}  ·  RR ${rr.toFixed(2)}`;
  const rrBubbleW = Math.min(textBoxWidth(rrText, 9), zoneWidth - 8);

  // 1:RR badge inside loss zone (center)
  const lossCenterY = (lossY1 + lossY2) / 2;
  const lossRrText = `${formatPrice(risk)}  ·  1 : ${rr.toFixed(2)}`;
  const lossRrBubbleW = Math.min(textBoxWidth(lossRrText, 9), zoneWidth - 8);

  return (
    <g>
      {/* Profit zone */}
      <rect
        x={left} y={profitY1} width={zoneWidth} height={profitY2 - profitY1}
        fill={profitFill}
        stroke={selected ? profitColor : "none"}
        strokeWidth={selected ? 0.5 : 0}
        style={{ pointerEvents: "all", cursor: zoneCursor }}
        onMouseDown={onZoneMouseDown}
        onDoubleClick={(e) => { e.stopPropagation(); onEdit(); }}
      />
      {/* Loss zone */}
      <rect
        x={left} y={lossY1} width={zoneWidth} height={lossY2 - lossY1}
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

      {/* Stop / Target dashed lines — when labels shown */}
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

      {/* LONG / SHORT badge at entry — always visible */}
      <rect
        x={right - 52} y={yEntry - 9} width={46} height={17}
        fill={isLong ? profitColor : lossColor} rx={2}
        style={{ pointerEvents: "none" }}
      />
      <text
        x={right - 29} y={yEntry + 3.5}
        textAnchor="middle" fill="#ffffff" fontSize={10}
        fontFamily="var(--font-mono), monospace" fontWeight={600}
        style={{ pointerEvents: "none" }}
      >
        {isLong ? "LONG" : "SHORT"}
      </text>

      {/* Entry price label at entry line */}
      {showLabels && (
        <text
          x={left + 6} y={yEntry - 5}
          fill={entryColor} fontSize={9.5}
          fontFamily="var(--font-mono), monospace"
          style={{ pointerEvents: "none" }}
        >
          {`Entry  ${formatPrice(drawing.entry)}`}
        </text>
      )}

      {/* Stats labels — outside zones + inside RR bubbles */}
      {showLabels && (
        <>
          {/* TOP bubble: profit stats — OUTSIDE the profit zone, above it */}
          <StatsBubble
            x={left} y={profitY1 - bubbleH - 3}
            w={profitBubbleW} h={bubbleH}
            text={profitText}
            fill={`${profitColor}cc`}
          />

          {/* BOTTOM bubble: loss stats — OUTSIDE the loss zone, below it */}
          <StatsBubble
            x={left} y={lossY2 + 3}
            w={lossBubbleW} h={bubbleH}
            text={lossText}
            fill={`${lossColor}99`}
          />

          {/* RR bubble inside profit zone (only if zone is tall enough) */}
          {profitY2 - profitY1 > 30 && (
            <StatsBubble
              x={(left + right) / 2 - rrBubbleW / 2}
              y={profitCenterY - 11}
              w={rrBubbleW} h={22}
              text={rrText}
              fill={`${profitColor}cc`}
              textSize={9}
              anchor="middle"
            />
          )}

          {/* Loss stats bubble inside loss zone */}
          {lossY2 - lossY1 > 30 && (
            <StatsBubble
              x={(left + right) / 2 - lossRrBubbleW / 2}
              y={lossCenterY - 11}
              w={lossRrBubbleW} h={22}
              text={lossRrText}
              fill={`${lossColor}88`}
              textSize={9}
              anchor="middle"
            />
          )}
        </>
      )}

      {selected && (
        <>
          <DrawHandle x={(left + right) / 2} y={yEntry} color={entryColor} selected onMouseDown={makeYDrag("entry")} />
          <DrawHandle x={(left + right) / 2} y={yStop} color={lossColor} selected onMouseDown={makeYDrag("stop")} />
          <DrawHandle x={(left + right) / 2} y={yTarget} color={profitColor} selected onMouseDown={makeYDrag("target")} />
          <DrawHandle x={xA} y={yEntry} color={entryColor} selected onMouseDown={makeYDrag("entry")} />
          <DrawHandle x={xB} y={yEntry} color={entryColor} selected onMouseDown={makeYDrag("entry")} />
        </>
      )}
    </g>
  );
}
