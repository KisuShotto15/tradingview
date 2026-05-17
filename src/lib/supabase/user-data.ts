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

export interface CloudPriceLine {
  id: string;
  symbol: string;
  price: number;
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

// ─── Price Lines ──────────────────────────────────────────────────────────────

export async function loadPriceLines(): Promise<CloudPriceLine[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_price_lines")
    .select("id, symbol, price");
  return (data ?? []) as CloudPriceLine[];
}

export async function addPriceLineCloud(symbol: string, price: number): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("user_price_lines")
    .insert({ user_id: user.id, symbol, price })
    .select("id")
    .single();
  return data?.id ?? null;
}

export async function removePriceLineCloud(id: string) {
  const supabase = createClient();
  await supabase.from("user_price_lines").delete().eq("id", id);
}

export async function clearPriceLinesCloud(symbol?: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const q = supabase.from("user_price_lines").delete().eq("user_id", user.id);
  if (symbol) q.eq("symbol", symbol);
  await q;
}
