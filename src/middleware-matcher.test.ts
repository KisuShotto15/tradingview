import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { expect } from "@/test-utils/expect";

/**
 * The middleware matcher is a billing control as much as an auth control: a
 * matched path runs the middleware as its own Vercel Function *before* the CDN
 * cache is consulted, so anything listed there can never be served from cache
 * and costs an invocation on every hit.
 *
 * That makes the regex worth pinning down. It is read out of the source rather
 * than duplicated here — a copy would drift, and a test that passes against a
 * stale copy is worse than no test.
 */
function matcherFromSource(): RegExp {
  const src = readFileSync("src/middleware.ts", "utf8");
  const m = src.match(/matcher:\s*\[\s*"([^"]+)"/);
  if (!m) throw new Error("No se pudo extraer el matcher de src/middleware.ts");
  // The string in the file is a TS literal, so `\\.` there is `\.` in the regex.
  return new RegExp(`^${m[1].replace(/\\\\/g, "\\")}$`);
}

const matcher = matcherFromSource();
const runs = (path: string) => matcher.test(path);

describe("middleware matcher", () => {
  it("runs on page navigation — that's what the /login redirect is for", () => {
    expect(runs("/")).toBe(true);
    expect(runs("/login")).toBe(true);
    expect(runs("/auth/callback")).toBe(true);
  });

  it("skips the CDN-cached public data proxies", () => {
    // Gating these bought nothing (the data is public) and cost an invocation
    // on every hit, because middleware pre-empts the cache.
    expect(runs("/api/yahoo?symbol=AAPL")).toBe(false);
    expect(runs("/api/fred?series=M2SL")).toBe(false);
    expect(runs("/api/coingecko?id=bitcoin")).toBe(false);
  });

  it("skips every /api/trade route — they carry requireSession() instead", () => {
    expect(runs("/api/trade/sync?symbol=BTCUSDT.P")).toBe(false);
    expect(runs("/api/trade/order")).toBe(false);
    expect(runs("/api/trade/balance")).toBe(false);
    expect(runs("/api/trade/positions")).toBe(false);
    expect(runs("/api/trade/exchange-info")).toBe(false);
  });

  it("skips static assets", () => {
    expect(runs("/_next/static/chunks/main.js")).toBe(false);
    expect(runs("/favicon.ico")).toBe(false);
    expect(runs("/logo.svg")).toBe(false);
  });

  it("does not let an unrelated path slip through on a prefix", () => {
    // The exclusion is "api/trade/" with the slash, so a sibling route that
    // merely starts the same is still gated by the middleware.
    expect(runs("/api/tradex")).toBe(true);
    expect(runs("/api/trades")).toBe(true);
    expect(runs("/api/other")).toBe(true);
  });
});
