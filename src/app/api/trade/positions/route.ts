import crypto from "node:crypto";
import { NextResponse } from "next/server";

const PERP_PROD = "https://fapi.binance.com/fapi/v2";
const PERP_TEST = "https://testnet.binancefuture.com/fapi/v2";

function sign(data: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const apiKey = url.searchParams.get("apiKey") ?? "";
    const apiSecret = url.searchParams.get("apiSecret") ?? "";
    const testnet = url.searchParams.get("testnet") === "true";
    const symbol = url.searchParams.get("symbol") ?? "";

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    const params: Record<string, string> = { timestamp: Date.now().toString() };
    if (symbol) params.symbol = symbol;
    const qs = new URLSearchParams(params).toString();
    const signature = sign(qs, apiSecret);
    const base = testnet ? PERP_TEST : PERP_PROD;
    const res = await fetch(`${base}/positionRisk?${qs}&signature=${signature}`, {
      headers: { "X-MBX-APIKEY": apiKey },
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });

    type RawPosition = {
      symbol: string;
      positionAmt: string;
      entryPrice: string;
      markPrice: string;
      unRealizedProfit: string;
      leverage: string;
      positionSide: string;
    };

    return NextResponse.json(
      (data as RawPosition[])
        .filter((p) => parseFloat(p.positionAmt) !== 0)
        .map((p) => ({
          symbol: p.symbol,
          positionAmt: parseFloat(p.positionAmt),
          entryPrice: parseFloat(p.entryPrice),
          markPrice: parseFloat(p.markPrice),
          unrealizedProfit: parseFloat(p.unRealizedProfit),
          percentage:
            ((parseFloat(p.markPrice) - parseFloat(p.entryPrice)) /
              parseFloat(p.entryPrice)) *
            100 *
            parseFloat(p.leverage) *
            (parseFloat(p.positionAmt) > 0 ? 1 : -1),
          leverage: parseFloat(p.leverage),
          side:
            parseFloat(p.positionAmt) > 0
              ? "LONG"
              : parseFloat(p.positionAmt) < 0
                ? "SHORT"
                : "BOTH",
        })),
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
