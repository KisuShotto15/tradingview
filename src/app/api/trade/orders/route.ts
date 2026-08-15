import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { bybitGetOrders, BybitError } from "@/lib/exchanges/bybit";

const SPOT_PROD = "https://api.binance.com/api/v3";
const SPOT_TEST = "https://testnet.binance.vision/api/v3";
const PERP_PROD = "https://fapi.binance.com/fapi/v1";
const PERP_TEST = "https://testnet.binancefuture.com/fapi/v1";

function base(isPerp: boolean, testnet: boolean) {
  if (isPerp) return testnet ? PERP_TEST : PERP_PROD;
  return testnet ? SPOT_TEST : SPOT_PROD;
}
function sign(data: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const apiKey = url.searchParams.get("apiKey") ?? "";
    const apiSecret = url.searchParams.get("apiSecret") ?? "";
    const testnet = url.searchParams.get("testnet") === "true";
    const isPerp = url.searchParams.get("isPerp") === "true";
    const symbol = url.searchParams.get("symbol") ?? "";
    const exchange = url.searchParams.get("exchange") ?? "binance";

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    if (exchange === "bybit") {
      try {
        const orders = await bybitGetOrders({ apiKey, apiSecret, testnet }, isPerp, symbol);
        return NextResponse.json(orders);
      } catch (e) {
        const code = e instanceof BybitError ? e.code : -1;
        return NextResponse.json({ msg: String(e), code }, { status: 400 });
      }
    }

    const params: Record<string, string> = {
      timestamp: Date.now().toString(),
      recvWindow: "60000",
    };
    if (symbol) params.symbol = symbol;
    const qs = new URLSearchParams(params).toString();
    const signature = sign(qs, apiSecret);
    const endpoint = `${base(isPerp, testnet)}/openOrders?${qs}&signature=${signature}`;

    const res = await fetch(endpoint, { headers: { "X-MBX-APIKEY": apiKey } });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
