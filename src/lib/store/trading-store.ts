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
  SizingMode,
  Exchange,
} from "@/lib/binance/trading-types";

export interface OrderForm {
  side: OrderSide;
  type: OrderType;
  /** LIMIT / STOP_LIMIT price. */
  price: string;
  /** STOP_MARKET / STOP_LIMIT trigger price. */
  stopPrice: string;
  /** Canonical quantity in base asset (e.g. BTC). Single source of truth. */
  qty: string;
  /** Currently selected sizing mode. Determines which input is editable. */
  sizingMode: SizingMode;
  /** Raw text of the editable sizing input (parsed lazily). */
  sizingInput: string;
  slEnabled: boolean;
  sl: string;
  tpEnabled: boolean;
  tp: string;
  timeInForce: TimeInForce;
  reduceOnly: boolean;
  /** Leverage mirrored from the exchange. Editable via setLeverage(). */
  leverage: number;
}

interface TradingState {
  // Credentials
  exchange: Exchange;
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
  /** When true, the API-credentials dialog is open. Lifted from local state
   *  in OrderPanel so mobile screens can also open it. */
  apiKeyDialogOpen: boolean;
  isLoading: boolean;
  lastError: string | null;
  /** OrderId currently being modified via drag-to-modify on the chart. */
  modifyingOrderId: number | string | null;

