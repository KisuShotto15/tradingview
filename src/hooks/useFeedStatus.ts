"use client";

import { useEffect, useState } from "react";
import { resolveSource } from "@/lib/symbols/source";
import { getBinanceWS } from "@/lib/binance/ws";
import { getBybitWS } from "@/lib/bybit/ws";
import {
  chartTickAgeMs,
  CHART_TICK_STALE_MS,
  type FeedStatus,
} from "@/lib/feed-status";

export interface FeedInfo {
  /** Venue name for display ("Binance", "Bybit", "Yahoo", …). */
  source: string;
  status: FeedStatus;
  /** False for REST-poll sources, which have no socket to be live on. */
  streaming: boolean;
  /**
   * Socket open, but the charted symbol itself has gone quiet.
   *
   * Worth its own flag rather than folding into `status`: the socket really
   * is connected, so reporting it as down would be wrong — but reporting
   * "Live" while the chart sits still is what made this impossible to
   * diagnose from a screenshot in the first place.
   */
  stale: boolean;
}

const LABELS: Record<string, string> = {
  binance: "Binance",
  bybit: "Bybit",
  synthetic: "Synthetic",
  yahoo: "Yahoo",
  fred: "FRED",
  coingecko: "CoinGecko",
};

/**
 * Real connection state of the feed serving `symbol`.
 *
 * The status bar used to hardcode "Binance · Live" with a pulsing green dot,
 * which lied twice over: it named the wrong venue on a Bybit chart, and it
 * stayed green while the socket was dead — exactly when a user looks at it to
 * find out why the price stopped moving.
 */
export function useFeedStatus(symbol: string): FeedInfo {
  const kind = resolveSource(symbol).kind;
  const streaming = kind === "binance" || kind === "bybit";
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (kind === "binance") return getBinanceWS().statusFor(symbol).subscribe(setStatus);
    if (kind === "bybit") return getBybitWS().status.subscribe(setStatus);
    // REST-poll sources have no socket to subscribe to. Nothing is cleared
    // here on purpose — a stale value from the previously charted symbol is
    // masked below rather than written away in an effect.
  }, [kind, symbol]);

  // Polled rather than pushed: the tick clock is written several times a
  // second, and a render per tick to show a word that changes twice an hour
  // would be absurd.
  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(
      () => setStale(chartTickAgeMs() > CHART_TICK_STALE_MS),
      2000,
    );
    return () => clearInterval(id);
  }, [streaming, symbol]);

  // Gated rather than reset, so no effect has to write state to hide a value
  // that no longer applies.
  return {
    source: LABELS[kind] ?? kind,
    status: streaming ? status : "connecting",
    streaming,
    stale: streaming && status === "live" && stale,
  };
}
