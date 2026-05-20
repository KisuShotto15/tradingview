"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isPerp, cleanSym } from "@/lib/binance/rest";
import type {
  Order,
  Position,
  AssetBalance,
  OrderSide,
  OrderType,
  TimeInForce,
  PlaceOrderParams,
} from "@/lib/binance/trading-types";

export interface OrderForm {
  side: OrderSide;
  type: OrderType;
  price: string;
  quantity: string;
  slEnabled: boolean;
  sl: string;
  tpEnabled: boolean;
  tp: string;
  timeInForce: TimeInForce;
  reduceOnly: boolean;
}

interface TradingState {
  // Credentials
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
  isConnected: boolean;

  // Data
  orders: Order[];
  positions: Position[];
  balance: AssetBalance[];

  // UI form
  form: OrderForm;
  tradingPanelOpen: boolean;
  isLoading: boolean;
  lastError: string | null;

  // Actions
  setCredentials: (apiKey: string, apiSecret: string, testnet: boolean) => void;
  setConnected: (v: boolean) => void;
  setTradingPanelOpen: (v: boolean) => void;
  updateForm: (patch: Partial<OrderForm>) => void;
  resetForm: (price?: number) => void;

  fetchBalance: (symbol: string) => Promise<void>;
  fetchOrders: (symbol: string) => Promise<void>;
  fetchPositions: (symbol: string) => Promise<void>;

  placeOrder: (
    symbol: string,
    overrides?: Partial<OrderForm>,
  ) => Promise<{ ok: boolean; error?: string }>;
  cancelOrder: (symbol: string, orderId: number | string) => Promise<void>;
}

function defaultForm(): OrderForm {
  return {
    side: "BUY",
    type: "LIMIT",
    price: "",
    quantity: "",
    slEnabled: false,
    sl: "",
    tpEnabled: false,
    tp: "",
    timeInForce: "GTC",
    reduceOnly: false,
  };
}

