import type { Drawing, DrawingKind, AlertConfig } from "./types";

/**
 * Splits a Drawing into the fields stored in the user_drawings table:
 *   - id, symbol, kind: columns
 *   - data: JSONB with everything else except alert
 *   - alert: JSONB column (nullable)
 */
export function drawingToRow(d: Drawing) {
  // Strip out fields that live in dedicated columns
  const rest = stripColumns(d);
  return {
    id: d.id,
    symbol: d.symbol,
    kind: d.kind,
    data: rest,
    alert: d.alert ?? null,
  };
}

interface DrawingRow {
  id: string;
  symbol: string;
  kind: string;
  data: Record<string, unknown>;
  alert: AlertConfig | null;
}

export function rowToDrawing(row: DrawingRow): Drawing {
  return {
    id: row.id,
    symbol: row.symbol,
    kind: row.kind as DrawingKind,
    alert: row.alert ?? null,
    ...row.data,
  } as Drawing;
}

function stripColumns(d: Drawing): Record<string, unknown> {
  const copy = { ...d } as Record<string, unknown>;
  delete copy.id;
  delete copy.symbol;
  delete copy.kind;
  delete copy.alert;
  return copy;
}
