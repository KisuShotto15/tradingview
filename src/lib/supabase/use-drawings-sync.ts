"use client";

import { useEffect, useRef } from "react";
import { useDrawingsStore } from "@/lib/store/drawings-store";
import { useAuth } from "./auth-context";
import { loadDrawings } from "./drawings-data";

/**
 * Loads the user's drawings from Supabase once after sign-in.
 * Per-drawing mutations are persisted directly from the action wrapper hook
 * (use-drawings.ts) — no debounced full snapshot needed.
 */
export function useDrawingsSync() {
  const { user } = useAuth();
  const initializedRef = useRef(false);
  const setDrawings = useDrawingsStore((s) => s.setDrawings);

  useEffect(() => {
    if (!user) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    loadDrawings().then((drawings) => {
      if (drawings.length > 0) setDrawings(drawings);
    });
  }, [user, setDrawings]);
}
