import type { JournalGate, JournalStatus } from "@/lib/journal/client";

export interface NormalizedGate {
  key: string;
  /** Human label; falls back to the key when the gateway didn't send one. */
  label: string;
  ok: boolean;
  reason?: string;
}

/** Keys the gateway sends that aren't verdicts and shouldn't render as rows. */
const NOT_A_GATE = new Set(["ok", "all", "allowed"]);

function titleCase(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Flatten `status.gates` into rows.
 *
 * The gateway is loose about shape here: a gate is sometimes `{ ok, reason }`
 * and sometimes a bare boolean, and it grows new keys as rules are added. So
 * this reads whatever arrives rather than naming the rules — a rule added in
 * the journal shows up here with no change on this side, which is the point of
 * not duplicating the engine.
 */
export function normalizeGates(status: JournalStatus | null): NormalizedGate[] {
  const raw = status?.gates;
  if (!raw || typeof raw !== "object") return [];

  const out: NormalizedGate[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (NOT_A_GATE.has(key)) continue;
    if (typeof value === "boolean") {
      out.push({ key, label: titleCase(key), ok: value });
      continue;
    }
    if (value && typeof value === "object") {
      const g = value as JournalGate;
      if (typeof g.ok !== "boolean") continue;
      out.push({
        key,
        label: g.label?.trim() || titleCase(key),
        ok: g.ok,
        reason: g.reason?.trim() || undefined,
      });
    }
  }
  // Blocking gates first — that's what you need to see, and it keeps the list
  // from reordering as unrelated rules flip.
  return out.sort((a, b) =>
    a.ok === b.ok ? a.label.localeCompare(b.label) : a.ok ? 1 : -1,
  );
}

/** True when the journal would currently refuse a new trade. */
export function tradingBlocked(status: JournalStatus | null): boolean {
  if (!status) return false;
  if (status.lock) return true;
  return normalizeGates(status).some((g) => !g.ok);
}

/** The reasons behind a block, most useful first. Empty when not blocked. */
export function blockReasons(status: JournalStatus | null): string[] {
  if (!status) return [];
  const out: string[] = [];
  if (status.lock) {
    out.push(status.lock.reason?.trim() || "Trading locked");
  }
  for (const g of normalizeGates(status)) {
    if (!g.ok) out.push(g.reason ? `${g.label}: ${g.reason}` : g.label);
  }
  return out;
}
