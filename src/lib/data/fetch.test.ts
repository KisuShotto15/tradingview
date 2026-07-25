import { afterEach, describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { fetchOlderCandles } from "./fetch";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("fetchOlderCandles", () => {
  it("pages Binance klines and keeps only bars strictly before the boundary", async () => {
    // Binance kline rows: [openTimeMs, open, high, low, close, volume, ...].
    const rows = [
      [1000, "1", "1", "1", "1", "1"],
      [2000, "2", "2", "2", "2", "2"],
      [3000, "3", "3", "3", "3", "3"],
    ];
    const calls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return { ok: true, json: async () => rows } as Response;
    }) as typeof fetch;

    const out = await fetchOlderCandles("BTCUSDT", "1m", 3, 1000);
    // times (sec) are 1,2,3; strictly < 3 → [1, 2].
    expect(out.map((c) => c.time)).toEqual([1, 2]);
    // endTime passed as beforeTimeSec*1000 - 1 (= 2999) so the boundary bar isn't refetched.
    expect(calls[0]).toContain("endTime=2999");
  });

  it("returns [] for non-Binance sources without hitting the network", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return { ok: true, json: async () => [] } as Response;
    }) as typeof fetch;
    // A synthetic expression resolves to a non-Binance source.
    const out = await fetchOlderCandles("BTCUSDT-ETHUSDT", "1m", 1000);
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });
});
