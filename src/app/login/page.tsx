"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "magic" | "password" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");

    if (mode === "magic") {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) {
        setError(error.message);
        setStatus("error");
      } else {
        setStatus("sent");
      }
      return;
    }

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) {
        setError(error.message);
        setStatus("error");
      } else {
        setStatus("sent");
      }
      return;
    }

    // password login
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      location.href = "/";
    }
  }

  return (
    // This page is the app's whole public face: middleware sends every
    // unauthenticated request here, so it is what any crawler or abuse scanner
    // sees. It used to hardcode another product's palette (#131722 navy,
    // #2962ff, #d1d4dc, #787b86) under that product's name, on a credential
    // form — which is the exact shape of a phishing page. It now uses the
    // app's own tokens, which is also what the rest of the app renders in.
    <div className="flex min-h-screen items-center justify-center bg-tv-bg">
      <div className="w-full max-w-sm space-y-8 px-6">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={48} height={48} className="rounded-xl" />
          <div className="text-center">
            <h1 className="text-xl font-semibold text-tv-text">Kisu Charts</h1>
            <p className="mt-1 text-sm text-tv-text-muted">Real-time crypto charts</p>
          </div>
        </div>

        {status === "sent" ? (
          <div className="rounded-lg border border-tv-green/30 bg-tv-green/10 p-4 text-center text-sm text-tv-green">
            {mode === "magic"
              ? "Check your email — we sent you a sign-in link."
              : "Account created. Check your email to confirm."}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Mode tabs */}
            <div className="flex rounded-lg border border-tv-border bg-tv-panel p-1">
              {(["magic", "password", "signup"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(""); setStatus("idle"); }}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                    mode === m
                      ? "bg-tv-green text-black"
                      : "text-tv-text-muted hover:text-tv-text"
                  }`}
                >
                  {m === "magic" ? "Magic Link" : m === "password" ? "Password" : "Sign up"}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                required
                className="w-full rounded-lg border border-tv-border bg-tv-panel px-3 py-2.5 text-sm text-tv-text placeholder-tv-text-muted outline-none transition-colors focus:border-tv-green"
              />

              {(mode === "password" || mode === "signup") && (
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  minLength={6}
                  className="w-full rounded-lg border border-tv-border bg-tv-panel px-3 py-2.5 text-sm text-tv-text placeholder-tv-text-muted outline-none transition-colors focus:border-tv-green"
                />
              )}
            </div>

            {error && <p className="text-xs text-tv-red">{error}</p>}

            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full rounded-lg bg-tv-green py-2.5 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {status === "loading"
                ? "Loading…"
                : mode === "magic"
                ? "Send link"
                : mode === "signup"
                ? "Create account"
                : "Sign in"}
            </button>
          </form>
        )}

        <p className="text-center text-[10px] text-tv-text-muted">
          charts.kisushotto.com
        </p>
      </div>
    </div>
  );
}
