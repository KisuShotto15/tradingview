"use client";

import { create } from "zustand";

export interface ToastEntry {
  id: string;
  title: string;
  message?: string;
  variant: "alert" | "info";
  /** Auto-dismiss timestamp (ms). 0 = persistent. */
  expiresAt: number;
}

interface ToastState {
  toasts: ToastEntry[];
  push: (toast: Omit<ToastEntry, "id" | "expiresAt"> & { ttlMs?: number }) => void;
  dismiss: (id: string) => void;
}

const DEFAULT_TTL = 6000;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: ({ ttlMs, ...rest }) =>
    set((s) => ({
      toasts: [
        ...s.toasts,
        {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`,
          expiresAt: Date.now() + (ttlMs ?? DEFAULT_TTL),
          ...rest,
        },
      ],
    })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
