"use client";

import { useEffect } from "react";
import { useTradingStore } from "@/lib/store/trading-store";
import { cn } from "@/lib/utils";

export function PositionsList({ symbol }: { symbol: string }) {
  const positions = useTradingStore((s) => s.positions);
  const fetchPositions = useTradingStore((s) => s.fetchPositions);

  useEffect(() => {
    void fetchPositions(symbol);
    const t = setInterval(() => void fetchPositions(symbol), 5000);
    return () => clearInterval(t);
  }, [symbol, fetchPositions]);

  const active = positions.filter((p) => p.positionAmt !== 0);
  if (active.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-tv-text-muted">
        <span>Positions</span>
        <span>{active.length}</span>
      </div>
      <div className="space-y-0.5">
        {active.map((p) => {
          const isLong = p.positionAmt > 0;
          const pnlColor = p.unrealizedProfit >= 0 ? "text-tv-green" : "text-tv-red";
          return (
            <div key={p.symbol + p.side} className="flex items-center justify-between rounded bg-tv-bg/40 px-2 py-1 text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  "rounded px-1 py-0.5 font-bold uppercase",
                  isLong ? "bg-tv-blue/20 text-tv-blue" : "bg-tv-red/20 text-tv-red",
                )}>
                  {isLong ? "LONG" : "SHORT"}
                </span>
                <span className="font-mono tabular-nums text-tv-text">
                  {Math.abs(p.positionAmt).toFixed(4)}
                </span>
                <span className="text-tv-text-muted">@</span>
                <span className="font-mono tabular-nums text-tv-text">
                  {p.entryPrice.toFixed(2)}
                </span>
              </div>
              <span className={cn("font-mono font-semibold tabular-nums", pnlColor)}>
                {p.unrealizedProfit >= 0 ? "+" : ""}
                {p.unrealizedProfit.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