  // Actions
  setExchange: (exchange: Exchange) => void;
  setCredentials: (apiKey: string, apiSecret: string, testnet: boolean) => void;
  setConnected: (v: boolean) => void;
  setTradingPanelOpen: (v: boolean) => void;
  setApiKeyDialogOpen: (v: boolean) => void;
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
  /** Cancel an existing order and immediately re-post it at `newPrice`.
   *  Used by drag-to-modify on the chart. */
  modifyOrder: (
    symbol: string,
    order: Order,
    newPrice: number,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** POST to /api/trade/leverage to sync the exchange leverage. */
  setLeverage: (
    symbol: string,
    leverage: number,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Close an open position with a reduceOnly MARKET order. */
  closePosition: (
    symbol: string,
    position: Position,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Place a reduceOnly TP and/or SL for an existing position. Cancels any
   *  matching existing reduceOnly order before placing the new one. */
  setPositionTpSl: (
    symbol: string,
    position: Position,
    args: { tp?: number | null; sl?: number | null },
  ) => Promise<{ ok: boolean; error?: string }>;
}

function defaultForm(): OrderForm {
  return {
    side: "BUY",
    type: "LIMIT",
    price: "",
    stopPrice: "",
    qty: "",
    sizingMode: "AMOUNT",
    sizingInput: "",
    slEnabled: false,
    sl: "",
    tpEnabled: false,
    tp: "",
    timeInForce: "GTC",
    reduceOnly: false,
    leverage: 10,
  };
}

export const useTradingStore = create<TradingState>()(
  persist(
    (set, get) => ({
      exchange: "binance",
      apiKey: "",
      apiSecret: "",
      testnet: true,
      isConnected: false,
      orders: [],
      positions: [],
      balance: [],
      form: defaultForm(),
      tradingPanelOpen: false,
      apiKeyDialogOpen: false,
      isLoading: false,
      lastError: null,
      modifyingOrderId: null,

      setExchange: (exchange) => {
        // Switching exchange invalidates the current connection + cached data.
        set({ exchange, isConnected: false, orders: [], positions: [], balance: [] });
      },
      setCredentials: (apiKey, apiSecret, testnet) => {
        set({ apiKey, apiSecret, testnet, isConnected: false, lastError: null });
      },
      setConnected: (v) => set({ isConnected: v }),
      setTradingPanelOpen: (v) => set({ tradingPanelOpen: v }),
      setApiKeyDialogOpen: (v) => set({ apiKeyDialogOpen: v }),
      updateForm: (patch) =>
        set((s) => ({ form: { ...s.form, ...patch } })),
      resetForm: (price) =>
        set((s) => ({
          form: {
            ...defaultForm(),
            // Preserve user's leverage & sizing preferences across resets.
            leverage: s.form.leverage,
            sizingMode: s.form.sizingMode,
            price: price ? String(price) : "",
          },
        })),

      fetchBalance: async (symbol) => {
        const { apiKey, apiSecret, testnet, exchange } = get();
        if (!apiKey || !apiSecret) return;
        const perp = isPerp(symbol);
        const params = new URLSearchParams({
          apiKey,
          apiSecret,
          testnet: String(testnet),
          isPerp: String(perp),
          exchange,
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
        const { apiKey, apiSecret, testnet, exchange } = get();
        if (!apiKey || !apiSecret) return;
        const perp = isPerp(symbol);
        const sym = cleanSym(symbol);
        const params = new URLSearchParams({
          apiKey,
          apiSecret,
          testnet: String(testnet),
          isPerp: String(perp),
          symbol: sym,
          exchange,
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
        const { apiKey, apiSecret, testnet, exchange } = get();
        if (!apiKey || !apiSecret || !isPerp(symbol)) return;
        const sym = cleanSym(symbol);
        const params = new URLSearchParams({
          apiKey,
          apiSecret,
          testnet: String(testnet),
          symbol: sym,
          exchange,
        });
        try {
          const res = await fetch(`/api/trade/positions?${params}`);
          if (!res.ok) return;
          const data = await res.json();
          const positions = data as Position[];
          set({ positions });
          // Sync leverage from the first non-zero position so the panel
          // mirrors what the exchange has.
          const pos = positions.find((p) => p.positionAmt !== 0);
          if (pos && pos.leverage) {
            set((s) => ({ form: { ...s.form, leverage: pos.leverage } }));
          }
        } catch {
          // silently fail
        }
      },

      placeOrder: async (symbol, overrides) => {
        const { apiKey, apiSecret, testnet, exchange, form } = get();
        if (!apiKey || !apiSecret) return { ok: false, error: "No API credentials set." };
        const f = { ...form, ...overrides };
        const perp = isPerp(symbol);
        const sym = cleanSym(symbol);

        set({ isLoading: true, lastError: null });

        // Bybit hedge mode: if the account holds a hedge position on this symbol,
        // orders must carry a positionIdx (1 long / 2 short). The entry side
        // decides it; its attached reduceOnly SL/TP share the same index.
        let posIdx: number | undefined;
        if (exchange === "bybit" && perp) {
          const hedge = get().positions.some(
            (p) => p.symbol === sym && (p.positionIdx === 1 || p.positionIdx === 2),
          );
          if (hedge) posIdx = f.side === "BUY" ? 1 : 2;
        }

        const body: PlaceOrderParams = {
          apiKey,
          apiSecret,
          testnet,
          exchange,
          symbol: sym,
          isPerp: perp,
          side: f.side,
          type: f.type,
          quantity: f.qty,
          ...(posIdx !== undefined ? { positionIdx: posIdx } : {}),
          ...(f.type !== "MARKET" && f.price ? { price: f.price } : {}),
          ...(["STOP", "STOP_LIMIT", "STOP_MARKET"].includes(f.type) && f.stopPrice
            ? { stopPrice: f.stopPrice }
            : {}),
          ...(f.type !== "MARKET" && f.type !== "STOP_MARKET"
            ? { timeInForce: f.timeInForce }
            : {}),
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
                apiKey, apiSecret, testnet, exchange,
                symbol: sym, isPerp: true,
                side: slSide, type: "STOP_MARKET",
                quantity: f.qty, stopPrice: f.sl,
                reduceOnly: true, workingType: "MARK_PRICE",
                ...(posIdx !== undefined ? { positionIdx: posIdx } : {}),
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
                apiKey, apiSecret, testnet, exchange,
                symbol: sym, isPerp: true,
                side: tpSide, type: "TAKE_PROFIT_MARKET",
                quantity: f.qty, stopPrice: f.tp,
                reduceOnly: true, workingType: "MARK_PRICE",
                ...(posIdx !== undefined ? { positionIdx: posIdx } : {}),
              } satisfies PlaceOrderParams),
            });
          }

          set({ isLoading: false });
          void get().fetchOrders(symbol);
          void get().fetchPositions(symbol);
          return { ok: true };
        } catch (e) {
          set({ isLoading: false, lastError: String(e) });
          return { ok: false, error: String(e) };
        }
      },

      cancelOrder: async (symbol, orderId) => {
        const { apiKey, apiSecret, testnet, exchange } = get();
        if (!apiKey || !apiSecret) return;
        const perp = isPerp(symbol);
        const sym = cleanSym(symbol);
        await fetch("/api/trade/order", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey, apiSecret, testnet, exchange, symbol: sym, isPerp: perp, orderId }),
        });
        void get().fetchOrders(symbol);
      },

      modifyOrder: async (symbol, order, newPrice) => {
        const { apiKey, apiSecret, testnet, exchange } = get();
        if (!apiKey || !apiSecret) return { ok: false, error: "No credentials" };
        const perp = isPerp(symbol);
        const sym = cleanSym(symbol);
        set({ modifyingOrderId: order.orderId, lastError: null });

        // Cancel the original order first.
        try {
          const cancelRes = await fetch("/api/trade/order", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              apiKey, apiSecret, testnet, exchange,
              symbol: sym, isPerp: perp, orderId: order.orderId,
            }),
          });
          if (!cancelRes.ok) {
            const err = (await cancelRes.json().catch(() => ({}))) as { msg?: string };
            set({ modifyingOrderId: null, lastError: err.msg ?? "cancel failed" });
            return { ok: false, error: err.msg ?? "cancel failed" };
          }
        } catch (e) {
          set({ modifyingOrderId: null, lastError: String(e) });
          return { ok: false, error: String(e) };
        }

