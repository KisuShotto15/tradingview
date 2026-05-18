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
  setSelected: (id: string | null) => void;
  setEditing: (id: string | null) => void;

  setPlacement: (placement: PlacementState) => void;
  resetPlacement: () => void;
}

export const useDrawingsStore = create<DrawingsState>()((set) => ({
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
  setSelected: (selectedId) => set({ selectedId }),
  setEditing: (editingId) => set({ editingId }),

  setPlacement: (placement) => set({ placement }),
  resetPlacement: () => set({ placement: INITIAL_PLACEMENT }),
}));
