import { test } from "node:test";
import { expect } from "@/test-utils/expect";
import {
  bybitPreSign,
  bybitQueryString,
  bybitCategory,
  bybitBaseUrl,
  mapBybitPosition,
  mapBybitOrder,
  mapBybitBalance,
  mapBybitInstrument,
  type RawBybitPosition,
  type RawBybitOrder,
  type RawBybitInstrument,
} from "@/lib/exchanges/bybit";

test("bybitPreSign concatenates timestamp+apiKey+recvWindow+payload in order", () => {
  expect(bybitPreSign("1700000000000", "KEY", "60000", "a=1&b=2")).toBe(
    "1700000000000KEY60000a=1&b=2",
  );
});

test("bybitQueryString sorts keys deterministically", () => {
  expect(bybitQueryString({ symbol: "BTCUSDT", category: "linear" })).toBe(
    "category=linear&symbol=BTCUSDT",
  );
});

test("bybitCategory maps perp->linear and spot->spot", () => {
  expect(bybitCategory(true)).toBe("linear");
  expect(bybitCategory(false)).toBe("spot");
});

test("bybitBaseUrl switches on testnet", () => {
  expect(bybitBaseUrl(true)).toBe("https://api-testnet.bybit.com");
  expect(bybitBaseUrl(false)).toBe("https://api.bybit.com");
});

test("mapBybitPosition: long position keeps sign, maps fields + tp/sl", () => {
  const raw: RawBybitPosition = {
    symbol: "BTCUSDT",
    side: "Buy",
    size: "0.5",
    avgPrice: "60000",
    positionValue: "30000",
    leverage: "10",
    markPrice: "61000",
    liqPrice: "54000",
    unrealisedPnl: "500",
    positionIM: "3000",
    positionMM: "150",
    takeProfit: "65000",
    stopLoss: "58000",
    tradeMode: 1,
    positionIdx: 1,
  };
  const p = mapBybitPosition(raw);
  expect(p.positionAmt).toBe(0.5);
  expect(p.side).toBe("LONG");
  expect(p.entryPrice).toBe(60000);
  expect(p.marginType).toBe("isolated");
  expect(p.positionIdx).toBe(1);
  expect(p.takeProfit).toBe(65000);
  expect(p.stopLoss).toBe(58000);
  expect(p.liquidationPrice).toBe(54000);
  expect(p.unrealizedProfit).toBe(500);
  // ROI% = unrealizedPnl / initialMargin, not a naive price-delta*leverage
  // estimate: 500 / 3000 * 100.
  expect(p.percentage).toBeCloseTo(16.6667, 3);
});

test("mapBybitPosition: short position gets negative amount and cross margin", () => {
  const raw: RawBybitPosition = {
    symbol: "ETHUSDT",
    side: "Sell",
    size: "2",
    avgPrice: "3000",
    positionValue: "6000",
    leverage: "5",
    markPrice: "2900",
    liqPrice: "3300",
    unrealisedPnl: "200",
    positionIM: "1200",
    positionMM: "60",
    takeProfit: "0",
    stopLoss: "0",
    tradeMode: 0,
    positionIdx: 2,
  };
  const p = mapBybitPosition(raw);
  expect(p.positionAmt).toBe(-2);
  expect(p.side).toBe("SHORT");
  expect(p.marginType).toBe("cross");
  // Empty ("0") tp/sl collapse to undefined so lines are not drawn.
  expect(p.takeProfit).toBe(undefined);
  expect(p.stopLoss).toBe(undefined);
  // 200 / 1200 * 100.
  expect(p.percentage).toBeCloseTo(16.6667, 3);
});

test("mapBybitPosition: percentage uses unrealizedPnl/initialMargin, not price-delta*leverage", () => {
  // Regression: extra margin manually added to an isolated position makes the
  // naive (mark-entry)/entry*leverage estimate diverge — even flip sign —
  // from the real ROI% the exchange (and TradingView, via a Bybit connection)
  // shows. Here price barely moved against the position (small loss by the
  // naive formula) but real ROI is a small profit thanks to the extra margin.
  const raw: RawBybitPosition = {
    symbol: "SOLUSDT",
    side: "Buy",
    size: "10",
    avgPrice: "150",
    positionValue: "1500",
    leverage: "10",
    markPrice: "149.5", // -0.33% price move -> naive formula would give -3.3%
    liqPrice: "100",
    unrealisedPnl: "1.5", // but real P&L is positive (extra margin added)
    positionIM: "450",
    positionMM: "10",
    takeProfit: "0",
    stopLoss: "0",
    tradeMode: 1,
    positionIdx: 1,
  };
  const p = mapBybitPosition(raw);
  // 1.5 / 450 * 100 = 0.3333...%, matching the exchange's real ROI — not the
  // naive formula's -3.3%.
  expect(p.percentage).toBeCloseTo(0.3333, 3);
});

