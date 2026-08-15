import { NextResponse } from "next/server";
import { bybitGetInstrumentPublic } from "@/lib/exchanges/bybit";

/**
 * GET /api/trade/exchange-info?symbol=BTCUSDT&testnet=true
 *
 * Passthrough to Binance Futures `/fapi/v1/exchangeInfo`. We cache the whole
 * payload for 1 h server-side (low churn — tick/step sizes only change on
 * exchange announcements) and slice out the requested symbol's filters so
 * the client gets a small, easy-to-consume shape.
 */

const PERP_PROD = "https://fapi.binance.com/fapi/v1";
const PERP_TEST = "https://testnet.binancefuture.com/fapi/v1";

interface BinanceFilter {
  filterType: string;
  tickSize?: string;
  stepSize?: string;
  notional?: string;
  minNotional?: string;
}

interface BinanceSymbol {
  symbol: string;
  status: string;
  pricePrecision: number;
  quantityPrecision: number;
  filters: BinanceFilter[];
}

interface BinanceExchangeInfo {
  symbols: BinanceSymbol[];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol")?.trim().toUpperCase();
  const testnet = url.searchParams.get("testnet") === "true";
  const exchange = url.searchParams.get("exchange") ?? "binance";
  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }

  if (exchange === "bybit") {
    try {
      const info = await bybitGetInstrumentPublic(testnet, true, symbol);
      return NextResponse.json(info);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "failed" },
        { status: 400 },
      );
    }
  }

  const base = testnet ? PERP_TEST : PERP_PROD;
  try {
    const res = await fetch(`${base}/exchangeInfo`, {
      // 1 h cache — exchangeInfo rarely changes.
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `exchangeInfo ${res.status}` },
        { status: res.status },
      );
    }
    const data = (await res.json()) as BinanceExchangeInfo;
    const s = data.symbols.find((x) => x.symbol === symbol);
    if (!s) {
      return NextResponse.json({ error: "Symbol not found" }, { status: 404 });
    }
    const priceFilter = s.filters.find((f) => f.filterType === "PRICE_FILTER");
    const lotFilter = s.filters.find((f) => f.filterType === "LOT_SIZE");
    const notional = s.filters.find(
      (f) => f.filterType === "MIN_NOTIONAL" || f.filterType === "NOTIONAL",
    );
    return NextResponse.json({
      symbol: s.symbol,
      status: s.status,
      pricePrecision: s.pricePrecision,
      quantityPrecision: s.quantityPrecision,
      tickSize: parseFloat(priceFilter?.tickSize ?? "0.01"),
      stepSize: parseFloat(lotFilter?.stepSize ?? "0.001"),
      minNotional: parseFloat(
        notional?.notional ?? notional?.minNotional ?? "5",
      ),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
