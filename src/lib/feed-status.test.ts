import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { FeedStatusEmitter } from "./feed-status";

describe("FeedStatusEmitter", () => {
  it("starts down, since nothing has connected yet", () => {
    expect(new FeedStatusEmitter().get()).toBe("down");
  });

  it("replays the current value to a late subscriber", () => {
    const e = new FeedStatusEmitter();
    e.set("live");
    const seen: string[] = [];
    e.subscribe((s) => seen.push(s));
    expect(seen).toEqual(["live"]);
  });

  it("notifies every subscriber on a change", () => {
    const e = new FeedStatusEmitter();
    const a: string[] = [];
    const b: string[] = [];
    e.subscribe((s) => a.push(s));
    e.subscribe((s) => b.push(s));
    e.set("live");
    expect(a).toEqual(["down", "live"]);
    expect(b).toEqual(["down", "live"]);
  });

  it("does not re-notify when the value is unchanged", () => {
    const e = new FeedStatusEmitter();
    const seen: string[] = [];
    e.subscribe((s) => seen.push(s));
    e.set("live");
    e.set("live");
    expect(seen).toEqual(["down", "live"]);
  });

  it("stops notifying after unsubscribe", () => {
    const e = new FeedStatusEmitter();
    const seen: string[] = [];
    const off = e.subscribe((s) => seen.push(s));
    off();
    e.set("live");
    expect(seen).toEqual(["down"]);
    expect(e.get()).toBe("live");
  });
});
