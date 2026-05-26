import { NextResponse } from "next/server";

/**
 * CoinGecko proxy for crypto dominance and total market cap series.
 *
 * Implementation notes:
 *  - CoinGecko's free `/global` endpoint gives CURRENT dominance percentages.
 *  - For historical dominance we approximate it as
 *        coin_market_cap[t] / SUM(top_N_coins_market_cap[t])
 *    using each coin's `/coins/{id}/market_chart` series. The top-N set is the
 *    top 10 by current cap which captures ≥ 90% of total market cap.
 *  - For "total", "total2", "total3" we return the summed top-N series with the
 *    respective exclusions.
 *
 * Query: ?coin=bitcoin&days=365            → BTC dominance series (%)
 *        ?coin=total&days=365              → total market cap (USD)
 *        ?coin=total2&days=365             → total mcap excluding BTC
 *        ?coin=total3&days=365             → total mcap excluding BTC and ETH
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

/** Top-N coin IDs used to approximate total crypto market cap.
 *  Kept small (5) to stay within CoinGecko free-tier rate limits. These 5
 *  represent ~80% of total crypto market cap. */
const TOP_COINS = [
  "bitcoin",
  "ethereum",
  "tether",
  "binancecoin",
  "solana",
];

async function fetchMarketCaps(coinId: string, days: number): Promise<Array<[number, number]>> {
  const url = `${CG_BASE}/coins/${encodeURIComponent(coinId)}/market_chart` +
    `?vs_currency=usd&days=${days}&interval=daily`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; chart-proxy/1.0)" },
      next: { revalidate: 300 }, // 5 min server cache
    });
    if (!res.ok) {
      // Rate limited or other error: return empty so the aggregator skips this coin.
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

/** Align multiple series on their common timestamps (CoinGecko uses ms epochs). */
function alignSeries(
  seriesById: Record<string, Array<[number, number]>>,
): { time: number; values: Record<string, number> }[] {
  const ids = Object.keys(seriesById);
  if (ids.length === 0) return [];
  // Use the first series as the time axis; others are looked up by index since
  // CoinGecko returns aligned daily samples.
  const base = seriesById[ids[0]];
  const out: { time: number; values: Record<string, number> }[] = [];
  for (let i = 0; i < base.length; i++) {
    const t = base[i][0];
    const values: Record<string, number> = {};
    let ok = true;
    for (const id of ids) {
      const point = seriesById[id][i];
      if (!point || typeof point[1] !== "number") {
        ok = false;
        break;
      }
      values[id] = point[1];
    }
    if (ok) out.push({ time: t, values });
  }
  return out;
}

/** Build a proper OHLC candle series from a flat close-only value series.
 *  Each candle's open = previous close, so bodies reflect day-to-day movement. */
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
  const days = Math.max(1, Math.min(3650, parseInt(url.searchParams.get("days") ?? "365", 10) || 365));
  if (!coin) return NextResponse.json({ error: "Missing coin" }, { status: 400 });

  try {
    // For total/total2/total3 we sum the top-N coin caps (with exclusions).
    const exclude: Set<string> =
      coin === "total" ? new Set()
      : coin === "total2" ? new Set(["bitcoin"])
      : coin === "total3" ? new Set(["bitcoin", "ethereum"])
      : new Set();
    const isAggregate = coin === "total" || coin === "total2" || coin === "total3";

    if (isAggregate) {
      const ids = TOP_COINS.filter((c) => !exclude.has(c));
      const seriesById: Record<string, Array<[number, number]>> = {};
      // Sequential fetch (not parallel) to avoid burst rate-limiting on the
      // CoinGecko free tier.
      for (const id of ids) {
        seriesById[id] = await fetchMarketCaps(id, days);
      }
      const aligned = alignSeries(seriesById);
      const points = aligned.map(({ time, values }) => {
        let sum = 0;
        for (const id of ids) sum += values[id] ?? 0;
        return { time, value: sum };
      });
      const candles = buildCandles(points);
      return NextResponse.json({ candles });
    }

    // Dominance series for a specific coin: caps[coin] / sum(top_N caps)
    const ids = Array.from(new Set([coin, ...TOP_COINS]));
    const seriesById: Record<string, Array<[number, number]>> = {};
    for (const id of ids) {
      seriesById[id] = await fetchMarketCaps(id, days);
    }
    const aligned = alignSeries(seriesById);
    if (aligned.length === 0) {
      return NextResponse.json(
        { error: "CoinGecko returned no data (likely rate-limited)" },
        { status: 503 },
      );
    }
    const points = aligned.map(({ time, values }) => {
      let total = 0;
      for (const id of TOP_COINS) total += values[id] ?? 0;
      const own = values[coin] ?? 0;
      return { time, value: total > 0 ? (own / total) * 100 : 0 };
    });
    const candles = buildCandles(points);
    return NextResponse.json({ candles });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 500 },
    );
  }
}
