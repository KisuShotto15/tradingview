import { describe, it } from "node:test";
import { expect } from "@/test-utils/expect";
import { volumeColor, withAlpha, VOLUME_ALPHA } from "./volume-color";

describe("withAlpha", () => {
  it("parses every hex form", () => {
    expect(withAlpha("#b39ed7", 0.5)).toBe("rgba(179, 158, 215, 0.5)");
    expect(withAlpha("#fff", 0.2)).toBe("rgba(255, 255, 255, 0.2)");
    expect(withAlpha("#4f33a3cc", 1)).toBe("rgba(79, 51, 163, 1)");
  });
  it("replaces an rgba's alpha rather than multiplying it", () => {
    expect(withAlpha("rgba(79, 51, 163, 0.30)", 0.65)).toBe("rgba(79, 51, 163, 0.65)");
    expect(withAlpha("rgb(1,2,3)", 0.1)).toBe("rgba(1, 2, 3, 0.1)");
  });
  it("leaves what it cannot parse alone", () => {
    expect(withAlpha("transparent", 0.5)).toBe("transparent");
  });
});

describe("volumeColor", () => {
  it("follows the candle borders, up and down", () => {
    const c = { borderUp: "#b39ed7", borderDown: "#7e5abd" };
    expect(volumeColor(c, true)).toBe(`rgba(179, 158, 215, ${VOLUME_ALPHA})`);
    expect(volumeColor(c, false)).toBe(`rgba(126, 90, 189, ${VOLUME_ALPHA})`);
  });
});
