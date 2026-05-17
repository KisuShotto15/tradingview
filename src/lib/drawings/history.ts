import type { Drawing } from "./types";

/**
 * History op stores enough info to redo AND undo.
 *   - add: when applied = add(drawing). Undo = remove(drawing.id).
 *   - remove: when applied = remove(drawing.id). Undo = add(drawing).
 *   - update: when applied = update(id, next). Undo = update(id, previous).
 */
export type HistoryOp =
  | { type: "add"; drawing: Drawing }
  | { type: "remove"; drawing: Drawing }
  | { type: "update"; id: string; previous: Drawing; next: Drawing };

const MAX_HISTORY = 50;

export class HistoryStack {
  private undoStack: HistoryOp[] = [];
  private redoStack: HistoryOp[] = [];

  pushOp(op: HistoryOp) {
    this.undoStack.push(op);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
  }

  popUndo(): HistoryOp | null {
    const op = this.undoStack.pop();
    if (!op) return null;
    this.redoStack.push(op);
    return op;
  }

  popRedo(): HistoryOp | null {
    const op = this.redoStack.pop();
    if (!op) return null;
    this.undoStack.push(op);
    return op;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