export const useTradingStore = create<TradingState>()(
  persist(
    (set, get) => ({
      apiKey: "",
      apiSecret: "",
      testnet: true,
      isConnected: false,
      orders: [],
      positions: [],
      balance: [],
      form: defaultForm(),
      tradingPanelOpen: false,
      isLoading: false,
      lastError: null,

      setCredentials: (apiKey, apiSecret, testnet) => {
        set({ apiKey, apiSecret, testnet, isConnected: false, lastError: null });
      },
      setConnected: (v) => set({ isConnected: v }),
      setTradingPanelOpen: (v) => set({ tradingPanelOpen: v }),
      updateForm: (patch) =>
        set((s) => ({ form: { ...s.form, ...patch } })),
      resetForm: (price) =>
        set({ form: { ...defaultForm(), price: price ? String(price) : "" } }),

      fetchBalance: async (symbol) => {
        const { apiKey, apiSecret, testnet } = get();
        if (!apiKey || !apiSecret) return;
        const perp = isPerp(symbol);
        const params = new URLSearchParams({
          apiKey,
          apiSecret,
          testnet: String(testnet),
          isPerp: String(perp),
        });
        try {
          const res = await fetch(`/api/trade/balance?${params}`);
          if (!res.ok) return;
          const data = await res.json();
          set({ balance: data, isConnected: true });
        } catch {
          set({ isConnected: false });
        }
      },

      fetchOrders: async (symbol) => {
        const { apiKey, apiSecret, testnet } = get();
        if (!apiKey || !apiSecret) return;
        const perp = isPerp(symbol);
        const sym = cleanSym(symbol);
        const params = new URLSearchParams({
          apiKey,
          apiSecret,
          testnet: String(testnet),
          isPerp: String(perp),
          symbol: sym,
        });
        try {
          const res = await fetch(`/api/trade/orders?${params}`);
          if (!res.ok) return;
          const data = await res.json();
          set({
            orders: (data as Array<Record<string, unknown>>).map((o) => ({
              orderId: o.orderId as number,
              clientOrderId: o.clientOrderId as string,
              symbol: o.symbol as string,
              side: o.side as Order["side"],
              type: o.type as Order["type"],
              status: o.status as Order["status"],
              price: parseFloat(o.price as string),
              origQty: parseFloat(o.origQty as string),
              executedQty: parseFloat(o.executedQty as string),
              stopPrice: o.stopPrice ? parseFloat(o.stopPrice as string) : undefined,
              timeInForce: o.timeInForce as Order["timeInForce"],
              time: o.time as number,
              updateTime: o.updateTime as number,
              reduceOnly: (o.reduceOnly as boolean) ?? false,
              isPerp: perp,
            })),
          });
        } catch {
          // silently fail
        }
      },

      fetchPositions: async (symbol) => {
        const { apiKey, apiSecret, testnet } = get();
        if (!apiKey || !apiSecret || !isPerp(symbol)) return;
        const sym = cleanSym(symbol);
        const params = new URLSearchParams({
          apiKey,
          apiSecret,
          testnet: String(testnet),
          symbol: sym,
        });
        try {
          const res = await fetch(`/api/trade/positions?${params}`);
          if (!res.ok) return;
          const data = await res.json();
          set({ positions: data as Position[] });
        } catch {
          // silently fail
        }
      },

      placeOrder: async (symbol, overrides) => {
        const { apiKey, apiSecret, testnet, form } = get();
        if (!apiKey || !apiSecret) return { ok: false, error: "No API credentials set." };
        const f = { ...form, ...overrides };
        const perp = isPerp(symbol);
        const sym = cleanSym(symbol);

        set({ isLoading: true, lastError: null });

        const body: PlaceOrderParams = {
          apiKey,
          apiSecret,
          testnet,
          symbol: sym,
          isPerp: perp,
          side: f.side,
          type: f.type,
          quantity: f.quantity,
          ...(f.type !== "MARKET" && f.price ? { price: f.price } : {}),
          ...(["STOP", "STOP_LIMIT"].includes(f.type) && f.sl ? { stopPrice: f.sl } : {}),
          ...(f.type !== "MARKET" ? { timeInForce: f.timeInForce } : {}),
          ...(perp && f.reduceOnly ? { reduceOnly: true } : {}),
        };

        try {
          const res = await fetch("/api/trade/order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await res.json() as Record<string, unknown>;
          if (!res.ok) {
            const msg = (data.msg as string) || "Order failed";
            set({ isLoading: false, lastError: msg });
            return { ok: false, error: msg };
          }

          // Place SL order if enabled (perp only)
          if (perp && f.slEnabled && f.sl) {
            const slSide: OrderSide = f.side === "BUY" ? "SELL" : "BUY";
            await fetch("/api/trade/order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                apiKey, apiSecret, testnet,
                symbol: sym, isPerp: true,
                side: slSide, type: "STOP_MARKET",
                quantity: f.quantity, stopPrice: f.sl,
                reduceOnly: true, workingType: "MARK_PRICE",
              } satisfies PlaceOrderParams),
            });
          }

          // Place TP order if enabled (perp only)
          if (perp && f.tpEnabled && f.tp) {
            const tpSide: OrderSide = f.side === "BUY" ? "SELL" : "BUY";
            await fetch("/api/trade/order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                apiKey, apiSecret, testnet,
                symbol: sym, isPerp: true,
                side: tpSide, type: "TAKE_PROFIT_MARKET",
                quantity: f.quantity, stopPrice: f.tp,
                reduceOnly: true, workingType: "MARK_PRICE",
              } satisfies PlaceOrderParams),
            });
          }

          set({ isLoading: false });
          // Refresh orders + positions
          void get().fetchOrders(symbol);
          void get().fetchPositions(symbol);
          return { ok: true };
        } catch (e) {
          set({ isLoading: false, lastError: String(e) });
          return { ok: false, error: String(e) };
        }
      },

      cancelOrder: async (symbol, orderId) => {
        const { apiKey, apiSecret, testnet } = get();
        if (!apiKey || !apiSecret) return;
        const perp = isPerp(symbol);
        const sym = cleanSym(symbol);
        await fetch("/api/trade/order", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey, apiSecret, testnet, symbol: sym, isPerp: perp, orderId }),
        });
        void get().fetchOrders(symbol);
      },
    }),
    {
      name: "trading-store",
      partialize: (s) => ({
        apiKey: s.apiKey,
        apiSecret: s.apiSecret,
        testnet: s.testnet,
        tradingPanelOpen: s.tradingPanelOpen,
      }),
    },
  ),
);
