export type OrderSide = "BUY" | "SELL";
export type OrderType =
  | "MARKET"
  | "LIMIT"
  | "STOP"
  | "STOP_MARKET"
  | "STOP_LIMIT"
  | "TAKE_PROFIT"
  | "TAKE_PROFIT_MARKET";
export type OrderStatus =
  | "NEW"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "REJECTED"
  | "EXPIRED";
export type TimeInForce = "GTC" | "IOC" | "FOK" | "GTX";

export interface Order {
  orderId: number | string;
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  price: number;
  origQty: number;
  executedQty: number;
  stopPrice?: number;
  timeInForce?: TimeInForce;
  time: number;
  updateTime: number;
  reduceOnly?: boolean;
  isPerp: boolean;
}

export interface Position {
  symbol: string;
  positionAmt: number;
  entryPrice: number;
  markPrice: number;
  unrealizedProfit: number;
  percentage: number;
  leverage: number;
  side: "LONG" | "SHORT" | "BOTH";
}

export interface AssetBalance {
  asset: string;
  free: number;
  locked: number;
}

export interface PlaceOrderParams {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
  symbol: string;
  isPerp: boolean;
  side: OrderSide;
  type: OrderType;
  quantity: string;
  price?: string;
  stopPrice?: string;
  timeInForce?: TimeInForce;
  reduceOnly?: boolean;
  closePosition?: boolean;
  workingType?: "MARK_PRICE" | "CONTRACT_PRICE";
}

export interface CancelOrderParams {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
  symbol: string;
  isPerp: boolean;
  orderId: number | string;
}

/** Sizing modes shown in the Bybit-style order panel dropdown. */
export type SizingMode =
  | "AMOUNT"
  | "MARGIN_USD"
  | "PCT_BALANCE"
  | "RISK_USD"
  | "RISK_PCT";

/** Symbol filters resolved from /fapi/v1/exchangeInfo (cached). */
export interface SymbolInfo {
  symbol: string;
  status: string;
  pricePrecision: number;
  quantityPrecision: number;
  tickSize: number;
  stepSize: number;
  minNotional: number;
}
