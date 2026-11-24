"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getJournalStatus,
  journalToken,
  JournalError,
  type JournalStatus,
} from "@/lib/journal/client";

/**
 * How often the guardian snapshot is re-read. Slower than the exchange poll on
 * purpose: these numbers move when a trade opens or the cron guardian runs,
 * not tick by tick. It costs nothing on Vercel either way — the request goes
 * browser → Cloudflare Worker, with no Function in between.
 */
const POLL_MS = 10_000;

export interface JournalState {
  status: JournalStatus | null;
  error: string | null;
  /** True once the token is rejected, so the panel can ask for a new one. */
  unauthorized: boolean;
  loading: boolean;
  refresh: () => void;
}

/**
 * Read-only poll of the journal gateway's `/exec/status`.
 *
 * Stage 1 of the integration: this app shows what the journal already decided
 * and cannot change any of it. Nothing here places, moves or cancels an order.
 */
export function useJournalStatus(enabled: boolean): JournalState {
  const [status, setStatus] = useState<JournalStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  /** Bumping this re-runs the effect, which is also how a retry resets the
   *  `unauthorized` latch after a new token is pasted. */
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // No clearing here on purpose: a synchronous setState in an effect body
    // triggers a cascading render, and the disconnected view is derived from
    // `enabled` at the bottom instead.
    if (!enabled || !journalToken()) return;

    let cancelled = false;
    /** Latched on 401/403: a rejected token will keep being rejected, so the
     *  loop stops rather than hammering the worker until the tab closes. */
    let halted = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ac = new AbortController();


    async function load() {
      if (cancelled || halted) return;
      setLoading(true);
      try {
        const s = await getJournalStatus(ac.signal);
        if (cancelled) return;
        setStatus(s);
        setError(null);
      } catch (e) {
        if (cancelled || ac.signal.aborted) return;
        const err = e instanceof JournalError ? e : null;
        if (err && (err.status === 401 || err.status === 403)) {
          halted = true;
          setUnauthorized(true);
          setError("Session expired — paste a fresh journal token");
        } else {
          // A transient network or CORS failure keeps the last good snapshot
          // on screen; the next tick will either recover or keep saying so.
          setError(err?.message ?? "Could not reach the journal");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    function schedule() {
      if (cancelled || halted || document.hidden) return;
      timer = setTimeout(async () => {
        timer = null;
        await load();
        schedule();
      }, POLL_MS);
    }

    function stop() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    }

    // Same visibility discipline as the exchange poll: a backgrounded tab
    // doesn't need this, and the guardian keeps running server-side anyway.
    function onVisibility() {
      stop();
      if (!document.hidden) void load().then(schedule);
    }

    void load().then(schedule);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      stop();
      ac.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, nonce]);

  // Gated rather than cleared, so disconnecting doesn't leave the last
  // account's numbers on screen and no effect has to write state to hide them.
  if (!enabled) {
    return { status: null, error: null, unauthorized: false, loading: false, refresh };
  }
  return { status, error, unauthorized, loading, refresh };
}
