"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { useTradingStore } from "@/lib/store/trading-store";
import { useChartStore } from "@/lib/store/chart-store";
import { isPerp } from "@/lib/binance/rest";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
  container: HTMLElement | null;
  width: number;
  mainPaneHeight: number;
  renderTick: number;
}

interface DraggableLine {
  price: number;
  label: string;
  color: string;
  dashed: boolean;
  onDrag: (price: number) => void;
}

function OrderLine({
  y,
  width,
  label,
  color,
  dashed,
  onMouseDown,
}: {
  y: number;
  width: number;
  label: string;
  color: string;
  dashed: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  if (y < 0) return null;
  const labelW = Math.max(label.length * 6.5 + 10, 70);
  return (
    <g>
      {/* Hit area */}
      <line
        x1={0}
        x2={width}
        y1={y}
        y2={y}
        stroke="transparent"
        strokeWidth={10}
        style={{ pointerEvents: "stroke", cursor: "ns-resize" }}
        onMouseDown={onMouseDown}
      />
      {/* Visible line */}
      <line
        x1={0}
        x2={width}
        y1={y}
        y2={y}
        stroke={color}
        strokeWidth={1}
        strokeDasharray={dashed ? "6,4" : undefined}
        style={{ pointerEvents: "none" }}
      />
      {/* Label pill on right */}
      <g style={{ pointerEvents: "none" }}>
        <rect
          x={width - labelW - 4}
          y={y - 9}
          width={labelW}
          height={17}
          fill={color}
          rx={2}
        />
        <text
          x={width - labelW / 2 - 4}
          y={y + 3}
          fill="#fff"
          fontSize={9}
          fontFamily="var(--font-mono), monospace"
          textAnchor="middle"
        >
          {label}
        </text>
      </g>
      {/* Drag handle dot */}
      <circle
        cx={width - labelW - 10}
        cy={y}
        r={4}
        fill={color}
        style={{ pointerEvents: "none" }}
      />
    </g>
  );
}

export function OrderLinesLayer({
  chart,
  candleSeries,
  container,
  width,
  mainPaneHeight,
  renderTick,
}: Props) {
  const symbol = useChartStore((s) => s.symbol);
  const tradingPanelOpen = useTradingStore((s) => s.tradingPanelOpen);
  const form = useTradingStore((s) => s.form);
  const orders = useTradingStore((s) => s.orders);
  const updateForm = useTradingStore((s) => s.updateForm);

  // Force re-render on chart pan/zoom
  const [, setTick] = useState(0);
  useEffect(() => setTick((t) => t + 1), [renderTick]);

  const draggingRef = useRef<((price: number) => void) | null>(null);

  function startDrag(e: React.MouseEvent, onDrag: (price: number) => void) {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = onDrag;
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current || !candleSeries || !container) return;
      const rect = container.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const price = candleSeries.coordinateToPrice(relY);
      if (price !== null) draggingRef.current(price);
    }
    function onUp() {
      draggingRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [candleSeries, container]);

  if (!chart || !candleSeries) return null;

  const perp = isPerp(symbol);
  const hasEntry = form.type !== "MARKET" && parseFloat(form.price) > 0;
  const hasSL = perp && form.slEnabled && parseFloat(form.sl) > 0;
  const hasTP = perp && form.tpEnabled && parseFloat(form.tp) > 0;

  const previewLines: DraggableLine[] = [];

  if (tradingPanelOpen && hasEntry) {
    previewLines.push({
      price: parseFloat(form.price),
      label: `${form.side} @ ${formatPrice(parseFloat(form.price))}`,
      color: form.side === "BUY" ? "#2962ff" : "#ef5350",
      dashed: false,
      onDrag: (p) => updateForm({ price: p.toFixed(2) }),
    });
  }
  if (tradingPanelOpen && hasSL) {
    previewLines.push({
      price: parseFloat(form.sl),
      label: `SL ${formatPrice(parseFloat(form.sl))}`,
      color: "#ef5350",
      dashed: true,
      onDrag: (p) => updateForm({ sl: p.toFixed(2) }),
    });
  }
  if (tradingPanelOpen && hasTP) {
    previewLines.push({
      price: parseFloat(form.tp),
      label: `TP ${formatPrice(parseFloat(form.tp))}`,
      color: "#26a69a",
      dashed: true,
      onDrag: (p) => updateForm({ tp: p.toFixed(2) }),
    });
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      style={{ overflow: "visible" }}
    >
      <defs>
        <clipPath id="order-lines-clip">
          <rect x={0} y={0} width={width} height={mainPaneHeight} />
        </clipPath>
      </defs>
      <g clipPath="url(#order-lines-clip)" style={{ pointerEvents: "all" }}>
        {/* Preview lines (entry / SL / TP from form) */}
        {previewLines.map((line, i) => {
          const y = candleSeries.priceToCoordinate(line.price);
          if (y === null || y < 0 || y > mainPaneHeight) return null;
          return (
            <OrderLine
              key={`preview-${i}`}
              y={y}
              width={width}
              label={line.label}
              color={line.color}
              dashed={line.dashed}
              onMouseDown={(e) => startDrag(e, line.onDrag)}
            />
          );
        })}

        {/* Open limit order lines */}
        {orders.map((order) => {
          const price = order.stopPrice ?? order.price;
          if (!price || price <= 0) return null;
          const y = candleSeries.priceToCoordinate(price);
          if (y === null || y < 0 || y > mainPaneHeight) return null;
          const isStop = order.type.includes("STOP") || order.type.includes("TAKE_PROFIT");
          return (
            <OrderLine
              key={`order-${order.orderId}`}
              y={y}
              width={width}
              label={`${order.side === "BUY" ? "B" : "S"} ${order.type.replace(/_/g, " ")} ${formatPrice(price)}`}
              color={order.side === "BUY" ? "#2962ff" : "#ef5350"}
              dashed={isStop}
              onMouseDown={(e) => e.stopPropagation()}
            />
          );
        })}
      </g>
    </svg>
  );
}
