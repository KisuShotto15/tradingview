"use client";

import { createClient } from "./client";
import { drawingToRow, rowToDrawing } from "@/lib/drawings/serialize";
import type { Drawing } from "@/lib/drawings/types";

export async function loadDrawings(): Promise<Drawing[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_drawings")
    .select("id, symbol, kind, data, alert");
  if (error || !data) return [];
  return data.map((row) =>
    rowToDrawing({
      id: row.id,
      symbol: row.symbol,
      kind: row.kind,
      data: row.data ?? {},
      alert: row.alert ?? null,
    }),
  );
}

export async function insertDrawing(d: Drawing) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const row = drawingToRow(d);
  await supabase.from("user_drawings").insert({ ...row, user_id: user.id });
}

export async function updateDrawingCloud(d: Drawing) {
  const supabase = createClient();
  const row = drawingToRow(d);
  await supabase
    .from("user_drawings")
    .update({
      data: row.data,
      alert: row.alert,
      updated_at: new Date().toISOString(),
    })
    .eq("id", d.id);
}

export async function deleteDrawingCloud(id: string) {
  const supabase = createClient();
  await supabase.from("user_drawings").delete().eq("id", id);
}

export async function clearDrawingsCloud(symbol?: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  let q = supabase.from("user_drawings").delete().eq("user_id", user.id);
  if (symbol) q = q.eq("symbol", symbol);
  await q;
}
