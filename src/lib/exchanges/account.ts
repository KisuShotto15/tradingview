import crypto from "node:crypto";
import {
  bybitGetBalance,
  bybitGetOrders,
  bybitGetPositions,
  BybitError,
} from "@/lib/exchanges/bybit";
import type { AssetBalance, Position } from "@/lib/binance/trading-types";

/**
 * Server-side account reads (balance / open orders / positions), shared by the
 * per-resource `/api/trade/{balance,orders,positions}` routes and by the
 * batched `/api/trade/sync` route.
 *
 * The batched route is what the polling loop actually uses: one Vercel
 * Function invocation covering all three instead of three (plus three
 * middleware runs). The single-resource routes stay for one-off refreshes
 * after a user action. Both must return byte-identical shapes, which is why
 * the logic lives here once rather than being copy-pasted per route.
 *
 * Errors are returned rather than thrown so a caller batching several reads
 * can surface one failure without losing the results that did succeed.
 */

export interface AccountCreds {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
  exchange: string;
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; body: unknown };

const SPOT_PROD = "https://api.binance.com/api/v3";
const SPOT_TEST = "https://testnet.binance.vision/api/v3";
const PERP_PROD = "https://fapi.binance.com/fapi/v1";
const PERP_TEST = "https://testnet.binancefuture.com/fapi/v1";
// Binance Futures versions endpoints individually: /fapi/v1 hosts most
// market-data endpoints, but /balance and /positionRisk live at /fapi/v2.
const PERP_PROD_V2 = "https://fapi.binance.com/fapi/v2";
const PERP_TEST_V2 = "https://testnet.binancefuture.com/fapi/v2";

