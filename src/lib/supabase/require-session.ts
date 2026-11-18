import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Session gate for the `/api/trade/*` routes.
 *
 * These routes sign requests against a real exchange, so an unauthenticated
 * caller must not reach them — otherwise the deployment is an open proxy a
 * stranger can point at their own keys, on our Vercel quota.
 *
 * The check used to live in `middleware.ts`, which on Vercel runs as its own
 * Function: every poll tick billed two invocations for one logical refresh.
 * Doing it here costs the same JWT verification but only one invocation, and
 * the protection is identical — a route that calls this first cannot be
 * reached without a session any more than a matched middleware path could.
 *
 * The flip side: a `/api/trade/*` route that forgets to call this is wide
 * open, where before the matcher covered it by default. Every handler under
 * that prefix must start with it, `exchange-info` excepted — that one returns
 * public symbol metadata, needs no credentials and is deliberately CDN-cached.
 *
 * Returns a 401 response to hand straight back, or null when the caller may
 * proceed.
 */
export async function requireSession(): Promise<NextResponse | null> {
  let authenticated = false;
  try {
    const supabase = await createClient();
    // `getClaims()` verifies the JWT locally rather than round-tripping to
    // Supabase's auth server on every request — the same reason the
    // middleware used it.
    const { data, error } = await supabase.auth.getClaims();
    authenticated = !error && !!data?.claims?.sub;
  } catch {
    // Any unexpected failure is treated as "not authenticated": the worst
    // case must be a locked door, never an open one.
    authenticated = false;
  }

  if (authenticated) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
