import { NextResponse } from "next/server";
import { bybitSetTradingStop, BybitError } from "@/lib/exchanges/bybit";

/**
 * POST /api/trade/trading-stop
 *
 * Bybit exposes TP/SL as attributes of the position itself (not reduceOnly
 * orders like Binance). This route sets/clears them via /v5/position/trading-stop.
 * Binance handles TP/SL through the normal order route, so this is Bybit-only.
 */
interface Body {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
  symbol: string;
  tp?: number | null;
  sl?: number | null;
  positionIdx?: number;
}

export async function POST(req: Request) {
  try {
    const { apiKey, apiSecret, testnet, symbol, tp, sl, positionIdx } =
      (await req.json()) as Body;
    if (!apiKey || !apiSecret || !symbol) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }
    const result = await bybitSetTradingStop(
      { apiKey, apiSecret, testnet: !!testnet },
      symbol,
      { tp, sl, positionIdx },
    );
    return NextResponse.json(result);
  } catch (e) {
    const code = e instanceof BybitError ? e.code : -1;
    return NextResponse.json({ msg: String(e), code }, { status: 400 });
  }
}
