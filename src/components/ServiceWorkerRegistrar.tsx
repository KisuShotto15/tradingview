"use client";

import { useEffect } from "react";

/**
 * Registers the public/sw.js service worker on mount.
 *
 * Only runs in production to avoid caching dev assets (which would interfere
 * with hot-reload and leak stale chunks).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          // Silent — SW is enhancement-only.
        });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
