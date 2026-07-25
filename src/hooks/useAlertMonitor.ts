"use client";

import { useEffect, useRef } from "react";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useAlertsStore } from "@/lib/store/alerts-store";
import { useToastStore } from "@/lib/alerts/toast-store";
import { playAlertSound } from "@/lib/alerts/sound";
import { useDrawings } from "@/lib/supabase/use-drawings";
import { formatPrice } from "@/lib/format";
import { candlesRef as globalCandlesRef } from "@/lib/chart/candles-ref";
import { rsi, macd } from "@/lib/indicators";
import { useChartStore } from "@/lib/store/chart-store";
import { conditionHit, priceLevelFor } from "@/lib/alerts/alert-eval";
import type { Drawing } from "@/lib/drawings/types";

const COOLDOWN_MS = 30_000;

export function useAlertMonitor(symbol: string, price: number | null) {
  const drawings = useDrawingsStore((s) => s.drawings);
  const alerts = useAlertsStore((s) => s.alerts);
  const updateAlert = useAlertsStore((s) => s.updateAlert);
  const disableAlert = useAlertsStore((s) => s.disableAlert);
  const pushToast = useToastStore((s) => s.push);
  const { update } = useDrawings();
  const prevPriceRef = useRef<number | null>(null);
  // Previous indicator reading per alert id, for tick-to-tick crossing detection.
  const prevIndicatorRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (price === null) return;
    const prev = prevPriceRef.current;
    prevPriceRef.current = price;
    if (prev === null) return;

    // Latest bar time — used to evaluate sloped lines (trend line / ray) at "now".
    const candles = globalCandlesRef.current;
    const nowTime = candles.length ? candles[candles.length - 1].time : null;

    // --- Drawing-attached alerts (hline / hray / trend line / ray) ---
    for (const d of drawings) {
      if (d.symbol !== symbol || !d.alert?.enabled) continue;
      const level = priceLevelFor(d, nowTime);
      if (level === null) continue;

      const crossedUp = prev < level && price >= level;
      const crossedDown = prev > level && price <= level;
      const direction = d.alert.direction;

      const hit =
        (direction === "cross" && (crossedUp || crossedDown)) ||
        (direction === "cross-up" && crossedUp) ||
        (direction === "cross-down" && crossedDown);

      if (!hit) continue;

      const now = Date.now();
      if (d.alert.lastTriggeredAt && now - d.alert.lastTriggeredAt < COOLDOWN_MS) continue;

      if (d.alert.sound) playAlertSound();
      pushToast({
        title: `${symbol} crossed ${formatPrice(level)}`,
        message: `Last: ${formatPrice(price)}`,
        variant: "alert",
      });

      void update(d.id, {
        alert: { ...d.alert, lastTriggeredAt: now },
      } as Partial<Drawing>);
    }

    // --- Standalone alerts (price / RSI / MACD) ---
    // Compute indicator series once, only if some active alert needs them.
    const cfg = useChartStore.getState().config;
    const wants = (src: string) =>
      alerts.some((a) => a.enabled && a.symbol === symbol && (a.source ?? "price") === src);

    const rsiSeries = wants("rsi") ? rsi(candles, cfg.rsi) : [];
    const rsiCurr = rsiSeries.length ? rsiSeries[rsiSeries.length - 1].value : null;
    const macdSeries = wants("macd")
      ? macd(candles, cfg.macdFast, cfg.macdSlow, cfg.macdSignal)
      : [];
    // MACD line vs signal line == histogram; a zero-cross is a signal cross.
    const macdCurr = macdSeries.length ? macdSeries[macdSeries.length - 1].histogram : null;

    for (const a of alerts) {
      if (!a.enabled || a.symbol !== symbol) continue;

      const now = Date.now();
      if (a.expiresAt && now > a.expiresAt) {
        disableAlert(a.id);
        continue;
      }

      const source = a.source ?? "price";
      let hit = false;
      let detail = `Last: ${formatPrice(price)}`;

      if (source === "price") {
        hit = conditionHit(a.condition, prev < a.value && price >= a.value, prev > a.value && price <= a.value);
      } else if (source === "rsi" && rsiCurr !== null) {
        const p = prevIndicatorRef.current[a.id] ?? rsiCurr;
        prevIndicatorRef.current[a.id] = rsiCurr;
        hit = conditionHit(a.condition, p < a.value && rsiCurr >= a.value, p > a.value && rsiCurr <= a.value);
        detail = `RSI: ${rsiCurr.toFixed(1)}`;
      } else if (source === "macd" && macdCurr !== null) {
        // Cross of MACD over/under its signal line == histogram crossing zero.
        const p = prevIndicatorRef.current[a.id] ?? macdCurr;
        prevIndicatorRef.current[a.id] = macdCurr;
        hit = conditionHit(a.condition, p < 0 && macdCurr >= 0, p > 0 && macdCurr <= 0);
        detail = `MACD ${macdCurr >= 0 ? "above" : "below"} signal`;
      }

      if (!hit) continue;
      if (a.lastTriggeredAt && now - a.lastTriggeredAt < COOLDOWN_MS) continue;

      if (a.sound) playAlertSound();
      if (a.toast) {
        pushToast({
          title: a.message || `${symbol} alert triggered`,
          message: detail,
          variant: "alert",
        });
      }

      if (a.trigger === "once") {
        disableAlert(a.id);
      } else {
        updateAlert(a.id, { lastTriggeredAt: now });
      }
    }
  }, [price, drawings, alerts, symbol, pushToast, update, updateAlert, disableAlert]);
}
