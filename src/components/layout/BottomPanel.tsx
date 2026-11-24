"use client";

import { useEffect, useState } from "react";
import { useChartStore } from "@/lib/store/chart-store";
import { fetchTicker24h } from "@/lib/binance/rest";
import { fetchBybitTicker24h } from "@/lib/bybit/public";
import { resolveSource } from "@/lib/symbols/source";
import type { Ticker24h } from "@/lib/binance/types";
import { formatPrice, formatPct, formatVolume } from "@/lib/format";
import { useFeedStatus } from "@/hooks/useFeedStatus";
import { cn } from "@/lib/utils";

/** Slow on purpose: these are 24h aggregates, and the live price comes off the
 *  WebSocket. It used to re-poll every 5s, in a backgrounded tab too. */
const POLL_MS = 30_000;

export function BottomPanel() {
  const symbol = useChartStore((s) => s.symbol);
  // Keyed by the symbol it was fetched for, so switching symbols shows dashes
  // without an effect having to clear state (which cascades a render).
  const [t, setT] = useState<{ symbol: string; data: Ticker24h } | null>(null);
  const feed = useFeedStatus(symbol);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Dispatch by source: `fetchTicker24h` is Binance-only, and `cleanSym`
    // strips the BYBIT: prefix, so a Bybit perp used to silently show the
    // *Binance spot* 24h stats for the same ticker.
    const kind = resolveSource(symbol).kind;
    const fetcher =
      kind === "binance"
        ? fetchTicker24h
        : kind === "bybit"
          ? fetchBybitTicker24h
          : null;

    const load = () => {
      // Other sources have no 24h endpoint here; dashes beat another venue's
      // numbers presented as this symbol's.
      if (!fetcher) return;
      fetcher(symbol)
        .then((x) => {
          if (!cancelled) setT({ symbol, data: x });
        })
        .catch(console.error);
    };

    const schedule = () => {
      if (cancelled || document.hidden) return;
      timer = setTimeout(() => {
        timer = null;
        load();
        schedule();
      }, POLL_MS);
    };

    const stop = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    // Same visibility discipline as the account poll: a hidden tab pays for
    // nothing and refreshes immediately on foreground.
    const onVisibility = () => {
      stop();
      if (!document.hidden) {
        load();
        schedule();
      }
    };

    load();
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [symbol]);

  const upClass = (n: number) => (n >= 0 ? "text-tv-green" : "text-tv-red");
  const stats = t && t.symbol === symbol ? t.data : null;

  return (
    <div className="flex h-9 items-center gap-0 border-t border-tv-border bg-tv-panel px-3 text-xs">
      <Stat label="Symbol" value={symbol} />
      <Stat
        label="24h Change"
        value={stats ? formatPct(stats.priceChangePercent) : "—"}
        valueClass={stats ? upClass(stats.priceChangePercent) : ""}
      />
      <Stat
        label="24h High"
        value={stats ? formatPrice(stats.highPrice) : "—"}
        valueClass="text-tv-green"
      />
      <Stat
        label="24h Low"
        value={stats ? formatPrice(stats.lowPrice) : "—"}
        valueClass="text-tv-red"
      />
      <Stat
        label="24h Vol (base)"
        value={stats ? formatVolume(stats.volume) : "—"}
      />
      <Stat
        label="24h Vol (USDT)"
        value={stats ? formatVolume(stats.quoteVolume) : "—"}
      />
      <div className="ml-auto flex items-center gap-2 text-[10px] text-tv-text-dim">
        <span
          className={cn(
            "inline-flex h-1.5 w-1.5 rounded-full",
            !feed.streaming
              ? "bg-tv-text-dim"
              : feed.stale
                ? "bg-tv-yellow"
                : feed.status === "live"
                  ? "animate-pulse bg-tv-green"
                : feed.status === "connecting"
                  ? "animate-pulse bg-tv-yellow"
                  : "bg-tv-red",
          )}
        />
        <span>
          {feed.source} ·{" "}
          {!feed.streaming
            ? "Delayed"
            : feed.stale
              ? "No ticks"
              : feed.status === "live"
                ? "Live"
              : feed.status === "connecting"
                ? "Reconnecting"
                : "Offline"}
        </span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 border-r border-tv-border px-3">
      <span className="text-tv-text-dim">{label}</span>
      <span className={cn("font-medium tabular-nums", valueClass ?? "text-tv-text")}>
        {value}
      </span>
    </div>
  );
}
