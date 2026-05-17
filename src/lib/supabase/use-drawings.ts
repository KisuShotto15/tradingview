"use client";

import { useDrawingsStore } from "@/lib/store/drawings-store";
import {
  insertDrawing,
  updateDrawingCloud,
  deleteDrawingCloud,
  clearDrawingsCloud,
} from "./drawings-data";
import { useAuth } from "./auth-context";
import { historyStack } from "@/lib/drawings/history-instance";
import type { Drawing } from "@/lib/drawings/types";

/**
 * Wrapper around the drawings store that also:
 *  - Persists to Supabase when the user is authenticated
 *  - Records operations to the undo/redo history stack
 *
 * Components should use this hook for any mutation that should be undoable.
 */
export function useDrawings() {
  const { user } = useAuth();
  const addLocal = useDrawingsStore((s) => s.addDrawing);
  const updateLocal = useDrawingsStore((s) => s.updateDrawing);
  const removeLocal = useDrawingsStore((s) => s.removeDrawing);
  const clearLocal = useDrawingsStore((s) => s.clearDrawings);

  async function add(d: Drawing, opts: { recordHistory?: boolean } = {}) {
    addLocal(d);
    if (opts.recordHistory !== false) {
      historyStack.pushOp({ type: "add", drawing: d });
    }
    if (user) await insertDrawing(d);
  }

  /**
   * Apply a patch immediately (used during drag). Does NOT push to history
   * and does NOT touch the cloud — call `commit()` once the gesture ends.
   */
  function updateLive(id: string, patch: Partial<Drawing>) {
    updateLocal(id, patch);
  }

  /**
   * Commit the current drawing state as one history entry and sync to cloud.
   * `previous` should be the snapshot taken BEFORE the gesture started.
   */
  async function commit(id: string, previous: Drawing) {
    const current = useDrawingsStore.getState().drawings.find((d) => d.id === id);
    if (!current) return;
    historyStack.pushOp({ type: "update", id, previous, next: current });
    if (user) await updateDrawingCloud(current);
  }

  async function update(
    id: string,
    patch: Partial<Drawing>,
    opts: { recordHistory?: boolean } = {},
  ) {
    const before = useDrawingsStore.getState().drawings.find((d) => d.id === id);
    if (!before) return;
    updateLocal(id, patch);
    const after = useDrawingsStore.getState().drawings.find((d) => d.id === id);
    if (!after) return;
    if (opts.recordHistory !== false) {
      historyStack.pushOp({ type: "update", id, previous: before, next: after });
    }
    if (user) await updateDrawingCloud(after);
  }

  async function remove(id: string, opts: { recordHistory?: boolean } = {}) {
    const before = useDrawingsStore.getState().drawings.find((d) => d.id === id);
    removeLocal(id);
    if (before && opts.recordHistory !== false) {
      historyStack.pushOp({ type: "remove", drawing: before });
    }
    if (user) await deleteDrawingCloud(id);
  }

  async function clear(symbol?: string) {
    clearLocal(symbol);
    historyStack.clear();
    if (user) await clearDrawingsCloud(symbol);
  }

  async function undo() {
    const op = historyStack.popUndo();
    if (!op) return;
    switch (op.type) {
      case "add":
        removeLocal(op.drawing.id);
        if (user) await deleteDrawingCloud(op.drawing.id);
        break;
      case "remove":
        addLocal(op.drawing);
        if (user) await insertDrawing(op.drawing);
        break;
      case "update":
        updateLocal(op.id, op.previous);
        if (user) await updateDrawingCloud(op.previous);
        break;
    }
  }

  async function redo() {
    const op = historyStack.popRedo();
    if (!op) return;
    switch (op.type) {
      case "add":
        addLocal(op.drawing);
        if (user) await insertDrawing(op.drawing);
        break;
      case "remove":
        removeLocal(op.drawing.id);
        if (user) await deleteDrawingCloud(op.drawing.id);
        break;
      case "update":
        updateLocal(op.id, op.next);
        if (user) await updateDrawingCloud(op.next);
        break;
    }
  }

  return { add, update, updateLive, commit, remove, clear, undo, redo };
}
