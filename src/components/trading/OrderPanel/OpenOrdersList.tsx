"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useTradingStore } from "@/lib/store/trading-store";
import { cn } from "@/lib/utils";

export function OpenOrdersList({ symbol }: { symbol: string }) {
  const orders = useTradingStore((s) => s.orders);
  const cancelOrder = useTradingStore((s) => s.cancelOrder);
  const fetchOrders = useTradingStore((s) => s.fetchOrders);

  useEffect(() => {
    void fetchOrders(symbol);
    const t = setInterval(() => void fetchOrders(symbol), 8000);
    return () => clearInterval(t);
  }, [symbol, fetchOrders]);

  if (orders.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-tv-text-muted">
        <span>Open orders</span>
        <span>{orders.length}</span>
      </div>
      <div className="space-y-0.5">
        {orders.map((o) => (
          <div key={o.orderId} className="flex items-center justify-between rounded bg-tv-bg/40 px-2 py-1 text-[10px]">
            <div className="flex items-center gap-1.5">
              <span className={cn(
                "rounded px-1 py-0.5 font-bold uppercase",
                o.side === "BUY" ? "bg-tv-blue/20 text-tv-blue" : "bg-tv-red/20 text-tv-red",
              )}>
                {o.side}
              </span>
              <span className="font-mono tabular-nums text-tv-text">
                {o.origQty}
              </span>
              <span className="text-tv-text-muted">@</span>
              <span className="font-mono tabular-nums text-tv-text">
                {o.stopPrice || o.price}
              </span>
              <span className="text-tv-text-muted">{o.type}</span>
            </div>
            <button
              onClick={() => void cancelOrder(symbol, o.orderId)}
              title="Cancel order"
              className="rounded p-0.5 text-tv-text-muted hover:bg-tv-red/15 hover:text-tv-red"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
