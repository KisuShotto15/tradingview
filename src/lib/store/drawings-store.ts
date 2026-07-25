"use client";

import { create } from "zustand";
import type { Drawing } from "@/lib/drawings/types";

export type PlacementPhase = "idle" | "placing";

export interface PlacementState {
  /** Drawing being built (null when idle) */
  draft: Drawing | null;
  /** Number of points already placed */
  step: number;
  /** Total points needed for current tool */
  pointsNeeded: number;
}

export const INITIAL_PLACEMENT: PlacementState = {
  draft: null,
  step: 0,
  pointsNeeded: 0,
};

interface DrawingsState {
  /** All drawings across all symbols */
  drawings: Drawing[];
  /** Currently selected drawing id (null = none) */
  selectedId: string | null;
  /** Drawing whose settings dialog is open (null = closed) */
  editingId: string | null;
  /** In-progress drawing placement */
  placement: PlacementState;

  // Actions
  setDrawings: (drawings: Drawing[]) => void;
  addDrawing: (d: Drawing) => void;
  updateDrawing: (id: string, patch: Partial<Drawing>) => void;
  removeDrawing: (id: string) => void;
  clearDrawings: (symbol?: string) => void;
  /** Move a drawing within its same-symbol siblings' stacking order. */
  moveDrawing: (
    id: string,
    direction: "front" | "back" | "forward" | "backward",
  ) => void;
  /** Reorder a symbol's drawings to match `orderedIds` (used by undo/redo). */
  applyOrderForSymbol: (symbol: string, orderedIds: string[]) => void;
  setSelected: (id: string | null) => void;
  setEditing: (id: string | null) => void;

  setPlacement: (placement: PlacementState) => void;
  resetPlacement: () => void;
}

export const useDrawingsStore = create<DrawingsState>()((set, get) => ({
  drawings: [],
  selectedId: null,
  editingId: null,
  placement: INITIAL_PLACEMENT,

  setDrawings: (drawings) => set({ drawings }),
  addDrawing: (d) => set((s) => ({ drawings: [...s.drawings, d] })),
  updateDrawing: (id, patch) =>
    set((s) => ({
      drawings: s.drawings.map((d) =>
        d.id === id ? ({ ...d, ...patch } as Drawing) : d,
      ),
    })),
  removeDrawing: (id) =>
    set((s) => ({
      drawings: s.drawings.filter((d) => d.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),
  clearDrawings: (symbol) =>
    set((s) => ({
      drawings: symbol
        ? s.drawings.filter((d) => d.symbol !== symbol)
        : [],
      selectedId: null,
    })),
  applyOrderForSymbol: (symbol, orderedIds) =>
    set((s) => {
      // Slots (array indices) occupied by this symbol's drawings, in array order.
      const slots: number[] = [];
      s.drawings.forEach((d, i) => {
        if (d.symbol === symbol) slots.push(i);
      });
      const byId = new Map(s.drawings.map((d) => [d.id, d] as const));
      const next = [...s.drawings];
      orderedIds.forEach((id, k) => {
        const d = byId.get(id);
        if (d && slots[k] !== undefined) next[slots[k]] = d;
      });
      // z mirrors the final array index so the order survives a reload.
      return { drawings: next.map((d, i) => ({ ...d, z: i }) as Drawing) };
    }),
  moveDrawing: (id, direction) => {
    const s = get();
    const target = s.drawings.find((d) => d.id === id);
    if (!target) return;
    // Same-symbol siblings in array order (last = front-most / on top).
    const ids = s.drawings.filter((d) => d.symbol === target.symbol).map((d) => d.id);
    const from = ids.indexOf(id);
    let to = from;
    if (direction === "forward") to = Math.min(ids.length - 1, from + 1);
    else if (direction === "backward") to = Math.max(0, from - 1);
    else if (direction === "front") to = ids.length - 1;
    else if (direction === "back") to = 0;
    if (to === from) return;
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    get().applyOrderForSymbol(target.symbol, ids);
  },
  setSelected: (selectedId) => set({ selectedId }),
  setEditing: (editingId) => set({ editingId }),

  setPlacement: (placement) => set({ placement }),
  resetPlacement: () => set({ placement: INITIAL_PLACEMENT }),
}));
