"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AlertCondition = "crossing" | "crossing-up" | "crossing-down";
export type AlertTrigger = "once" | "every";

export interface PriceAlert {
  id: string;
  symbol: string;
  condition: AlertCondition;
  value: number;
  trigger: AlertTrigger;
  expiresAt: number | null;
  message: string;
  sound: boolean;
  toast: boolean;
  enabled: boolean;
  createdAt: number;
  lastTriggeredAt?: number;
}

interface AlertsState {
  alerts: PriceAlert[];
  addAlert: (alert: Omit<PriceAlert, "id" | "createdAt" | "enabled">) => string;
  removeAlert: (id: string) => void;
  updateAlert: (id: string, patch: Partial<PriceAlert>) => void;
  toggleAlert: (id: string) => void;
  disableAlert: (id: string) => void;
}

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set) => ({
      alerts: [],
      addAlert: (alert) => {
        const id = genId();
        set((s) => ({
          alerts: [...s.alerts, { ...alert, id, createdAt: Date.now(), enabled: true }],
        }));
        return id;
      },
      removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
      updateAlert: (id, patch) =>
        set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
      toggleAlert: (id) =>
        set((s) => ({
          alerts: s.alerts.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
        })),
      disableAlert: (id) =>
        set((s) => ({
          alerts: s.alerts.map((a) => (a.id === id ? { ...a, enabled: false } : a)),
        })),
    }),
    { name: "tv-gratis-alerts", version: 1 }
  )
);
