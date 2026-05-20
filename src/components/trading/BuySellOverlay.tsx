"use client";

import { useEffect, useState } from "react";
import { useTradingStore } from "@/lib/store/trading-store";
import { useChartStore } from "@/lib/store/chart-store";
import { getBinanceWS } from "@/lib/binance/ws";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BuySellOverlay() {
  const symbol = useChartStore((s) => s.symbol);
  const tradingPanelOpen = useTradingStore((s) => s.tradingPanelOpen);
  const setTradingPanelOpen = useTradingStore((s) => s.setTradingPanelOpen);
  const apiKey = useTradingStore((s) => s.apiKey);
  const placeOrder = useTradingStore((s) => s.placeOrder);
  const form = useTradingStore((s) => s.form);
  const isLoading = useTradingStore((s) => s.isLoading);

  const [bid, setBid] = useState<number | null>(null);
  const [ask, setAsk] = useState<number | null>(null);
  const [flash, setFlash] = useState<"buy" | "sell" | null>(null);

  useEffect(() => {
    const ws = getBinanceWS();
    return ws.subscribeBookTicker(symbol, (data) => {
      setBid(data.bid);
      setAsk(data.ask);
    });
  }, [symbol]);

  async function quickOrder(side: "BUY" | "SELL") {
    if (!apiKey || isLoading) return;
    setFlash(side === "BUY" ? "buy" : "sell");
    setTimeout(() => setFlash(null), 300);
    await placeOrder(symbol, { side, type: "MARKET" });
  }

  if (!apiKey) return null;

  return (
    <div className="absolute bottom-10 right-2 z-30 flex flex-col gap-1.5">
      <button
        onClick={() => setTradingPanelOpen(!tradingPanelOpen)}
        className={cn(
          "rounded border px-2 py-1 text-[10px] font-medium transition-colors",
          tradingPanelOpen
            ? "border-tv-blue bg-tv-blue/20 text-tv-blue"
            : "border-tv-border bg-tv-panel/80 text-tv-text-muted hover:border-tv-blue hover:text-tv-blue",
        )}
      >
        {tradingPanelOpen ? "▶ Panel" : "◀ Trade"}
      </button>

      <button
        onDoubleClick={() => quickOrder("BUY")}
        title="Double-click for market buy"
        className={cn(
          "rounded px-3 py-1.5 text-[11px] font-semibold text-white transition-all",
          flash === "buy"
            ? "scale-95 bg-tv-blue/60"
            : "bg-tv-blue hover:bg-tv-blue/80",
        )}
      >
        <div className="leading-tight">Buy</div>
        {ask && (
          <div className="text-[9px] font-normal opacity-80">{formatPrice(ask)}</div>
        )}
      </button>

      <button
        onDoubleClick={() => quickOrder("SELL")}
        title="Double-click for market sell"
        className={cn(
          "rounded px-3 py-1.5 text-[11px] font-semibold text-white transition-all",
          flash === "sell"
            ? "scale-95 bg-tv-red/60"
            : "bg-tv-red hover:bg-tv-red/80",
        )}
      >
        <div className="leading-tight">Sell</div>
        {bid && (
          <div className="text-[9px] font-normal opacity-80">{formatPrice(bid)}</div>
        )}
      </button>
    </div>
  );
}