        // Re-post with the same params but the new price.
        // For trigger orders (STOP_MARKET / TAKE_PROFIT_MARKET) the relevant
        // field is stopPrice; for LIMIT it's price.
        const isTrigger =
          order.type === "STOP_MARKET" || order.type === "TAKE_PROFIT_MARKET";
        const body: PlaceOrderParams = {
          apiKey, apiSecret, testnet, exchange,
          symbol: sym, isPerp: perp,
          side: order.side, type: order.type,
          quantity: String(order.origQty),
          ...(isTrigger ? { stopPrice: String(newPrice) } : { price: String(newPrice) }),
          ...(order.timeInForce && !isTrigger ? { timeInForce: order.timeInForce } : {}),
          ...(perp && order.reduceOnly ? { reduceOnly: true } : {}),
          ...(isTrigger ? { workingType: "MARK_PRICE" } : {}),
        };
        try {
          const res = await fetch("/api/trade/order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = (await res.json().catch(() => ({}))) as { msg?: string };
          set({ modifyingOrderId: null });
          if (!res.ok) {
            set({ lastError: data.msg ?? "replace failed" });
            return { ok: false, error: data.msg ?? "replace failed" };
          }
          void get().fetchOrders(symbol);
          return { ok: true };
        } catch (e) {
          set({ modifyingOrderId: null, lastError: String(e) });
          return { ok: false, error: String(e) };
        }
      },

