import { NextResponse } from "next/server";
import { getPositions, readAccountParams } from "@/lib/exchanges/account";

/**
 * GET /api/trade/positions — single-resource read. Omitting `symbol` returns
 * every open position on the account.
 *
 * The 2s polling loop uses the batched `/api/trade/sync` instead; this route
 * remains for one-off refreshes after a user action (place / close / modify).
 * The actual work lives in `lib/exchanges/account` so both paths return
 * identical shapes.
 */
export async function GET(req: Request) {
  try {
    const { creds, symbol } = readAccountParams(req);
    if (!creds.apiKey || !creds.apiSecret) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }
    const res = await getPositions(creds, symbol);
    if (!res.ok) return NextResponse.json(res.body, { status: res.status });
    return NextResponse.json(res.data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
