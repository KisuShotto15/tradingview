import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { bybitGetPositions, BybitError } from "@/lib/exchanges/bybit";

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
    const exchange = url.searchParams.get("exchange") ?? "binance";

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    if (exchange === "bybit") {
      try {
        const positions = await bybitGetPositions({ apiKey, apiSecret, testnet }, symbol);
        return NextResponse.json(positions);
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
      liquidationPrice?: string;
      notional?: string;
      positionInitialMargin?: string;
      maintMargin?: string;
      isolatedMargin?: string;
      marginType?: string; // "isolated" | "cross"
      isolated?: boolean;
    };

    return NextResponse.json(
      (data as RawPosition[])
        .filter((p) => parseFloat(p.positionAmt) !== 0)
        .map((p) => {
          const positionAmt = parseFloat(p.positionAmt);
          const entryPrice = parseFloat(p.entryPrice);
          const markPrice = parseFloat(p.markPrice);
          const leverage = parseFloat(p.leverage);
          const unrealizedProfit = parseFloat(p.unRealizedProfit);
          const initialMargin = p.positionInitialMargin ? parseFloat(p.positionInitialMargin) : 0;
          // ROE% = unrealized P&L / initial margin, matching Binance's own
          // displayed percentage. Falls back to a naive price-delta * leverage
          // estimate only when the API doesn't report an initial margin (some
          // cross-margin responses), since that naive formula can be off by an
          // arbitrary factor — or even the wrong sign — once real margin,
          // fees, or funding diverge from the simple price-delta assumption.
          const percentage = initialMargin > 0
            ? (unrealizedProfit / initialMargin) * 100
            : entryPrice > 0
              ? ((markPrice - entryPrice) / entryPrice) * 100 * leverage * (positionAmt > 0 ? 1 : -1)
              : 0;
          return {
            symbol: p.symbol,
            positionAmt,
            entryPrice,
            markPrice,
            unrealizedProfit,
            percentage,
            leverage,
            side: positionAmt > 0 ? "LONG" : positionAmt < 0 ? "SHORT" : "BOTH",
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
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
