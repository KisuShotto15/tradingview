import { NextResponse } from "next/server";
import { bybitIsHedgeMode, BybitError } from "@/lib/exchanges/bybit";

/** Whether the given symbol is in Bybit hedge mode. Binance isn't handled by
 *  this app's trading UI, so it always reports one-way. */
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
    if (!symbol) {
      return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
    }

    if (exchange === "bybit") {
      try {
        const hedge = await bybitIsHedgeMode({ apiKey, apiSecret, testnet }, symbol);
        return NextResponse.json({ hedge });
      } catch (e) {
        const code = e instanceof BybitError ? e.code : -1;
        return NextResponse.json({ msg: String(e), code }, { status: 400 });
      }
    }

    return NextResponse.json({ hedge: false });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
