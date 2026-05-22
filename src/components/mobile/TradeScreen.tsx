"use client";

import { OrderPanel } from "@/components/trading/OrderPanel/OrderPanel";
import { useTradingStore } from "@/lib/store/trading-store";
import { useChartStore } from "@/lib/store/chart-store";
import { useEffect, useMemo } from "react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

/**
 * Mobile Trade tab — combined view with the order form on top and the user's
 * positions + open orders below, all in one vertical scroll.
 *
 * Reuses <OrderPanel /> (the existing sidebar form) so trading parity with
 * desktop comes "for free". The form internally handles credentials and shows
 * the API-key gate when not connected.
 */
export function TradeScreen() {
  const apiKey = useTradingStore((s) => s.apiKey);
  const apiSecret = useTradingStore((s) => s.apiSecret);
  const symbol = useChartStore((s) => s.symbol);
  const positions = useTradingStore((s) => s.positions);
  const orders = useTradingStore((s) => s.orders);
  const fetchPositions = useTradingStore((s) => s.fetchPositions);
  const fetchOrders = useTradingStore((s) => s.fetchOrders);
  const fetchBalance = useTradingStore((s) => s.fetchBalance);
  const balance = useTradingStore((s) => s.balance);
  const closePosition = useTradingStore((s) => s.closePosition);
  const cancelOrder = useTradingStore((s) => s.cancelOrder);

  const connected = !!apiKey && !!apiSecret;

  useEffect(() => {
    if (!connected) return;
    void fetchBalance(symbol);
    void fetchPositions(symbol);
    void fetchOrders(symbol);
    const t = setInterval(() => {
      void fetchBalance(symbol);
      void fetchPositions(symbol);
      void fetchOrders(symbol);
    }, 5000);
    return () => clearInterval(t);
  }, [connected, symbol, fetchBalance, fetchPositions, fetchOrders]);

  const activePositions = useMemo(
    () => positions.filter((p) => p.positionAmt !== 0),
    [positions],
  );
  const activeOrders = useMemo(
    () => orders.filter((o) => o.status === "NEW" || o.status === "PARTIALLY_FILLED"),
    [orders],
  );
  const totalEquity = balance.reduce((acc, b) => acc + b.free + b.locked, 0);
  const unrealizedPnL = activePositions.reduce((acc, p) => acc + p.unrealizedProfit, 0);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Stats */}
      {connected && (
        <div className="grid shrink-0 grid-cols-3 gap-2 border-b border-tv-border bg-tv-panel px-3 py-2 text-[11px]">
          <Stat label="Equity" value={totalEquity.toFixed(2)} />
          <Stat
            label="uPnL"
            value={unrealizedPnL.toFixed(2)}
            valueClass={unrealizedPnL >= 0 ? "text-tv-green" : "text-tv-red"}
          />
          <Stat label="Open" value={`${activePositions.length} pos · ${activeOrders.length} ord`} />
        </div>
      )}

      {/* Order form */}
      <div className="shrink-0 border-b border-tv-border">
        <OrderPanel />
      </div>

      {/* Positions */}
      {connected && (
        <Section title="Positions" emptyMessage="No open positions">
          {activePositions.map((p) => {
            const isLong = p.positionAmt > 0;
            return (
              <div
                key={`${p.symbol}-${p.side}`}
                className="flex items-center justify-between border-b border-tv-border/60 px-3 py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">
                    {p.symbol}{" "}
                    <span className={cn(
                      "rounded px-1 text-[9px]",
                      isLong ? "bg-tv-blue/15 text-tv-blue" : "bg-tv-red/15 text-tv-red",
                    )}>
                      {isLong ? "LONG" : "SHORT"}
                    </span>
                  </span>
                  <span className="font-mono text-[10px] text-tv-text-muted tabular-nums">
                    {Math.abs(p.positionAmt)} @ {formatPrice(p.entryPrice)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "font-mono text-xs tabular-nums",
                    p.unrealizedProfit >= 0 ? "text-tv-green" : "text-tv-red",
                  )}>
                    {p.unrealizedProfit >= 0 ? "+" : ""}{p.unrealizedProfit.toFixed(2)}
                  </span>
                  <button
                    onClick={() => void closePosition(symbol, p)}
                    aria-label="Close position"
                    className="rounded p-1 text-tv-text-muted active:bg-tv-red/15 active:text-tv-red"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {/* Orders */}
      {connected && (
        <Section title="Open Orders" emptyMessage="No pending orders">
          {activeOrders.map((o) => (
            <div
              key={o.orderId}
              className="flex items-center justify-between border-b border-tv-border/60 px-3 py-2"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">
                  {o.symbol}{" "}
                  <span className={cn(
                    "rounded px-1 text-[9px]",
                    o.side === "BUY" ? "bg-tv-blue/15 text-tv-blue" : "bg-tv-red/15 text-tv-red",
                  )}>
                    {o.side}
                  </span>
                </span>
                <span className="font-mono text-[10px] text-tv-text-muted tabular-nums">
                  {o.type.replace(/_/g, " ")} · {o.origQty} @{" "}
                  {o.stopPrice ? formatPrice(o.stopPrice) : o.price > 0 ? formatPrice(o.price) : "MKT"}
                  {o.reduceOnly && " · reduce-only"}
                </span>
              </div>
              <button
                onClick={() => void cancelOrder(symbol, o.orderId)}
                aria-label="Cancel order"
                className="rounded p-1 text-tv-text-muted active:bg-tv-red/15 active:text-tv-red"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wider text-tv-text-muted">{label}</span>
      <span className={cn("font-mono text-xs tabular-nums", valueClass ?? "text-tv-text")}>
        {value}
      </span>
    </div>
  );
}

function Section({
  title, emptyMessage, children,
}: { title: string; emptyMessage: string; children: React.ReactNode }) {
  const childArr = Array.isArray(children) ? children : [children];
  const empty = childArr.flat().filter(Boolean).length === 0;
  return (
    <section>
      <h3 className="bg-tv-panel/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
        {title}
      </h3>
      {empty ? (
        <p className="px-3 py-3 text-xs text-tv-text-muted">{emptyMessage}</p>
      ) : (
        <div>{children}</div>
      )}
    </section>
  );
}
