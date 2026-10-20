import { describe, it, expect } from "vitest";
import { LIMITLESS_TO_OURS, ourSetIdFor } from "../src/limitless/ja-set-map";

describe("limitless set map", () => {
  const ours = new Set(["SV11B", "sm2+", "ja-neo1", "SV-P", "M-P", ...Object.values(LIMITLESS_TO_OURS)]);
  it("maps every entry to a distinct set of ours", () => {
    const targets = Object.values(LIMITLESS_TO_OURS);
    expect(new Set(targets).size).toBe(targets.length);
  });
  it("prefers the map, then exact code, then case-insensitive code", () => {
    expect(ourSetIdFor("SV11B", ours)).toBe("SV11B");
    expect(ourSetIdFor("SM2+", ours)).toBe("sm2+");
    expect(ourSetIdFor("NEO1", ours)).toBe("ja-neo1");
    expect(ourSetIdFor("ZZZ9", ours)).toBeNull();
  });
  it("maps the hand-verified promo sets", () => {
    expect(ourSetIdFor("SVP", ours)).toBe("SV-P");
    expect(ourSetIdFor("MP", ours)).toBe("M-P");
  });
  it("uses the map where Limitless and our codes differ", () => {
    expect(ourSetIdFor("BW1b", ours)).toBe("BW1a");
    expect(ourSetIdFor("BW1w", ours)).toBe("BW1b");
  });
});
