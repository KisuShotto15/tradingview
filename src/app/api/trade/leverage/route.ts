import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { bybitSetLeverage, BybitError } from "@/lib/exchanges/bybit";
import type { Exchange } from "@/lib/binance/trading-types";

const PERP_PROD = "https://fapi.binance.com/fapi/v1";
const PERP_TEST = "https://testnet.binancefuture.com/fapi/v1";

function sign(data: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

/**
 * POST /api/trade/leverage
 *
 * Body: { apiKey, apiSecret, testnet, symbol, leverage }
 *
 * Forwards to Binance Futures POST /fapi/v1/leverage. Returns the exchange's
 * response on success (includes maxNotionalValue), or the error body verbatim
 * on failure so the client can show the specific Binance reason.
 */
interface SetLeverageBody {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
  symbol: string;
  leverage: number;
  exchange?: Exchange;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SetLeverageBody;
    const { apiKey, apiSecret, testnet, symbol, leverage, exchange } = body;
    if (!apiKey || !apiSecret || !symbol || !leverage) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    if (exchange === "bybit") {
      try {
        const result = await bybitSetLeverage(
          { apiKey, apiSecret, testnet: !!testnet },
          symbol,
          leverage,
        );
        return NextResponse.json(result);
      } catch (e) {
        // Bybit returns retCode 110043 when leverage is already set — treat as ok.
        if (e instanceof BybitError && e.code === 110043) {
          return NextResponse.json({ ok: true, note: "leverage unchanged" });
        }
        const code = e instanceof BybitError ? e.code : -1;
        return NextResponse.json({ msg: String(e), code }, { status: 400 });
      }
    }

    const qs = new URLSearchParams({
      symbol,
      leverage: String(leverage),
      timestamp: Date.now().toString(),
      recvWindow: "60000",
    }).toString();
    const signature = sign(qs, apiSecret);

    const base = testnet ? PERP_TEST : PERP_PROD;
    const res = await fetch(`${base}/leverage?${qs}&signature=${signature}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": apiKey },
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
