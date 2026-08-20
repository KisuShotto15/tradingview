import { NextResponse } from "next/server";
import { getBalance, readAccountParams } from "@/lib/exchanges/account";

/**
 * GET /api/trade/balance — single-resource read.
 *
 * The 2s polling loop uses the batched `/api/trade/sync` instead; this route
 * remains for one-off refreshes after a user action (connecting API keys,
 * placing/closing an order). The actual work lives in `lib/exchanges/account`
 * so both paths return identical shapes.
 */
export async function GET(req: Request) {
  try {
    const { creds, isPerp } = readAccountParams(req);
    if (!creds.apiKey || !creds.apiSecret) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }
    const res = await getBalance(creds, isPerp);
    if (!res.ok) return NextResponse.json(res.body, { status: res.status });
    return NextResponse.json(res.data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
