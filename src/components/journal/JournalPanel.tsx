"use client";

import { useState } from "react";
import { Check, RefreshCw, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import { useJournalStatus } from "@/hooks/useJournalStatus";
import { journalBase, journalToken, setJournalToken } from "@/lib/journal/client";
import { blockReasons, normalizeGates } from "@/lib/journal/gates";

/**
 * Read-only view of the trade journal's guardian.
 *
 * Stage 1 of the integration: this panel renders the verdict the journal's
 * gateway already reached and can change nothing. Execution still goes through
 * the journal's own terminal — see CLAUDE.md, "Trade journal integration".
 */
export function JournalPanel() {
  const [token, setToken] = useState(() => journalToken());
  const [draft, setDraft] = useState("");
  const { status, error, unauthorized, loading, refresh } = useJournalStatus(
    token.length > 0,
  );

  function saveToken(value: string) {
    const t = value.trim();
    setJournalToken(t);
    setToken(t);
    setDraft("");
    refresh();
  }

  if (!token || unauthorized) {
    return (
      <div className="flex h-full flex-col gap-3 p-4 text-xs">
        <p className="text-tv-text-muted">
          {unauthorized
            ? "The journal rejected this token."
            : "Connect the trade journal to see the guardian here."}
        </p>
        <p className="text-[10px] leading-relaxed text-tv-text-dim">
          Sign in at the journal, then copy <code>tj_jwt</code> from its
          localStorage. This is a different origin, so the session does not
          carry over on its own.
        </p>
        <Input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveToken(draft)}
          placeholder="Paste the journal token"
          className="bg-tv-bg"
        />
        <Button
          size="sm"
          disabled={!draft.trim()}
          onClick={() => saveToken(draft)}
          className="bg-tv-blue hover:bg-tv-blue/90"
        >
          Connect
        </Button>
        <p className="mt-auto truncate text-[10px] text-tv-text-dim">
          {journalBase()}
        </p>
      </div>
    );
  }

  const gates = normalizeGates(status);
  const reasons = blockReasons(status);
  const blocked = reasons.length > 0;
  const positions = status?.positions ?? [];

  return (
    <ScrollArea className="h-full min-w-0">
      <div className="flex flex-col gap-3 p-3 text-xs">
        {/* Verdict */}
        {status && (
          <div
            className={cn(
              "flex items-start gap-2 rounded border p-2.5",
              blocked
                ? "border-tv-red/40 bg-tv-red/10"
                : "border-tv-green/30 bg-tv-green/10",
            )}
          >
            {blocked ? (
              <ShieldAlert className="mt-px h-4 w-4 shrink-0 text-tv-red" />
            ) : (
              <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-tv-green" />
            )}
            <div className="min-w-0">
              <p
                className={cn(
                  "font-semibold",
                  blocked ? "text-tv-red" : "text-tv-green",
                )}
              >
                {blocked ? "Trading blocked" : "Trading allowed"}
              </p>
              {reasons.map((r) => (
                <p key={r} className="mt-0.5 text-[11px] text-tv-text-muted">
                  {r}
                </p>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded border border-tv-border bg-tv-panel px-2 py-1.5 text-[11px] text-tv-text-muted">
            {error}
          </p>
        )}

        {/* Today */}
        {status?.today && (
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Equity" value={num(status.equity)} />
            <Stat
              label="P&L today"
              value={num(status.today.pnl)}
              tone={
                status.today.pnl === undefined
                  ? undefined
                  : status.today.pnl >= 0
                    ? "up"
                    : "down"
              }
            />
            <Stat label="Trades today" value={int(status.today.trades)} />
            <Stat label="Consec. losses" value={int(status.today.consec_losses)} />
          </div>
        )}

        {/* Rule verdicts */}
        {gates.length > 0 && (
          <Section title="Rules">
            {gates.map((g) => (
              <div key={g.key} className="flex items-start gap-2 py-1">
                {g.ok ? (
                  <Check className="mt-px h-3 w-3 shrink-0 text-tv-green" />
                ) : (
                  <X className="mt-px h-3 w-3 shrink-0 text-tv-red" />
                )}
                <div className="min-w-0">
                  <span className={g.ok ? "text-tv-text-muted" : "text-tv-text"}>
                    {g.label}
                  </span>
                  {g.reason && (
                    <span className="block text-[10px] text-tv-text-dim">
                      {g.reason}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* Positions as the journal sees them */}
        <Section title={`Positions (${positions.length})`}>
          {positions.length === 0 ? (
            <p className="py-1 text-[11px] text-tv-text-dim">No open positions.</p>
          ) : (
            positions.map((p, i) => (
              <div
                key={`${p.exchange}-${p.symbol}-${p.side}-${i}`}
                className="flex items-center justify-between gap-2 py-1"
              >
                <span className="min-w-0 truncate">
                  <span
                    className={cn(
                      "font-semibold",
                      p.side === "long" ? "text-tv-blue" : "text-tv-red",
                    )}
                  >
                    {p.side === "long" ? "L" : "S"}
                  </span>{" "}
                  <span className="text-tv-text">{p.symbol}</span>{" "}
                  <span className="text-tv-text-dim">@ {formatPrice(p.entry)}</span>
                </span>
                {p.pnl !== undefined && (
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      p.pnl >= 0 ? "text-tv-green" : "text-tv-red",
                    )}
                  >
                    {p.pnl >= 0 ? "+" : "−"}
                    {Math.abs(p.pnl).toFixed(2)}
                  </span>
                )}
              </div>
            ))
          )}
        </Section>

        {/* Guardian heartbeat — a stale one means the cron stopped running. */}
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-tv-text-dim">
          <span className="truncate">
            {status?.guardian_error
              ? `Guardian error: ${status.guardian_error}`
              : status?.guardian_at
                ? `Guardian ran ${ago(status.guardian_at)}`
                : "Guardian has not reported"}
          </span>
          <button
            onClick={refresh}
            title="Refresh now"
            className="shrink-0 rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </button>
        </div>

        <button
          onClick={() => saveToken("")}
          className="self-start text-[10px] text-tv-text-dim underline hover:text-tv-text"
        >
          Disconnect journal
        </button>
      </div>
    </ScrollArea>
  );
}

function num(v: number | undefined): string {
  return v === undefined ? "—" : v.toFixed(2);
}

function int(v: number | undefined): string {
  return v === undefined ? "—" : String(v);
}

/** Epoch seconds → "3 min ago". */
function ago(epochSec: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - epochSec));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded border border-tv-border bg-tv-panel px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-tv-text-dim">
        {label}
      </div>
      <div
        className={cn(
          "tabular-nums",
          tone === "up" && "text-tv-green",
          tone === "down" && "text-tv-red",
          !tone && "text-tv-text",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
        {title}
      </span>
      <div className="divide-y divide-tv-border/60">{children}</div>
    </div>
  );
}
