import { NextResponse } from "next/server";

/**
 * CoinGecko proxy for crypto dominance and total market cap series.
 *
 * Free-tier constraints:
 *  - Max 365 days per request (>365 returns empty data).
 *  - No &interval=daily — auto-selected by CoinGecko based on `days`.
 *  - ~30 req/min; sequential fetching + 1h server-side cache.
 *
 * Denominator correction:
 *  Our denominator (sum of top-5 coins) underestimates the real total market cap
 *  (~80% coverage). We fetch the current true total from /global (free) and compute
 *  a coverage factor, then scale every historical denominator point by it so the
 *  computed dominance matches the real value at the current moment and is
 *  proportionally correct historically.
 *
 * Query: ?coin=bitcoin&days=365   → BTC dominance series (%)
 *        ?coin=total&days=365     → total market cap (USD)
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

interface GlobalData {
  data: {
    total_market_cap: { usd: number };
  };
}

const CG_BASE = "https://api.coingecko.com/api/v3";

// Top-5 coins used for the denominator approximation.
const TOP_COINS = ["bitcoin", "ethereum", "tether", "binancecoin", "solana"];

async function fetchMarketCaps(coinId: string, days: number): Promise<Array<[number, number]>> {
  const url = `${CG_BASE}/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${days}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; chart-proxy/1.0)" },
      next: { revalidate: 3600 },
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

/** Fetch the true total market cap in USD right now (free /global endpoint). */
async function fetchTotalMarketCapNow(): Promise<number> {
  try {
    const res = await fetch(`${CG_BASE}/global`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; chart-proxy/1.0)" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as GlobalData;
    return data.data?.total_market_cap?.usd ?? 0;
  } catch {
    return 0;
  }
}

/** Build OHLC candles from a close-only series. open = previous close. */
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

    // Fetch the actual total market cap now for denominator correction.
    const actualTotalNow = await fetchTotalMarketCapNow();

    if (isAggregate) {
      const ids = TOP_COINS.filter((c) => !exclude.has(c));
      const seriesById: Record<string, Array<[number, number]>> = {};
      for (const id of ids) {
        seriesById[id] = await fetchMarketCaps(id, days);
      }

      // Longest series is the time axis.
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

      // For TOTAL we return the raw sum corrected to actual total market cap.
      // Coverage factor: what fraction of total our top-N currently represents.
      const top5SumNow = ids.reduce((sum, id) => {
        const s = seriesById[id];
        return sum + (s[s.length - 1]?.[1] ?? 0);
      }, 0);
      const coverageFactor = actualTotalNow > 0 && top5SumNow > 0
        ? top5SumNow / actualTotalNow
        : 0.80;

      const points = base.map(([time], i) => {
        let sum = 0;
        for (const id of ids) {
          const v = seriesById[id][i]?.[1];
          if (typeof v === "number" && isFinite(v)) sum += v;
        }
        return { time, value: sum / coverageFactor };
      });
      return NextResponse.json({ candles: buildCandles(points) });
    }

    // --- Dominance for a specific coin ---
    const coinSeries = await fetchMarketCaps(coin, days);
    if (coinSeries.length === 0) {
      return NextResponse.json(
        { error: "CoinGecko returned no data for this coin (likely rate-limited)" },
        { status: 503 },
      );
    }

    const topSeriesById: Record<string, Array<[number, number]>> = {};
    for (const id of TOP_COINS) {
      topSeriesById[id] = id === coin ? coinSeries : await fetchMarketCaps(id, days);
    }

    // Compute the coverage factor from the most recent data point.
    const top5SumNow = TOP_COINS.reduce((sum, id) => {
      const s = topSeriesById[id];
      return sum + (s[s.length - 1]?.[1] ?? 0);
    }, 0);
    // coverageFactor: fraction of true total that our top-5 sum represents now.
    const coverageFactor = actualTotalNow > 0 && top5SumNow > 0
      ? top5SumNow / actualTotalNow
      : 0.80;

    const points = coinSeries.map(([time, own], i) => {
      let top5Sum = 0;
      for (const id of TOP_COINS) {
        const v = topSeriesById[id][i]?.[1];
        if (typeof v === "number" && isFinite(v)) top5Sum += v;
      }
      // Scale denominator up to estimated total market cap.
      const estimatedTotal = top5Sum / coverageFactor;
      return { time, value: estimatedTotal > 0 ? (own / estimatedTotal) * 100 : 0 };
    });

    return NextResponse.json({ candles: buildCandles(points) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 500 },
    );
  }
}
