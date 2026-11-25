/* Kisu Charts — minimal offline shell service worker.
 *
 * Strategy:
 *  - On install, pre-cache the app shell (`/`, manifest, logo).
 *  - On fetch:
 *      • Network-first for navigations and same-origin static assets.
 *        Falls back to the cached shell when offline.
 *      • Never cache API routes (they need fresh data).
 *  - Skip caching POST/non-GET requests and cross-origin requests.
 */
// Bumped with the rebrand: the old "tvf-shell-v1" entry holds a pre-cached
// shell carrying the previous name and logo, and `activate` only evicts keys
// that don't match this one — so the rename has to change the key to land.
const CACHE = "kisu-charts-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/logo.svg"];

// No `skipWaiting()` and no `clients.claim()`, on purpose.
//
// Together they hand a running page over to a freshly installed worker
// mid-session. The page keeps the HTML and the chunk URLs it loaded with,
// while the new worker answers from a cache built for a different build — and
// a chunk that 404s inside the App Router is recovered by reloading the page.
// That is a reload out of nowhere, in the middle of whatever the user was
// doing, and on a chart that meant losing their place.
//
// Without them the new worker waits, and takes over the next time the app is
// opened cold, which nobody notices.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => {})),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API responses.
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok && req.mode === "navigate") {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        throw new Error("Offline and not cached");
      }
    })(),
  );
});