function sign(data: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

function spotOrPerpBase(isPerp: boolean, testnet: boolean) {
  if (isPerp) return testnet ? PERP_TEST : PERP_PROD;
  return testnet ? SPOT_TEST : SPOT_PROD;
}

/** recvWindow=60000 tolerates up to 60s of clock skew against Binance (max allowed). */
function signedQuery(apiSecret: string, extra: Record<string, string> = {}) {
  const qs = new URLSearchParams({
    timestamp: Date.now().toString(),
    recvWindow: "60000",
    ...extra,
  }).toString();
  return `${qs}&signature=${sign(qs, apiSecret)}`;
}

function bybitFailure(e: unknown): { ok: false; status: number; body: unknown } {
  const code = e instanceof BybitError ? e.code : -1;
  return { ok: false, status: 400, body: { msg: String(e), code } };
}

// ---------------------------------------------------------------- balance

export async function getBalance(
  creds: AccountCreds,
  isPerp: boolean,
): Promise<Result<AssetBalance[]>> {
  const { apiKey, apiSecret, testnet, exchange } = creds;

  if (exchange === "bybit") {
    try {
      return { ok: true, data: await bybitGetBalance({ apiKey, apiSecret, testnet }) };
    } catch (e) {
      return bybitFailure(e);
    }
  }

  const query = signedQuery(apiSecret);

  if (isPerp) {
    const base = testnet ? PERP_TEST_V2 : PERP_PROD_V2;
    const res = await fetch(`${base}/balance?${query}`, {
      headers: { "X-MBX-APIKEY": apiKey },
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, status: res.status, body: data };
    // Futures balance: [{ asset, balance, availableBalance, ... }]
    return {
      ok: true,
      data: (data as Array<Record<string, string>>)
        .filter((b) => parseFloat(b.balance) > 0)
        .map((b) => ({
          asset: b.asset,
          free: parseFloat(b.availableBalance),
          locked: parseFloat(b.balance) - parseFloat(b.availableBalance),
        })),
    };
  }

  const base = testnet ? SPOT_TEST : SPOT_PROD;
  const res = await fetch(`${base}/account?${query}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });
  const data = (await res.json()) as { balances?: Array<Record<string, string>> };
  if (!res.ok) return { ok: false, status: res.status, body: data };
  return {
    ok: true,
    data: (data.balances ?? [])
      .filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map((b) => ({
        asset: b.asset,
        free: parseFloat(b.free),
        locked: parseFloat(b.locked),
      })),
  };
}

// ----------------------------------------------------------------- orders

/** Binance returns its raw openOrders shape; the client maps it. Bybit's
 *  mapper already normalizes to the same field names. */
export async function getOrders(
  creds: AccountCreds,
  isPerp: boolean,
  symbol: string,
): Promise<Result<unknown>> {
  const { apiKey, apiSecret, testnet, exchange } = creds;

  if (exchange === "bybit") {
    try {
      return {
        ok: true,
        data: await bybitGetOrders({ apiKey, apiSecret, testnet }, isPerp, symbol),
      };
    } catch (e) {
      return bybitFailure(e);
    }
  }

  const query = signedQuery(apiSecret, symbol ? { symbol } : {});
  const res = await fetch(`${spotOrPerpBase(isPerp, testnet)}/openOrders?${query}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, status: res.status, body: data };
  return { ok: true, data };
}

// -------------------------------------------------------------- positions

interface RawBinancePosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  leverage: string;
  positionSide: string;
  liquidationPrice?: string;
  notional?: string;
  positionInitialMargin?: string;
  maintMargin?: string;
  isolatedMargin?: string;
  marginType?: string; // "isolated" | "cross"
  isolated?: boolean;
}

/** Omitting `symbol` returns every open position on the account. */
export async function getPositions(
  creds: AccountCreds,
  symbol: string,
): Promise<Result<Position[]>> {
  const { apiKey, apiSecret, testnet, exchange } = creds;

  if (exchange === "bybit") {
    try {
      return {
        ok: true,
        data: await bybitGetPositions({ apiKey, apiSecret, testnet }, symbol),
      };
    } catch (e) {
      return bybitFailure(e);
    }
  }

  const base = testnet ? PERP_TEST_V2 : PERP_PROD_V2;
  const query = signedQuery(apiSecret, symbol ? { symbol } : {});
  const res = await fetch(`${base}/positionRisk?${query}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, status: res.status, body: data };

  return {
    ok: true,
    data: (data as RawBinancePosition[])
      .filter((p) => parseFloat(p.positionAmt) !== 0)
      .map((p) => {
        const positionAmt = parseFloat(p.positionAmt);
        const entryPrice = parseFloat(p.entryPrice);
        const markPrice = parseFloat(p.markPrice);
        const leverage = parseFloat(p.leverage);
        const unrealizedProfit = parseFloat(p.unRealizedProfit);
        const initialMargin = p.positionInitialMargin
          ? parseFloat(p.positionInitialMargin)
          : 0;
        // ROE% = unrealized P&L / initial margin, matching Binance's own
        // displayed percentage. Falls back to a naive price-delta * leverage
        // estimate only when the API doesn't report an initial margin (some
        // cross-margin responses), since that naive formula can be off by an
        // arbitrary factor — or even the wrong sign — once real margin, fees,
        // or funding diverge from the simple price-delta assumption.
        const percentage =
          initialMargin > 0
            ? (unrealizedProfit / initialMargin) * 100
            : entryPrice > 0
              ? ((markPrice - entryPrice) / entryPrice) *
                100 *
                leverage *
                (positionAmt > 0 ? 1 : -1)
              : 0;
        return {
          symbol: p.symbol,
          positionAmt,
          entryPrice,
          markPrice,
          unrealizedProfit,
          percentage,
          leverage,
          side: (positionAmt > 0 ? "LONG" : positionAmt < 0 ? "SHORT" : "BOTH") as
            Position["side"],
          liquidationPrice: p.liquidationPrice ? parseFloat(p.liquidationPrice) : 0,
          notional: p.notional
            ? Math.abs(parseFloat(p.notional))
            : Math.abs(positionAmt * markPrice),
          initialMargin,
          maintMargin: p.maintMargin ? parseFloat(p.maintMargin) : 0,
          marginType: (p.marginType ?? (p.isolated ? "isolated" : "cross")) as
            "isolated" | "cross",
        };
      }),
  };
}

/** Reads the shared credential/scope params every account route accepts. */
export function readAccountParams(req: Request) {
  const url = new URL(req.url);
  return {
    creds: {
      apiKey: url.searchParams.get("apiKey") ?? "",
      apiSecret: url.searchParams.get("apiSecret") ?? "",
      testnet: url.searchParams.get("testnet") === "true",
      exchange: url.searchParams.get("exchange") ?? "binance",
    } satisfies AccountCreds,
    isPerp: url.searchParams.get("isPerp") === "true",
    symbol: url.searchParams.get("symbol") ?? "",
  };
}
