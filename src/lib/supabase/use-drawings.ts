"use client";

import { useDrawingsStore } from "@/lib/store/drawings-store";
import {
  insertDrawing,
  updateDrawingCloud,
  deleteDrawingCloud,
  clearDrawingsCloud,
} from "./drawings-data";
import { useAuth } from "./auth-context";
import type { Drawing } from "@/lib/drawings/types";

/**
 * Wrapper around the drawings store that also persists to Supabase
 * when the user is authenticated. Components should use this hook
 * for any mutation that needs to sync to the cloud.
 */
export function useDrawings() {
  const { user } = useAuth();
  const addLocal = useDrawingsStore((s) => s.addDrawing);
  const updateLocal = useDrawingsStore((s) => s.updateDrawing);
  const removeLocal = useDrawingsStore((s) => s.removeDrawing);
  const clearLocal = useDrawingsStore((s) => s.clearDrawings);

  async function add(d: Drawing) {
    addLocal(d);
    if (user) await insertDrawing(d);
  }

  async function update(id: string, patch: Partial<Drawing>) {
    updateLocal(id, patch);
    if (user) {
      const current = useDrawingsStore.getState().drawings.find((d) => d.id === id);
      if (current) await updateDrawingCloud(current);
    }
  }

  async function remove(id: string) {
    removeLocal(id);
    if (user) await deleteDrawingCloud(id);
  }

  async function clear(symbol?: string) {
    clearLocal(symbol);
    if (user) await clearDrawingsCloud(symbol);
  }

  return { add, update, remove, clear };
}
