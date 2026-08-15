"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Maximize2, Minimize2, Pencil, X } from "lucide-react";
import { useTradingStore } from "@/lib/store/trading-store";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import type { Order, Position } from "@/lib/binance/trading-types";

/**
 * Docked bottom panel with positions / orders / account info, mirroring the
 * Bybit/TradingView trading bottom panel. Collapsible with expand button.
 */

type Tab = "positions" | "orders" | "history" | "summary" | "notifications";
type OrderFilter = "all" | "working" | "inactive" | "filled" | "cancelled" | "rejected";

export function PositionsPanel() {
  const apiKey = useTradingStore((s) => s.apiKey);
  const apiSecret = useTradingStore((s) => s.apiSecret);
  const testnet = useTradingStore((s) => s.testnet);
  const exchange = useTradingStore((s) => s.exchange);
  const positions = useTradingStore((s) => s.positions);
  const orders = useTradingStore((s) => s.orders);
  const balance = useTradingStore((s) => s.balance);
  const fetchBalance = useTradingStore((s) => s.fetchBalance);
  const fetchOrders = useTradingStore((s) => s.fetchOrders);
  const fetchPositions = useTradingStore((s) => s.fetchPositions);
  const symbol = useChartStore((s) => s.symbol);

  const [collapsed, setCollapsed] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [tab, setTab] = useState<Tab>("positions");

  // Periodic refresh while expanded so the table stays accurate.
  useEffect(() => {
    if (collapsed || !apiKey || !apiSecret) return;
    void fetchBalance(symbol);
    void fetchOrders(symbol);
    void fetchPositions(symbol);
    const t = setInterval(() => {
      void fetchBalance(symbol);
      void fetchOrders(symbol);
      void fetchPositions(symbol);
    }, 5000);
    return () => clearInterval(t);
  }, [collapsed, apiKey, apiSecret, symbol, fetchBalance, fetchOrders, fetchPositions]);

  const totalEquity = useMemo(() => {
    return balance.reduce((acc, b) => acc + b.free + b.locked, 0);
  }, [balance]);
  const unrealizedPnL = useMemo(
    () => positions.reduce((acc, p) => acc + p.unrealizedProfit, 0),
    [positions],
  );
  const marginBalance = useMemo(() => totalEquity + unrealizedPnL, [totalEquity, unrealizedPnL]);

  const activePositions = positions.filter((p) => p.positionAmt !== 0);
  const positionsCount = activePositions.length;
  const ordersCount = orders.length;

  if (!apiKey || !apiSecret) return null;

  return (
    <div
      className={cn(
        "flex flex-col border-t border-tv-border bg-tv-panel text-tv-text",
        fullscreen ? "absolute inset-0 z-40" : "",
      )}
      style={fullscreen ? {} : { maxHeight: collapsed ? 32 : "45vh", minHeight: 32 }}
    >
      {/* Title bar */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex h-8 shrink-0 items-center gap-2 border-b border-tv-border px-3 text-[11px] font-semibold transition-colors hover:bg-tv-panel-hover"
      >
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-tv-green" />
          Trading Account
        </span>
        {positionsCount > 0 && (
          <span className="rounded bg-tv-blue/20 px-1.5 py-0.5 text-[9px] font-bold text-tv-blue">
            {positionsCount} pos
          </span>
        )}
        {ordersCount > 0 && (
          <span className="rounded bg-tv-yellow/20 px-1.5 py-0.5 text-[9px] font-bold text-tv-yellow">
            {ordersCount} orders
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {!collapsed && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setFullscreen((f) => !f);
              }}
              className="rounded p-1 text-tv-text-muted hover:bg-tv-bg hover:text-tv-text"
              role="button"
            >
              {fullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </span>
          )}
          {collapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>

      {!collapsed && (
        <>
          {/* Stats strip */}
          <div className="flex items-center gap-6 border-b border-tv-border px-4 py-2 text-[11px]">
            <Stat label="Total Equity (USD)" value={totalEquity.toFixed(2)} />
            <Stat label="Margin Balance (USD)" value={marginBalance.toFixed(2)} />
            <Stat
              label="Unrealized PnL (USD)"
              value={unrealizedPnL.toFixed(2)}
              valueClass={unrealizedPnL >= 0 ? "text-tv-green" : "text-tv-red"}
            />
            <span className="ml-auto text-[9px] uppercase tracking-wider text-tv-text-muted">
              {exchange} · {testnet ? "Testnet" : "Mainnet"}
            </span>
          </div>

          {/* Tabs */}
          <div className="flex shrink-0 border-b border-tv-border">
            <TabBtn active={tab === "positions"} onClick={() => setTab("positions")}>
              Positions {positionsCount > 0 && <Badge n={positionsCount} />}
            </TabBtn>
            <TabBtn active={tab === "orders"} onClick={() => setTab("orders")}>
              Orders {ordersCount > 0 && <Badge n={ordersCount} />}
            </TabBtn>
            <TabBtn active={tab === "history"} onClick={() => setTab("history")}>
              Order history
            </TabBtn>
            <TabBtn active={tab === "summary"} onClick={() => setTab("summary")}>
              Account summary
            </TabBtn>
            <TabBtn active={tab === "notifications"} onClick={() => setTab("notifications")}>
              Notifications log
            </TabBtn>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto">
            {tab === "positions" && <PositionsTable positions={activePositions} orders={orders} symbol={symbol} />}
            {tab === "orders" && <OrdersTable orders={orders} symbol={symbol} />}
            {tab === "history" && <Stub message="Order history not yet implemented." />}
            {tab === "summary" && <AccountSummary balance={balance} positions={positions} />}
            {tab === "notifications" && <Stub message="Notifications log not yet implemented." />}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── helpers ─── */

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

function Badge({ n }: { n: number }) {
  return <span className="ml-1 rounded bg-tv-blue/20 px-1 text-[9px] font-bold text-tv-blue">{n}</span>;
}

function TabBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "border-b-2 px-3 py-1.5 text-[11px] font-medium transition-colors",
        active
          ? "border-tv-blue text-tv-text"
          : "border-transparent text-tv-text-muted hover:text-tv-text",
      )}
    >
      {children}
    </button>
  );
}

function Stub({ message }: { message: string }) {
  return (
    <div className="flex h-32 items-center justify-center text-xs text-tv-text-muted">
      {message}
    </div>
  );
}

/* ───────────────────────── Positions table ───────────────────────── */

interface TpSlMatch { tp: number | null; sl: number | null }

function matchTpSl(symbol: string, position: Position, orders: Order[]): TpSlMatch {
  const closeSide = position.positionAmt > 0 ? "SELL" : "BUY";
  const cleanedSym = symbol.replace(/\.P$/, "");
  const tpOrder = orders.find(
    (o) =>
      o.symbol === cleanedSym &&
      o.side === closeSide &&
      o.reduceOnly &&
      (o.type === "TAKE_PROFIT_MARKET" || o.type === "TAKE_PROFIT"),
  );
  const slOrder = orders.find(
    (o) =>
      o.symbol === cleanedSym &&
      o.side === closeSide &&
      o.reduceOnly &&
      (o.type === "STOP_MARKET" || o.type === "STOP" || o.type === "STOP_LIMIT"),
  );
  return {
    tp: tpOrder?.stopPrice ?? null,
    sl: slOrder?.stopPrice ?? null,
  };
}

function PositionsTable({
  positions, orders, symbol,
}: { positions: Position[]; orders: Order[]; symbol: string }) {
  const closePosition = useTradingStore((s) => s.closePosition);
  const [editing, setEditing] = useState<string | null>(null);

  if (positions.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-tv-text-muted">
        There are no open positions in your trading account yet
      </div>
    );
  }

  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-tv-border text-left text-[10px] uppercase tracking-wider text-tv-text-muted">
          <th className="px-3 py-1.5">Symbol</th>
          <th className="px-3 py-1.5">Side</th>
          <th className="px-3 py-1.5">Qty</th>
          <th className="px-3 py-1.5">Avg Fill Price</th>
          <th className="px-3 py-1.5">Take Profit</th>
          <th className="px-3 py-1.5">Stop Loss</th>
          <th className="px-3 py-1.5 text-right">Profit</th>
          <th className="px-3 py-1.5">Liq. Price</th>
          <th className="px-3 py-1.5">Value</th>
          <th className="px-3 py-1.5">IM</th>
          <th className="px-3 py-1.5">MM</th>
          <th className="px-3 py-1.5 text-right">PnL%</th>
          <th className="px-3 py-1.5">Margin Mode</th>
          <th className="px-3 py-1.5"></th>
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => {
          const { tp, sl } = matchTpSl(symbol, p, orders);
          const isLong = p.positionAmt > 0;
          const pnlColor = p.unrealizedProfit >= 0 ? "text-tv-green" : "text-tv-red";
          const rowKey = `${p.symbol}-${p.side}`;
          return (
            <tr key={rowKey} className="border-b border-tv-border/50 hover:bg-tv-panel-hover">
              <td className="px-3 py-1.5 font-semibold">{p.symbol}.P</td>
              <td className={cn("px-3 py-1.5 font-semibold", isLong ? "text-tv-blue" : "text-tv-red")}>
                {isLong ? "Long" : "Short"}
              </td>
              <td className="px-3 py-1.5 font-mono tabular-nums">
                {Math.abs(p.positionAmt)}
              </td>
              <td className="px-3 py-1.5 font-mono tabular-nums">{formatPrice(p.entryPrice)}</td>
              <td className="px-3 py-1.5 font-mono tabular-nums text-tv-green">
                {tp !== null ? formatPrice(tp) : "—"}
              </td>
              <td className="px-3 py-1.5 font-mono tabular-nums text-tv-yellow">
                {sl !== null ? formatPrice(sl) : "—"}
              </td>
              <td className={cn("px-3 py-1.5 text-right font-mono tabular-nums", pnlColor)}>
                {p.unrealizedProfit >= 0 ? "+" : ""}
                {p.unrealizedProfit.toFixed(2)} USD
              </td>
              <td className="px-3 py-1.5 font-mono tabular-nums">
                {p.liquidationPrice > 0 ? formatPrice(p.liquidationPrice) : "—"}
              </td>
              <td className="px-3 py-1.5 font-mono tabular-nums">{p.notional.toFixed(2)}</td>
              <td className="px-3 py-1.5 font-mono tabular-nums">{p.initialMargin.toFixed(2)}</td>
              <td className="px-3 py-1.5 font-mono tabular-nums">{p.maintMargin.toFixed(2)}</td>
              <td className={cn("px-3 py-1.5 text-right font-mono tabular-nums", pnlColor)}>
                {p.percentage >= 0 ? "+" : ""}
                {p.percentage.toFixed(2)}%
              </td>
              <td className="px-3 py-1.5 capitalize">{p.marginType}</td>
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(rowKey)}
                    title="Set TP / SL"
                    className="rounded p-0.5 text-tv-text-muted hover:bg-tv-bg hover:text-tv-text"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => void closePosition(symbol, p)}
                    title="Close position (Market reduce-only)"
                    className="rounded p-0.5 text-tv-text-muted hover:bg-tv-red/15 hover:text-tv-red"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {editing === rowKey && (
                  <EditTpSlPopover
                    position={p}
                    symbol={symbol}
                    currentTp={tp}
                    currentSl={sl}
                    onClose={() => setEditing(null)}
                  />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function EditTpSlPopover({
  position, symbol, currentTp, currentSl, onClose,
}: {
  position: Position;
  symbol: string;
  currentTp: number | null;
  currentSl: number | null;
  onClose: () => void;
}) {
  const setPositionTpSl = useTradingStore((s) => s.setPositionTpSl);
  const [tp, setTp] = useState(currentTp ? String(currentTp) : "");
  const [sl, setSl] = useState(currentSl ? String(currentSl) : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const tpNum = tp.trim() === "" ? null : parseFloat(tp);
    const slNum = sl.trim() === "" ? null : parseFloat(sl);
    await setPositionTpSl(symbol, position, {
      tp: isFinite(tpNum as number) || tpNum === null ? tpNum : undefined,
      sl: isFinite(slNum as number) || slNum === null ? slNum : undefined,
    });
    setSaving(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-72 space-y-3 rounded-lg border border-tv-border bg-tv-panel p-4"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Set TP / SL — {position.symbol}</span>
          <button onClick={onClose} className="text-tv-text-muted hover:text-tv-text">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-tv-text-muted">Take Profit (price)</label>
          <input
            type="number"
            step="any"
            value={tp}
            onChange={(e) => setTp(e.target.value)}
            placeholder="empty = remove"
            className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 font-mono text-xs tabular-nums focus:border-tv-blue"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-tv-text-muted">Stop Loss (price)</label>
          <input
            type="number"
            step="any"
            value={sl}
            onChange={(e) => setSl(e.target.value)}
            placeholder="empty = remove"
            className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 font-mono text-xs tabular-nums focus:border-tv-blue"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1 text-xs text-tv-text-muted hover:bg-tv-panel-hover"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded bg-tv-blue px-3 py-1 text-xs font-semibold text-white hover:bg-tv-blue/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Orders table ───────────────────────── */

function OrdersTable({ orders, symbol }: { orders: Order[]; symbol: string }) {
  const cancelOrder = useTradingStore((s) => s.cancelOrder);
  const [filter, setFilter] = useState<OrderFilter>("all");

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (filter === "all") return true;
      if (filter === "working") return o.status === "NEW" || o.status === "PARTIALLY_FILLED";
      if (filter === "inactive") return o.status === "NEW" && o.type.includes("STOP");
      if (filter === "filled") return o.status === "FILLED";
      if (filter === "cancelled") return o.status === "CANCELED" || o.status === "EXPIRED";
      if (filter === "rejected") return o.status === "REJECTED";
      return true;
    });
  }, [orders, filter]);

  const counts = useMemo(() => {
    const c: Record<OrderFilter, number> = {
      all: orders.length,
      working: orders.filter((o) => o.status === "NEW" || o.status === "PARTIALLY_FILLED").length,
      inactive: orders.filter((o) => o.status === "NEW" && o.type.includes("STOP")).length,
      filled: orders.filter((o) => o.status === "FILLED").length,
      cancelled: orders.filter((o) => o.status === "CANCELED" || o.status === "EXPIRED").length,
      rejected: orders.filter((o) => o.status === "REJECTED").length,
    };
    return c;
  }, [orders]);

  const filterTabs: { key: OrderFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "working", label: "Working" },
    { key: "inactive", label: "Inactive" },
    { key: "filled", label: "Filled" },
    { key: "cancelled", label: "Cancelled" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <div>
      <div className="flex border-b border-tv-border px-3">
        {filterTabs.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "border-b-2 px-3 py-1.5 text-[10px] font-medium transition-colors",
              filter === f.key
                ? "border-tv-blue text-tv-text"
                : "border-transparent text-tv-text-muted hover:text-tv-text",
            )}
          >
            {f.label}
            {counts[f.key] > 0 && (
              <span className="ml-1 text-tv-text-muted">{counts[f.key]}</span>
            )}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-xs text-tv-text-muted">
          No orders to show
        </div>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-tv-border text-left text-[10px] uppercase tracking-wider text-tv-text-muted">
              <th className="px-3 py-1.5">Symbol</th>
              <th className="px-3 py-1.5">Side</th>
              <th className="px-3 py-1.5">Type</th>
              <th className="px-3 py-1.5">Qty</th>
              <th className="px-3 py-1.5">Filled Qty</th>
              <th className="px-3 py-1.5">Limit Price</th>
              <th className="px-3 py-1.5">Stop Price</th>
              <th className="px-3 py-1.5">Reduce-Only</th>
              <th className="px-3 py-1.5">Status</th>
              <th className="px-3 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.orderId} className="border-b border-tv-border/50 hover:bg-tv-panel-hover">
                <td className="px-3 py-1.5 font-semibold">{o.symbol}</td>
                <td className={cn(
                  "px-3 py-1.5 font-semibold",
                  o.side === "BUY" ? "text-tv-blue" : "text-tv-red",
                )}>
                  {o.side === "BUY" ? "Buy" : "Sell"}
                </td>
                <td className="px-3 py-1.5 capitalize">{o.type.replace(/_/g, " ").toLowerCase()}</td>
                <td className="px-3 py-1.5 font-mono tabular-nums">{o.origQty}</td>
                <td className="px-3 py-1.5 font-mono tabular-nums">{o.executedQty}</td>
                <td className="px-3 py-1.5 font-mono tabular-nums">
                  {o.price > 0 ? formatPrice(o.price) : "—"}
                </td>
                <td className="px-3 py-1.5 font-mono tabular-nums">
                  {o.stopPrice ? formatPrice(o.stopPrice) : "—"}
                </td>
                <td className="px-3 py-1.5">{o.reduceOnly ? "Yes" : "—"}</td>
                <td className="px-3 py-1.5">
                  <span className={cn(
                    "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                    o.status === "FILLED" && "bg-tv-green/20 text-tv-green",
                    (o.status === "CANCELED" || o.status === "EXPIRED" || o.status === "REJECTED") && "bg-tv-red/15 text-tv-red",
                    (o.status === "NEW" || o.status === "PARTIALLY_FILLED") && "bg-tv-blue/15 text-tv-blue",
                  )}>
                    {o.status === "NEW" ? "Working" : o.status}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  {(o.status === "NEW" || o.status === "PARTIALLY_FILLED") && (
                    <button
                      onClick={() => void cancelOrder(symbol, o.orderId)}
                      title="Cancel order"
                      className="rounded p-0.5 text-tv-text-muted hover:bg-tv-red/15 hover:text-tv-red"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ───────────────────────── Account summary ───────────────────────── */

function AccountSummary({
  balance, positions,
}: { balance: { asset: string; free: number; locked: number }[]; positions: Position[] }) {
  return (
    <div className="grid gap-4 p-4 text-[11px] md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Balances
        </h3>
        <table className="w-full">
          <thead>
            <tr className="border-b border-tv-border text-left text-[10px] uppercase text-tv-text-muted">
              <th className="py-1">Asset</th>
              <th className="py-1 text-right">Free</th>
              <th className="py-1 text-right">Locked</th>
            </tr>
          </thead>
          <tbody>
            {balance.length === 0 && (
              <tr><td colSpan={3} className="py-2 text-tv-text-muted">No balances</td></tr>
            )}
            {balance.map((b) => (
              <tr key={b.asset} className="border-b border-tv-border/50">
                <td className="py-1 font-semibold">{b.asset}</td>
                <td className="py-1 text-right font-mono tabular-nums">{b.free.toFixed(4)}</td>
                <td className="py-1 text-right font-mono tabular-nums">{b.locked.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Active positions
        </h3>
        <p className="text-tv-text-muted">{positions.filter((p) => p.positionAmt !== 0).length} active</p>
      </div>
    </div>
  );
}
