import { NextResponse } from "next/server";

/**
 * Yahoo Finance chart proxy.
 *
 * Yahoo's v8 chart endpoint is the same one the public Yahoo Finance website
 * uses. Free, unauthenticated, near-real-time for US listed stocks/futures.
 *
 * Query: ?symbol=AAPL&interval=1m&range=1d
 * Returns: { candles: Candle[] }
 */

interface YahooChart {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }>;
    error: unknown;
  };
}

/** Map our timeframe codes to Yahoo's accepted intervals. */
const TF_MAP: Record<string, string> = {
  "1m": "1m",
  "3m": "5m",   // Yahoo doesn't support 3m → use 5m
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "60m",
  "2h": "60m",  // Yahoo doesn't have 2h; client can resample if needed
  "4h": "60m",  // Same; closest available
  "6h": "1d",
  "8h": "1d",
  "12h": "1d",
  "1d": "1d",
  "3d": "1d",
  "1w": "1wk",
  "1M": "1mo",
};

/** Pick a Yahoo "range" suitable for the timeframe. */
function pickRange(interval: string): string {
  if (interval === "1m") return "7d";
  if (interval === "5m" || interval === "15m" || interval === "30m") return "60d";
  if (interval === "60m") return "730d";
  if (interval === "1d") return "10y";
  if (interval === "1wk" || interval === "1mo") return "max";
  return "1y";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol")?.trim();
  const interval = url.searchParams.get("interval") ?? "1d";
  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }

  const yfInterval = TF_MAP[interval] ?? interval;
  const range = pickRange(yfInterval);
  const yfUrl =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${yfInterval}&range=${range}&includePrePost=false`;

  try {
    const res = await fetch(yfUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; chart-proxy/1.0)" },
      // Yahoo allows public access but rejects no-UA. Cache 15s server-side so
      // rapid client polling does not hammer the upstream.
      next: { revalidate: 15 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Yahoo ${res.status}` },
        { status: res.status },
      );
    }
    const data = (await res.json()) as YahooChart;
    if (data.chart.error) {
      return NextResponse.json({ error: "Yahoo error" }, { status: 502 });
    }
    const r = data.chart.result?.[0];
    if (!r) return NextResponse.json({ candles: [] });

    const ts = r.timestamp ?? [];
    const q = r.indicators.quote?.[0];
    if (!q) return NextResponse.json({ candles: [] });

    const candles: Array<{
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      isFinal: boolean;
    }> = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i];
      const h = q.high?.[i];
      const l = q.low?.[i];
      const c = q.close?.[i];
      const v = q.volume?.[i] ?? 0;
      if (o == null || h == null || l == null || c == null) continue;
      candles.push({
        time: ts[i],
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v ?? 0,
        isFinal: true,
      });
    }
    // Public market data, identical for every viewer — let the CDN answer
    // repeat polls (the client re-polls this every 5s) instead of invoking
    // the function each time. Matches the 15s upstream revalidate above.
    return NextResponse.json(
      { candles },
      {
        headers: {
          "Cache-Control": "public, max-age=5, s-maxage=15, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 500 },
    );
  }
}
