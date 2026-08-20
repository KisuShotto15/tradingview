import { NextResponse } from "next/server";

/**
 * FRED (Federal Reserve Economic Data) proxy.
 *
 * Uses the public fredgraph.csv endpoint which does NOT require an API key.
 * Returns observations as a candle series (open=high=low=close=value, vol=0).
 *
 * Most FRED series are daily/weekly/monthly. Higher-frequency requests are
 * served at the series' native frequency — the client should not assume 1m.
 *
 * Query: ?series=M2SL
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

/** Parse a CSV row like `2024-03-04,21134.5` into [date, value]. */
function parseRow(line: string): [string, number] | null {
  const parts = line.split(",");
  if (parts.length < 2) return null;
  const date = parts[0]?.trim();
  const raw = parts[1]?.trim();
  if (!date || !raw || raw === ".") return null;
  const value = parseFloat(raw);
  if (!isFinite(value)) return null;
  return [date, value];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const series = url.searchParams.get("series")?.trim().toUpperCase();
  if (!series) {
    return NextResponse.json({ error: "Missing series" }, { status: 400 });
  }

  const csvUrl = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(series)}`;

  try {
    const res = await fetch(csvUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; chart-proxy/1.0)" },
      // FRED data is updated at most daily — cache server-side for 12h.
      next: { revalidate: 43200 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `FRED ${res.status}` },
        { status: res.status },
      );
    }
    const text = await res.text();
    const lines = text.split("\n");
    const candles: Candle[] = [];
    // First line is the header `observation_date,SERIES_ID`
    for (let i = 1; i < lines.length; i++) {
      const parsed = parseRow(lines[i]);
      if (!parsed) continue;
      const [date, value] = parsed;
      // FRED gives dates as YYYY-MM-DD (UTC midnight).
      const time = Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
      // lightweight-charts requires positive UTC timestamps (post-1970).
      if (!isFinite(time) || time <= 0) continue;
      candles.push({
        time,
        open: value,
        high: value,
        low: value,
        close: value,
        volume: 0,
        isFinal: true,
      });
    }
    // FRED publishes at most daily — let the CDN serve repeat hits.
    return NextResponse.json(
      { candles },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400",
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
