import crypto from "node:crypto";
import { NextResponse } from "next/server";

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
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SetLeverageBody;
    const { apiKey, apiSecret, testnet, symbol, leverage } = body;
    if (!apiKey || !apiSecret || !symbol || !leverage) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
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
