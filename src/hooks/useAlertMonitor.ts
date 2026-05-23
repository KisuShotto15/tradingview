"use client";

import { useEffect, useRef } from "react";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useAlertsStore } from "@/lib/store/alerts-store";
import { useToastStore } from "@/lib/alerts/toast-store";
import { playAlertSound } from "@/lib/alerts/sound";
import { useDrawings } from "@/lib/supabase/use-drawings";
import { formatPrice } from "@/lib/format";
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

  useEffect(() => {
    if (price === null) return;
    const prev = prevPriceRef.current;
    prevPriceRef.current = price;
    if (prev === null) return;

    // --- Drawing-attached alerts (hline / hray) ---
    for (const d of drawings) {
      if (d.symbol !== symbol || !d.alert?.enabled) continue;
      const level = priceLevelFor(d);
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

    // --- Standalone price alerts ---
    for (const a of alerts) {
      if (!a.enabled || a.symbol !== symbol) continue;

      // Expired?
      const now = Date.now();
      if (a.expiresAt && now > a.expiresAt) {
        disableAlert(a.id);
        continue;
      }

      const crossedUp = prev < a.value && price >= a.value;
      const crossedDown = prev > a.value && price <= a.value;

      const hit =
        (a.condition === "crossing" && (crossedUp || crossedDown)) ||
        (a.condition === "crossing-up" && crossedUp) ||
        (a.condition === "crossing-down" && crossedDown);

      if (!hit) continue;
      if (a.lastTriggeredAt && now - a.lastTriggeredAt < COOLDOWN_MS) continue;

      if (a.sound) playAlertSound();
      if (a.toast) {
        pushToast({
          title: a.message || `${symbol} alert triggered`,
          message: `Last: ${formatPrice(price)}`,
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

function priceLevelFor(d: Drawing): number | null {
  switch (d.kind) {
    case "hline":
      return d.price;
    case "hray":
      return d.anchor.price;
    default:
      return null;
  }
}
