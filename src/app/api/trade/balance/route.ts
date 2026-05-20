import crypto from "node:crypto";
import { NextResponse } from "next/server";

const SPOT_PROD = "https://api.binance.com/api/v3";
const SPOT_TEST = "https://testnet.binance.vision/api/v3";
const PERP_PROD = "https://fapi.binance.com/fapi/v1";
const PERP_TEST = "https://testnet.binancefuture.com/fapi/v1";

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

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    const qs = new URLSearchParams({ timestamp: Date.now().toString() }).toString();
    const signature = sign(qs, apiSecret);

    if (isPerp) {
      const base = testnet ? PERP_TEST : PERP_PROD;
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
