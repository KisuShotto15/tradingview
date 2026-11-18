/**
 * Client for the trade journal's Cloudflare Worker gateway.
 *
 * The journal — not this app — is the authority on whether a trade is allowed:
 * its `risk.js` opens with "el servidor es el que dice si una orden sale o no;
 * nada del navegador es confiable". So this module never evaluates a rule, it
 * only reads the verdict the gateway already reached.
 *
 * Calls go **straight from the browser to the Worker**, not through a Next.js
 * route. The Worker sets `Access-Control-Allow-Origin: *` and accepts the
 * `Authorization` header, so a proxy here would add a Vercel Function
 * invocation per poll and buy nothing.
 */

/** Same default the journal's own `api.js` uses; override per deployment. */
const DEFAULT_BASE =
  process.env.NEXT_PUBLIC_JOURNAL_URL ??
  "https://trade-journal-worker.efrenalejandro2010.workers.dev";

export function journalBase(): string {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("tj_url");
    if (stored) return stored.replace(/\/$/, "");
  }
  return DEFAULT_BASE.replace(/\/$/, "");
}

/**
 * The journal's JWT, as its own frontend stores it.
 *
 * Reading the same `tj_jwt` key means that on a shared origin the session
 * carries over. On `charts.kisushotto.com` it won't — different origin, so
 * localStorage is separate — which is why the panel lets the token be pasted.
 */
export function journalToken(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem("tj_jwt") ?? "";
}

export function setJournalToken(token: string): void {
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem("tj_jwt", token);
  else localStorage.removeItem("tj_jwt");
}

export class JournalError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the request never completed. */
    readonly status: number,
  ) {
    super(message);
    this.name = "JournalError";
  }
}

async function journalFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = journalToken();
  if (!token) throw new JournalError("No journal token", 401);

  let res: Response;
  try {
    res = await fetch(`${journalBase()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
  } catch (e) {
    // Network failure, CORS rejection or an aborted poll all land here.
    throw new JournalError(
      e instanceof Error ? e.message : "Network error",
      0,
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new JournalError("Journal session expired", res.status);
  }
  if (!res.ok) {
    throw new JournalError(`Journal responded ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

/* ── Status payload ──────────────────────────────────────────────────────────
 * Only the fields this app reads are typed. The gateway returns a good deal
 * more (news list, analytics, per-account detail); leaving those out keeps the
 * two repos from having to move in lockstep over fields nobody renders.
 */

export interface JournalGate {
  ok: boolean;
  label?: string;
  reason?: string;
}

export interface JournalPosition {
  exchange: string;
  market: string;
  symbol: string;
  side: string;
  size: number;
  entry: number;
  mark: number;
  notional: number;
  pnl?: number;
  stop?: number;
}

export interface JournalStatus {
  now?: number;
  /** Non-null while trading is self-locked or rule-locked. */
  lock: { until: number; reason?: string } | null;
  equity?: number;
  today?: {
    trades?: number;
    pnl?: number;
    losses?: number;
    consec_losses?: number;
  };
  /** Per-rule verdicts the gateway already computed. */
  gates?: Record<string, JournalGate | boolean>;
  rules?: Record<string, unknown>;
  window?: { open?: boolean; reason?: string; from?: string; to?: string };
  positions?: JournalPosition[];
  open_orders?: unknown[];
  /** Epoch seconds of the last guardian cron run. */
  guardian_at?: number;
  guardian_error?: string | null;
  errors?: string[];
}

/** Read-only account + rules snapshot. Never mutates anything. */
export function getJournalStatus(signal?: AbortSignal): Promise<JournalStatus> {
  return journalFetch<JournalStatus>("/exec/status", signal);
}
