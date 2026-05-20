import crypto from "node:crypto";
import { NextResponse } from "next/server";
import type { PlaceOrderParams, CancelOrderParams } from "@/lib/binance/trading-types";

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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PlaceOrderParams;
    const { apiKey, apiSecret, testnet, isPerp, ...rest } = body;
    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    const params: Record<string, string> = {
      symbol: rest.symbol,
      side: rest.side,
      type: rest.type,
      quantity: rest.quantity,
      timestamp: Date.now().toString(),
    };
    if (rest.price) params.price = rest.price;
    if (rest.stopPrice) params.stopPrice = rest.stopPrice;
    if (rest.timeInForce) params.timeInForce = rest.timeInForce;
    if (isPerp) {
      if (rest.reduceOnly) params.reduceOnly = "true";
      if (rest.closePosition) params.closePosition = "true";
      if (rest.workingType) params.workingType = rest.workingType;
    }

    const qs = new URLSearchParams(params).toString();
    const signature = sign(qs, apiSecret);
    const url = `${base(isPerp, testnet)}/order?${qs}&signature=${signature}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "X-MBX-APIKEY": apiKey },
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = (await req.json()) as CancelOrderParams;
    const { apiKey, apiSecret, testnet, isPerp, symbol, orderId } = body;
    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    const qs = new URLSearchParams({
      symbol,
      orderId: String(orderId),
      timestamp: Date.now().toString(),
    }).toString();
    const signature = sign(qs, apiSecret);
    const url = `${base(isPerp, testnet)}/order?${qs}&signature=${signature}`;

    const res = await fetch(url, {
      method: "DELETE",
      headers: { "X-MBX-APIKEY": apiKey },
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
