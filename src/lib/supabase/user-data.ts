"use client";

import { createClient } from "./client";
import type { IndicatorConfig, IndicatorKey } from "@/lib/store/chart-store";
import type { Timeframe } from "@/lib/binance/types";

export interface CloudChartSettings {
  symbol: string;
  timeframe: Timeframe;
  indicators: Record<IndicatorKey, boolean>;
  hidden: Record<IndicatorKey, boolean>;
  config: IndicatorConfig;
}

// ─── Chart Settings ───────────────────────────────────────────────────────────

export async function loadChartSettings(): Promise<CloudChartSettings | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_chart_settings")
    .select("symbol, timeframe, indicators, hidden, config")
    .single();
  if (!data) return null;
  return data as CloudChartSettings;
}

export async function saveChartSettings(settings: CloudChartSettings) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("user_chart_settings").upsert(
    { user_id: user.id, ...settings, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
}

// ─── Watchlist ────────────────────────────────────────────────────────────────

export async function loadWatchlist(): Promise<string[] | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_watchlists")
    .select("symbols")
    .single();
  return data?.symbols ?? null;
}

export async function saveWatchlist(symbols: string[]) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("user_watchlists").upsert(
    { user_id: user.id, symbols, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
}
