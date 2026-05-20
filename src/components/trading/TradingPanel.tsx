"use client";

import { useEffect, useState } from "react";
import { AlertCircle, KeyRound, RefreshCw, X } from "lucide-react";
import { useTradingStore } from "@/lib/store/trading-store";
import { useChartStore } from "@/lib/store/chart-store";
import { getBinanceWS } from "@/lib/binance/ws";
import { isPerp, cleanSym } from "@/lib/binance/rest";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApiKeyDialog } from "./ApiKeyDialog";
import type { OrderType, TimeInForce } from "@/lib/binance/trading-types";

const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: "MARKET", label: "Market" },
  { value: "LIMIT", label: "Limit" },
  { value: "STOP_MARKET", label: "Stop" },
  { value: "STOP_LIMIT", label: "Stop Limit" },
];

const TIF_OPTIONS: { value: TimeInForce; label: string }[] = [
  { value: "GTC", label: "Good Till Cancel" },
  { value: "IOC", label: "Immediate or Cancel" },
  { value: "FOK", label: "Fill or Kill" },
];

export function TradingPanel() {
  const symbol = useChartStore((s) => s.symbol);
  const {
    apiKey,
    apiSecret,
    testnet,
    isConnected,
    form,
    orders,
    positions,
    balance,
    isLoading,
    lastError,
    updateForm,
    placeOrder,
    cancelOrder,
    fetchBalance,
    fetchOrders,
    fetchPositions,
  } = useTradingStore();

  const [showApiDialog, setShowApiDialog] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [bidPrice, setBidPrice] = useState<number | null>(null);
  const [askPrice, setAskPrice] = useState<number | null>(null);
  const [orderResult, setOrderResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const perp = isPerp(symbol);
  const sym = cleanSym(symbol);

  // Subscribe to bookTicker for bid/ask
  useEffect(() => {
    const ws = getBinanceWS();
    const unsub = ws.subscribeBookTicker(symbol, (data) => {
      setBidPrice(data.bid);
      setAskPrice(data.ask);
    });
    return unsub;
  }, [symbol]);

  // Fetch data when symbol or credentials change
  useEffect(() => {
    if (!apiKey || !apiSecret) return;
    void fetchBalance(symbol);
    void fetchOrders(symbol);
    if (perp) void fetchPositions(symbol);
  }, [symbol, apiKey, apiSecret]);

  // Auto-fill price with ask (buy) or bid (sell) when switching type
  useEffect(() => {
    if (form.type === "MARKET") updateForm({ price: "" });
    else if (!form.price) {
      const price = form.side === "BUY" ? askPrice : bidPrice;
      if (price) updateForm({ price: String(price) });
    }
  }, [form.type, form.side]);

  async function submit(side: "BUY" | "SELL") {
    setOrderResult(null);
    updateForm({ side });
    const result = await placeOrder(symbol, { side });
    if (result.ok) {
      setOrderResult({ ok: true, msg: "Order placed successfully!" });
      setTimeout(() => setOrderResult(null), 3000);
    } else {
      setOrderResult({ ok: false, msg: result.error ?? "Order failed" });
    }
  }

  // Quote asset balance (USDT)
  const usdtBalance = balance.find((b) => b.asset === "USDT" || b.asset === "FDUSD");
  const quoteAsset = perp ? "USDT" : "USDT";
  const notional =
    form.price && form.quantity
      ? parseFloat(form.price) * parseFloat(form.quantity)
      : null;

  if (!apiKey || !apiSecret) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <KeyRound className="h-8 w-8 text-tv-text-dim" />
        <p className="text-center text-xs text-tv-text-muted">
          Connect your Binance API to start trading
        </p>
        <button
          onClick={() => setShowApiDialog(true)}
          className="rounded bg-tv-blue px-4 py-2 text-xs font-medium text-white hover:bg-tv-blue/80"
        >
          Connect Binance API
        </button>
        {showApiDialog && <ApiKeyDialog onClose={() => setShowApiDialog(false)} />}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col text-xs">
      {showApiDialog && <ApiKeyDialog onClose={() => setShowApiDialog(false)} />}

      {/* Header: bid/ask + network badge + settings */}
      <div className="flex items-center gap-1 border-b border-tv-border px-2 py-2">
        <button
          onClick={() => submit("SELL")}
          className="flex min-w-0 flex-1 flex-col rounded-sm bg-tv-red/15 px-2 py-1 text-left transition-colors hover:bg-tv-red/25"
        >
          <span className="text-[10px] font-semibold text-tv-red">Sell</span>
          <span className="tabular-nums text-tv-text">
            {bidPrice ? formatPrice(bidPrice) : "—"}
          </span>
        </button>

        <div className="flex flex-col items-center gap-0.5">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
              testnet
                ? "bg-yellow-500/20 text-yellow-400"
                : "bg-tv-green/20 text-tv-green",
            )}
          >
            {testnet ? "TEST" : "LIVE"}
          </span>
          <span className="text-[9px] text-tv-text-dim">{sym}</span>
        </div>

        <button
          onClick={() => submit("BUY")}
          className="flex min-w-0 flex-1 flex-col rounded-sm bg-tv-blue/15 px-2 py-1 text-right transition-colors hover:bg-tv-blue/25"
        >
          <span className="text-[10px] font-semibold text-tv-blue">Buy</span>
          <span className="tabular-nums text-tv-text">
            {askPrice ? formatPrice(askPrice) : "—"}
          </span>
        </button>
      </div>

      {/* Order type tabs */}
      <div className="flex border-b border-tv-border">
        {ORDER_TYPES.map((ot) => (
          <button
            key={ot.value}
            onClick={() => updateForm({ type: ot.value })}
            className={cn(
              "flex-1 py-2 text-[10px] font-medium transition-colors",
              form.type === ot.value
                ? "border-b-2 border-tv-blue text-tv-blue"
                : "text-tv-text-muted hover:text-tv-text",
            )}
          >
            {ot.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {/* Price input (hidden for MARKET) */}
        {form.type !== "MARKET" && form.type !== "STOP_MARKET" && (
          <div className="mb-3">
            <label className="mb-1 block text-[10px] text-tv-text-muted">Price</label>
            <div className="flex items-center gap-1 rounded border border-tv-border bg-tv-bg px-2 py-1.5">
              <input
                type="number"
                value={form.price}
                onChange={(e) => updateForm({ price: e.target.value })}
                placeholder="0.00"
                className="flex-1 bg-transparent text-xs text-tv-text outline-none"
              />
              <span className="text-[10px] text-tv-text-dim">{quoteAsset}</span>
            </div>
          </div>
        )}

        {/* Stop price for STOP_LIMIT / STOP_MARKET */}
        {(form.type === "STOP_LIMIT" || form.type === "STOP_MARKET") && (
          <div className="mb-3">
            <label className="mb-1 block text-[10px] text-tv-text-muted">Stop Price</label>
            <div className="flex items-center gap-1 rounded border border-tv-border bg-tv-bg px-2 py-1.5">
              <input
                type="number"
                value={form.sl}
                onChange={(e) => updateForm({ sl: e.target.value })}
                placeholder="0.00"
                className="flex-1 bg-transparent text-xs text-tv-text outline-none"
              />
              <span className="text-[10px] text-tv-text-dim">{quoteAsset}</span>
            </div>
          </div>
        )}

        {/* Quantity */}
        <div className="mb-3">
          <label className="mb-1 block text-[10px] text-tv-text-muted">
            Amount ({sym.replace("USDT", "")})
          </label>
          <div className="flex items-center gap-1 rounded border border-tv-border bg-tv-bg px-2 py-1.5">
            <input
              type="number"
              value={form.quantity}
              onChange={(e) => updateForm({ quantity: e.target.value })}
              placeholder="0.000"
              className="flex-1 bg-transparent text-xs text-tv-text outline-none"
            />
            <span className="text-[10px] text-tv-text-dim">{sym.replace("USDT", "")}</span>
          </div>
          {/* Quick % buttons */}
          <div className="mt-1.5 flex gap-1">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => {
                  if (!usdtBalance || !form.price) return;
                  const price = parseFloat(form.price);
                  if (!price) return;
                  const qty = ((usdtBalance.free * pct) / 100 / price).toFixed(6);
                  updateForm({ quantity: qty });
                }}
                className="flex-1 rounded border border-tv-border py-0.5 text-[10px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* SL / TP (perp only) */}
        {perp && (
          <>
            <div className="mb-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="sl-check"
                checked={form.slEnabled}
                onChange={(e) => updateForm({ slEnabled: e.target.checked })}
                className="h-3 w-3 accent-tv-red"
              />
              <label htmlFor="sl-check" className="text-[10px] text-tv-text-muted">
                Stop Loss
              </label>
            </div>
            {form.slEnabled && (
              <div className="mb-3">
                <div className="flex items-center gap-1 rounded border border-tv-red/50 bg-tv-bg px-2 py-1.5">
                  <input
                    type="number"
                    value={form.sl}
                    onChange={(e) => updateForm({ sl: e.target.value })}
                    placeholder="SL price"
                    className="flex-1 bg-transparent text-xs text-tv-red outline-none placeholder:text-tv-red/40"
                  />
                  <span className="text-[10px] text-tv-red/60">{quoteAsset}</span>
                </div>
              </div>
            )}

            <div className="mb-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="tp-check"
                checked={form.tpEnabled}
                onChange={(e) => updateForm({ tpEnabled: e.target.checked })}
                className="h-3 w-3 accent-tv-green"
              />
              <label htmlFor="tp-check" className="text-[10px] text-tv-text-muted">
                Take Profit
              </label>
            </div>
            {form.tpEnabled && (
              <div className="mb-3">
                <div className="flex items-center gap-1 rounded border border-tv-green/50 bg-tv-bg px-2 py-1.5">
                  <input
                    type="number"
                    value={form.tp}
                    onChange={(e) => updateForm({ tp: e.target.value })}
                    placeholder="TP price"
                    className="flex-1 bg-transparent text-xs text-tv-green outline-none placeholder:text-tv-green/40"
                  />
                  <span className="text-[10px] text-tv-green/60">{quoteAsset}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Extra settings */}
        <button
          onClick={() => setExtraOpen((v) => !v)}
          className="mb-2 flex w-full items-center justify-between text-[10px] text-tv-text-muted hover:text-tv-text"
        >
          <span>Extra settings</span>
          <span>{extraOpen ? "▲" : "▼"}</span>
        </button>
        {extraOpen && (
          <div className="mb-3 space-y-3 rounded border border-tv-border bg-tv-bg/50 p-2">
            {form.type !== "MARKET" && form.type !== "STOP_MARKET" && (
              <div>
                <label className="mb-1 block text-[10px] text-tv-text-muted">Time in force</label>
                <select
                  value={form.timeInForce}
                  onChange={(e) => updateForm({ timeInForce: e.target.value as TimeInForce })}
                  className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-xs text-tv-text outline-none"
                >
                  {TIF_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}
            {perp && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.reduceOnly}
                  onChange={(e) => updateForm({ reduceOnly: e.target.checked })}
                  className="h-3 w-3"
                />
                <span className="text-[10px] text-tv-text-muted">Reduce Only</span>
              </label>
            )}
          </div>
        )}

        {/* Order info */}
        <div className="mb-3 rounded border border-tv-border bg-tv-bg/50 p-2">
          <div className="mb-1 text-[10px] font-semibold text-tv-text-muted">Order info</div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-tv-text-muted">Notional</span>
            <span className="tabular-nums text-[10px] text-tv-text">
              {notional ? `${notional.toFixed(2)} ${quoteAsset}` : "—"}
            </span>
          </div>
          {usdtBalance && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-tv-text-muted">Available</span>
              <span className="tabular-nums text-[10px] text-tv-text">
                {usdtBalance.free.toFixed(2)} {quoteAsset}
              </span>
            </div>
          )}
        </div>

        {/* Error / success */}
        {orderResult && (
          <div
            className={cn(
              "mb-3 flex items-start gap-2 rounded px-2 py-2 text-[10px]",
              orderResult.ok ? "bg-tv-green/15 text-tv-green" : "bg-tv-red/15 text-tv-red",
            )}
          >
            {!orderResult.ok && <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />}
            <span>{orderResult.msg}</span>
          </div>
        )}
        {lastError && !orderResult && (
          <div className="mb-3 flex items-start gap-2 rounded bg-tv-red/15 px-2 py-2 text-[10px] text-tv-red">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{lastError}</span>
          </div>
        )}
      </div>

      {/* Buy / Sell buttons */}
      <div className="grid grid-cols-2 gap-2 border-t border-tv-border px-3 py-3">
        <button
          disabled={isLoading || !form.quantity}
          onClick={() => submit("SELL")}
          className="flex flex-col items-center rounded bg-tv-red px-2 py-2 font-medium text-white transition-colors hover:bg-tv-red/80 disabled:opacity-50"
        >
          <span className="text-sm">Sell</span>
          <span className="text-[9px] opacity-80">
            {form.quantity || "0"} {sym.replace("USDT", "")}
          </span>
        </button>
        <button
          disabled={isLoading || !form.quantity}
          onClick={() => submit("BUY")}
          className="flex flex-col items-center rounded bg-tv-blue px-2 py-2 font-medium text-white transition-colors hover:bg-tv-blue/80 disabled:opacity-50"
        >
          <span className="text-sm">Buy</span>
          <span className="text-[9px] opacity-80">
            {form.quantity || "0"} {sym.replace("USDT", "")}
          </span>
        </button>
      </div>

      {/* Open Orders */}
      {orders.length > 0 && (
        <div className="border-t border-tv-border">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[10px] font-semibold text-tv-text-muted">Open Orders ({orders.length})</span>
            <button
              onClick={() => fetchOrders(symbol)}
              className="text-tv-text-dim hover:text-tv-text"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
          <div className="max-h-32 overflow-y-auto">
            {orders.map((o) => (
              <div
                key={o.orderId}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-tv-panel-hover"
              >
                <span
                  className={cn(
                    "w-6 text-[10px] font-semibold",
                    o.side === "BUY" ? "text-tv-blue" : "text-tv-red",
                  )}
                >
                  {o.side === "BUY" ? "B" : "S"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-tv-text-muted">{o.type.replace(/_/g, " ")}</span>
                    <span className="tabular-nums text-tv-text">
                      {o.price > 0 ? formatPrice(o.price) : "MKT"}
                    </span>
                  </div>
                  <div className="text-[10px] text-tv-text-dim">
                    {o.origQty} {sym.replace("USDT", "")}
                  </div>
                </div>
                <button
                  onClick={() => cancelOrder(symbol, o.orderId)}
                  className="shrink-0 rounded p-0.5 text-tv-text-dim hover:bg-tv-red/10 hover:text-tv-red"
                  aria-label="Cancel order"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Futures Positions */}
      {perp && positions.length > 0 && (
        <div className="border-t border-tv-border">
          <div className="px-3 py-2 text-[10px] font-semibold text-tv-text-muted">
            Positions ({positions.length})
          </div>
          <div className="max-h-28 overflow-y-auto">
            {positions.map((p) => (
              <div key={p.symbol} className="px-3 py-1.5 hover:bg-tv-panel-hover">
                <div className="flex items-center justify-between text-[10px]">
                  <span
                    className={cn(
                      "font-semibold",
                      p.side === "LONG" ? "text-tv-blue" : "text-tv-red",
                    )}
                  >
                    {p.side} {Math.abs(p.positionAmt)}
                  </span>
                  <span
                    className={cn(
                      "tabular-nums",
                      p.unrealizedProfit >= 0 ? "text-tv-green" : "text-tv-red",
                    )}
                  >
                    {p.unrealizedProfit >= 0 ? "+" : ""}
                    {p.unrealizedProfit.toFixed(2)} USDT
                  </span>
                </div>
                <div className="flex items-center justify-between text-[9px] text-tv-text-dim">
                  <span>Entry: {formatPrice(p.entryPrice)}</span>
                  <span>
                    {p.percentage >= 0 ? "+" : ""}
                    {p.percentage.toFixed(2)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer: settings link */}
      <div className="flex items-center justify-between border-t border-tv-border px-3 py-2">
        <div className="flex items-center gap-1">
          <div
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isConnected ? "bg-tv-green" : "bg-tv-text-dim",
            )}
          />
          <span className="text-[10px] text-tv-text-dim">
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <button
          onClick={() => setShowApiDialog(true)}
          className="flex items-center gap-1 text-[10px] text-tv-text-dim hover:text-tv-text"
        >
          <KeyRound className="h-3 w-3" />
          API
        </button>
      </div>
    </div>
  );
}