test("mapBybitPosition: falls back to price-delta*leverage when initialMargin is unavailable", () => {
  const raw: RawBybitPosition = {
    symbol: "BTCUSDT",
    side: "Buy",
    size: "1",
    avgPrice: "60000",
    positionValue: "60000",
    leverage: "10",
    markPrice: "61200", // +2% price move
    liqPrice: "54000",
    unrealisedPnl: "1200",
    positionIM: "0",
    positionMM: "0",
    takeProfit: "0",
    stopLoss: "0",
    tradeMode: 0,
    positionIdx: 0,
  };
  const p = mapBybitPosition(raw);
  expect(p.percentage).toBeCloseTo(20, 3);
});

test("mapBybitOrder: limit order normalizes side/type/status", () => {
  const raw: RawBybitOrder = {
    orderId: "abc",
    orderLinkId: "link1",
    symbol: "BTCUSDT",
    side: "Buy",
    orderType: "Limit",
    stopOrderType: "",
    price: "59000",
    qty: "0.1",
    cumExecQty: "0",
    orderStatus: "New",
    triggerPrice: "0",
    timeInForce: "GTC",
    reduceOnly: false,
    createdTime: "1700000000000",
    updatedTime: "1700000000001",
  };
  const o = mapBybitOrder(raw);
  expect(o.side).toBe("BUY");
  expect(o.type).toBe("LIMIT");
  expect(o.status).toBe("NEW");
  expect(o.price).toBe(59000);
  expect(o.stopPrice).toBe(undefined);
});

test("mapBybitOrder: stop-loss trigger maps to STOP_MARKET with stopPrice", () => {
  const raw: RawBybitOrder = {
    orderId: "sl1",
    orderLinkId: "",
    symbol: "BTCUSDT",
    side: "Sell",
    orderType: "Market",
    stopOrderType: "StopLoss",
    price: "0",
    qty: "0.1",
    cumExecQty: "0",
    orderStatus: "Untriggered",
    triggerPrice: "58000",
    timeInForce: "IOC",
    reduceOnly: true,
    createdTime: "1700000000000",
    updatedTime: "1700000000001",
  };
  const o = mapBybitOrder(raw);
  expect(o.side).toBe("SELL");
  expect(o.type).toBe("STOP_MARKET");
  expect(o.status).toBe("NEW");
  expect(o.stopPrice).toBe(58000);
  expect(o.reduceOnly).toBe(true);
});

test("mapBybitOrder: PostOnly TIF maps to GTX", () => {
  const raw: RawBybitOrder = {
    orderId: "po1", orderLinkId: "", symbol: "BTCUSDT", side: "Buy",
    orderType: "Limit", stopOrderType: "", price: "100", qty: "1", cumExecQty: "0",
    orderStatus: "New", triggerPrice: "0", timeInForce: "PostOnly", reduceOnly: false,
    createdTime: "0", updatedTime: "0",
  };
  expect(mapBybitOrder(raw).timeInForce).toBe("GTX");
});

test("mapBybitBalance: uses availableToWithdraw for free and filters zeros", () => {
  const bal = mapBybitBalance([
    { coin: "USDT", walletBalance: "1000", availableToWithdraw: "800", equity: "1000" },
    { coin: "BTC", walletBalance: "0", availableToWithdraw: "0", equity: "0" },
  ]);
  expect(bal.length).toBe(1);
  expect(bal[0].asset).toBe("USDT");
  expect(bal[0].free).toBe(800);
  expect(bal[0].locked).toBe(200);
});

test("mapBybitInstrument derives precision from tick/step size", () => {
  const raw: RawBybitInstrument = {
    symbol: "BTCUSDT",
    status: "Trading",
    priceFilter: { tickSize: "0.10" },
    lotSizeFilter: { qtyStep: "0.001", minOrderQty: "0.001", minNotionalValue: "5" },
  };
  const i = mapBybitInstrument(raw);
  expect(i.tickSize).toBe(0.1);
  expect(i.stepSize).toBe(0.001);
  expect(i.pricePrecision).toBe(1);
  expect(i.quantityPrecision).toBe(3);
  expect(i.minNotional).toBe(5);
});