      closePosition: async (symbol, position) => {
        const { apiKey, apiSecret, testnet, exchange } = get();
        if (!apiKey || !apiSecret) return { ok: false, error: "No credentials" };
        const perp = isPerp(symbol);
        const sym = cleanSym(symbol);
        const qty = Math.abs(position.positionAmt);
        if (qty <= 0) return { ok: false, error: "Position is empty" };
        const closeSide: OrderSide = position.positionAmt > 0 ? "SELL" : "BUY";
        try {
          const res = await fetch("/api/trade/order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              apiKey, apiSecret, testnet, exchange,
              symbol: sym, isPerp: perp,
              side: closeSide, type: "MARKET",
              quantity: String(qty),
              ...(perp ? { reduceOnly: true } : {}),
              ...(position.positionIdx !== undefined ? { positionIdx: position.positionIdx } : {}),
            } satisfies PlaceOrderParams),
          });
          const data = (await res.json().catch(() => ({}))) as { msg?: string };
          if (!res.ok) {
            set({ lastError: data.msg ?? "close failed" });
            return { ok: false, error: data.msg ?? "close failed" };
          }
          void get().fetchOrders(symbol);
          void get().fetchPositions(symbol);
          void get().fetchBalance(symbol);
          return { ok: true };
        } catch (e) {
          set({ lastError: String(e) });
          return { ok: false, error: String(e) };
        }
      },

      setPositionTpSl: async (symbol, position, { tp, sl }) => {
        const { apiKey, apiSecret, testnet, exchange, orders } = get();
        if (!apiKey || !apiSecret) return { ok: false, error: "No credentials" };
        const perp = isPerp(symbol);
        const sym = cleanSym(symbol);
        if (!perp) return { ok: false, error: "Position TP/SL only on perp" };
        const qty = Math.abs(position.positionAmt);
        const closeSide: OrderSide = position.positionAmt > 0 ? "SELL" : "BUY";

        // Bybit sets TP/SL directly on the position via /position/trading-stop.
        if (exchange === "bybit") {
          try {
            const res = await fetch("/api/trade/trading-stop", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                apiKey, apiSecret, testnet, symbol: sym, tp, sl,
                positionIdx: position.positionIdx,
              }),
            });
            const data = (await res.json().catch(() => ({}))) as { msg?: string };
            if (!res.ok) {
              set({ lastError: data.msg ?? "tp/sl failed" });
              return { ok: false, error: data.msg ?? "tp/sl failed" };
            }
            void get().fetchPositions(symbol);
            return { ok: true };
          } catch (e) {
            set({ lastError: String(e) });
            return { ok: false, error: String(e) };
          }
        }

        // Cancel any existing reduceOnly TP / SL orders for this symbol on the
        // opposite side before placing new ones.
        async function cancelExisting(typeMatch: (t: string) => boolean) {
          const stale = orders.filter(
            (o) =>
              o.symbol === sym &&
              o.side === closeSide &&
              o.reduceOnly &&
              typeMatch(o.type),
          );
          for (const o of stale) {
            await fetch("/api/trade/order", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                apiKey, apiSecret, testnet, exchange,
                symbol: sym, isPerp: true, orderId: o.orderId,
              }),
            });
          }
        }
        async function place(type: "TAKE_PROFIT_MARKET" | "STOP_MARKET", stopPrice: number) {
          await fetch("/api/trade/order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              apiKey, apiSecret, testnet, exchange,
              symbol: sym, isPerp: true,
              side: closeSide, type,
              quantity: String(qty), stopPrice: String(stopPrice),
              reduceOnly: true, workingType: "MARK_PRICE",
            } satisfies PlaceOrderParams),
          });
        }

        try {
          if (tp !== undefined) {
            await cancelExisting((t) => t === "TAKE_PROFIT_MARKET" || t === "TAKE_PROFIT");
            if (tp !== null && tp > 0) await place("TAKE_PROFIT_MARKET", tp);
          }
          if (sl !== undefined) {
            await cancelExisting((t) => t === "STOP_MARKET" || t === "STOP" || t === "STOP_LIMIT");
            if (sl !== null && sl > 0) await place("STOP_MARKET", sl);
          }
          void get().fetchOrders(symbol);
          return { ok: true };
        } catch (e) {
          set({ lastError: String(e) });
          return { ok: false, error: String(e) };
        }
      },

      setLeverage: async (symbol, leverage) => {
        const { apiKey, apiSecret, testnet, exchange } = get();
        if (!apiKey || !apiSecret) return { ok: false, error: "No credentials" };
        const sym = cleanSym(symbol);
        // Optimistic update so the UI feels snappy.
        set((s) => ({ form: { ...s.form, leverage } }));
        try {
          const res = await fetch("/api/trade/leverage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apiKey, apiSecret, testnet, exchange, symbol: sym, leverage }),
          });
          const data = (await res.json().catch(() => ({}))) as { msg?: string };
          if (!res.ok) {
            set({ lastError: data.msg ?? "leverage failed" });
            return { ok: false, error: data.msg ?? "leverage failed" };
          }
          return { ok: true };
        } catch (e) {
          set({ lastError: String(e) });
          return { ok: false, error: String(e) };
        }
      },
    }),
    {
      name: "trading-store",
      version: 2,
      partialize: (s) => ({
        exchange: s.exchange,
        apiKey: s.apiKey,
        apiSecret: s.apiSecret,
        testnet: s.testnet,
        tradingPanelOpen: s.tradingPanelOpen,
        // Persist sizing mode + leverage so they survive reloads.
        sizingMode: s.form.sizingMode,
        leverage: s.form.leverage,
      }),
      // v1 → v2: legacy persisted state had no sizingMode/leverage at the
      // top level. Just drop anything unknown and let defaults fill the gaps.
      migrate: ((persistedState: unknown) => {
        return (persistedState ?? {}) as ReturnType<typeof Object>;
      }) as never,
      onRehydrateStorage: () => (state) => {
        // partialize stores sizingMode + leverage at the top level; reattach
        // them to form on rehydrate.
        if (!state) return;
        const raw = state as unknown as Record<string, unknown>;
        const sm = raw.sizingMode as SizingMode | undefined;
        const lev = raw.leverage as number | undefined;
        if (sm || lev !== undefined) {
          state.form = {
            ...state.form,
            ...(sm ? { sizingMode: sm } : {}),
            ...(lev !== undefined ? { leverage: lev } : {}),
          };
        }
      },
    },
  ),
);
