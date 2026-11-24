// Main-thread polyfills for the node test environment. Zustand `persist` stores
// read localStorage at creation; provide an in-memory stand-in.
class MemStorage {
  #m = new Map();
  getItem(k) {
    return this.#m.has(k) ? this.#m.get(k) : null;
  }
  setItem(k, v) {
    this.#m.set(k, String(v));
  }
  removeItem(k) {
    this.#m.delete(k);
  }
  clear() {
    this.#m.clear();
  }
  key(i) {
    return [...this.#m.keys()][i] ?? null;
  }
  get length() {
    return this.#m.size;
  }
}

if (typeof globalThis.localStorage === "undefined") {
  globalThis.localStorage = new MemStorage();
}

// Zustand's persist default is `createJSONStorage(() => window.localStorage)`
// — `window`, not the bare global. With no `window` that accessor throws,
// `createJSONStorage` swallows it and returns undefined, and persist takes its
// "storage unavailable" branch: the store still works, but it never writes,
// never rehydrates and never runs `migrate` or `merge`.
//
// That failed silently for a long time. A test that seeded localStorage and
// asserted on the result was really only ever reading the store's defaults,
// so any assertion that happened to match a default passed for the wrong
// reason — which is exactly how a broken palette migration got called proven.
//
// Deliberately a bare object rather than aliasing `globalThis`: code here
// branches on `typeof window === "undefined"` to detect SSR, and handing it
// the whole global would flip those paths into their browser branches.
if (typeof globalThis.window === "undefined") {
  globalThis.window = { localStorage: globalThis.localStorage };
}
