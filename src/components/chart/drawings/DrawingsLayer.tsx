"use client";

import { useEffect, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import type { Drawing } from "@/lib/drawings/types";
import { HLineDraw } from "./HLineDraw";

interface Props {
  symbol: string;
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
  width: number;
  height: number;
  /** Bumped whenever the chart pans/zooms so we re-render pixel coords */
  renderTick: number;
}

export function DrawingsLayer({
  symbol,
  chart,
  candleSeries,
  width,
  height,
  renderTick,
}: Props) {
  const drawings = useDrawingsStore((s) => s.drawings);
  const selectedId = useDrawingsStore((s) => s.selectedId);
  const setSelected = useDrawingsStore((s) => s.setSelected);

  // Force re-render when symbol or renderTick changes
  const [, setTick] = useState(0);
  useEffect(() => {
    setTick((t) => t + 1);
  }, [renderTick, symbol]);

  if (!chart || !candleSeries) return null;

  const visible = drawings.filter((d) => d.symbol === symbol);

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      style={{ overflow: "visible" }}
    >
      {visible.map((d) => renderDrawing(d, candleSeries, width, height, selectedId === d.id, () => setSelected(d.id)))}
    </svg>
  );
}

function renderDrawing(
  d: Drawing,
  series: ISeriesApi<"Candlestick">,
  width: number,
  height: number,
  selected: boolean,
  onSelect: () => void,
) {
  switch (d.kind) {
    case "hline": {
      const y = series.priceToCoordinate(d.price);
      if (y === null) return null;
      return (
        <HLineDraw
          key={d.id}
          drawing={d}
          y={y}
          width={width}
          selected={selected}
          onSelect={onSelect}
        />
      );
    }
    default:
      // Other kinds will be added in later phases
      void height;
      return null;
  }
}
