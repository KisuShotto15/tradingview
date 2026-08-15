import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { bybitGetBalance, BybitError } from "@/lib/exchanges/bybit";

const SPOT_PROD = "https://api.binance.com/api/v3";
const SPOT_TEST = "https://testnet.binance.vision/api/v3";
// Note: Binance Futures versions endpoints individually. /fapi/v1 hosts most
// market-data endpoints, but /balance lives at /fapi/v2 (v1 was removed).
const PERP_PROD_V2 = "https://fapi.binance.com/fapi/v2";
const PERP_TEST_V2 = "https://testnet.binancefuture.com/fapi/v2";

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
    const exchange = url.searchParams.get("exchange") ?? "binance";

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    if (exchange === "bybit") {
      try {
        const balances = await bybitGetBalance({ apiKey, apiSecret, testnet });
        return NextResponse.json(balances);
      } catch (e) {
        const code = e instanceof BybitError ? e.code : -1;
        return NextResponse.json({ msg: String(e), code }, { status: 400 });
      }
    }

    // recvWindow=60000 makes the request tolerant of up to 60 s of clock skew
    // between this server and Binance's clocks (max allowed by Binance).
    const qs = new URLSearchParams({
      timestamp: Date.now().toString(),
      recvWindow: "60000",
    }).toString();
    const signature = sign(qs, apiSecret);

    if (isPerp) {
      const base = testnet ? PERP_TEST_V2 : PERP_PROD_V2;
      const res = await fetch(`${base}/balance?${qs}&signature=${signature}`, {
        headers: { "X-MBX-APIKEY": apiKey },
      });
      const data = await res.json();
      if (!res.ok) return NextResponse.json(data, { status: res.status });
      // futures balance: [{asset, balance, availableBalance, ...}]
      return NextResponse.json(
        (data as Array<Record<string, string>>)
          .filter((b) => parseFloat(b.balance) > 0)
          .map((b) => ({
            asset: b.asset,
            free: parseFloat(b.availableBalance),
            locked: parseFloat(b.balance) - parseFloat(b.availableBalance),
          })),
      );
    } else {
      const base = testnet ? SPOT_TEST : SPOT_PROD;
      const res = await fetch(`${base}/account?${qs}&signature=${signature}`, {
        headers: { "X-MBX-APIKEY": apiKey },
      });
      const data = await res.json() as { balances?: Array<Record<string, string>> };
      if (!res.ok) return NextResponse.json(data, { status: res.status });
      return NextResponse.json(
        (data.balances ?? [])
          .filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
          .map((b) => ({
            asset: b.asset,
            free: parseFloat(b.free),
            locked: parseFloat(b.locked),
          })),
      );
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
