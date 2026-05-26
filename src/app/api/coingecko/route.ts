import { NextResponse } from "next/server";

/**
 * CoinGecko proxy for crypto dominance and total market cap series.
 *
 * Free-tier constraints:
 *  - Max 365 days per request (>365 returns empty data).
 *  - No `interval=daily` param — CoinGecko auto-selects frequency from `days`.
 *  - ~30 req/min rate limit; sequential fetching + 1h server cache helps.
 *
 * Query: ?coin=bitcoin&days=365   → BTC dominance series (%)
 *        ?coin=total&days=365     → total market cap (USD)
 *        ?coin=total2&days=365    → total excluding BTC
 *        ?coin=total3&days=365    → total excluding BTC and ETH
 * Returns: { candles: Candle[] }
 */

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isFinal: boolean;
}

interface MarketChart {
  market_caps: Array<[number, number]>;
}

const CG_BASE = "https://api.coingecko.com/api/v3";

const TOP_COINS = [
  "bitcoin",
  "ethereum",
  "tether",
  "binancecoin",
  "solana",
];

async function fetchMarketCaps(coinId: string, days: number): Promise<Array<[number, number]>> {
  // No &interval=daily — free tier ignores it for >90 days and can return empty.
  const url = `${CG_BASE}/coins/${encodeURIComponent(coinId)}/market_chart` +
    `?vs_currency=usd&days=${days}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; chart-proxy/1.0)" },
      next: { revalidate: 3600 }, // 1h server cache to avoid rate limits
    });
    if (!res.ok) {
      console.error(`CoinGecko ${coinId} ${res.status}`);
      return [];
    }
    const data = (await res.json()) as MarketChart;
    return data.market_caps ?? [];
  } catch (err) {
    console.error(`CoinGecko ${coinId} fetch error`, err);
    return [];
  }
}

/** Build OHLC candles from a close-only value series.
 *  open = previous close so candle bodies reflect day-to-day change. */
function buildCandles(points: { time: number; value: number }[]): Candle[] {
  return points.map(({ time, value }, i) => {
    const t = Math.floor(time / 1000);
    const open = i === 0 ? value : points[i - 1].value;
    const close = value;
    return {
      time: t,
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
      volume: 0,
      isFinal: true,
    };
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const coin = url.searchParams.get("coin")?.trim().toLowerCase();
  // Hard-cap at 365 — free tier returns empty data for higher values.
  const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get("days") ?? "365", 10) || 365));
  if (!coin) return NextResponse.json({ error: "Missing coin" }, { status: 400 });

  try {
    const exclude: Set<string> =
      coin === "total"  ? new Set()
      : coin === "total2" ? new Set(["bitcoin"])
      : coin === "total3" ? new Set(["bitcoin", "ethereum"])
      : new Set();
    const isAggregate = coin === "total" || coin === "total2" || coin === "total3";

    if (isAggregate) {
      const ids = TOP_COINS.filter((c) => !exclude.has(c));
      // Sequential to stay within free-tier rate limit.
      const seriesById: Record<string, Array<[number, number]>> = {};
      for (const id of ids) {
        seriesById[id] = await fetchMarketCaps(id, days);
      }

      // Use the longest series as the time axis.
      const base = ids.reduce(
        (best, id) => (seriesById[id].length > best.length ? seriesById[id] : best),
        [] as Array<[number, number]>,
      );
      if (base.length === 0) {
        return NextResponse.json(
          { error: "CoinGecko returned no data (likely rate-limited)" },
          { status: 503 },
        );
      }

      const points = base.map(([time], i) => {
        let sum = 0;
        for (const id of ids) {
          const v = seriesById[id][i]?.[1];
          if (typeof v === "number" && isFinite(v)) sum += v;
        }
        return { time, value: sum };
      });
      return NextResponse.json({ candles: buildCandles(points) });
    }

    // Dominance for a specific coin: coin_cap / sum(top_N caps).
    // Fetch target coin first (required); top coins used for denominator.
    const coinSeries = await fetchMarketCaps(coin, days);
    if (coinSeries.length === 0) {
      return NextResponse.json(
        { error: "CoinGecko returned no data for this coin (likely rate-limited)" },
        { status: 503 },
      );
    }

    // Fetch top coins for the denominator (resilient — partial results are ok).
    const topSeriesById: Record<string, Array<[number, number]>> = {};
    for (const id of TOP_COINS) {
      if (id === coin) {
        topSeriesById[id] = coinSeries; // reuse, no extra request
      } else {
        topSeriesById[id] = await fetchMarketCaps(id, days);
      }
    }

    const points = coinSeries.map(([time, own], i) => {
      let total = 0;
      for (const id of TOP_COINS) {
        const v = topSeriesById[id][i]?.[1];
        if (typeof v === "number" && isFinite(v)) total += v;
      }
      // Fallback: if all top coins failed, use own cap as 100% proxy.
      if (total === 0) total = own;
      return { time, value: total > 0 ? (own / total) * 100 : 0 };
    });

    return NextResponse.json({ candles: buildCandles(points) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 500 },
    );
  }
}
