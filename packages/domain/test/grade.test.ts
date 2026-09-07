import { describe, it, expect } from "vitest";
import { parseGradeFromText, parseTierLabel, normalizeGradeValue, stripGradeToken } from "../src/grade";

describe("parseGradeFromText (spec §8 JP rule 3)", () => {
  const cases: [string, number | null][] = [
    ["PCG10", 10],
    ["PCG 9.5", 9.5],
    ["PCG鑑定 10", 10],
    ["ヒバニー AR 745/742 PCG鑑定品 Gem Mint 10", 10],
    ["[PCG10/Flawless]【AR】M2a 212/193", 10],
    ["PCG Mint 9", 9],
    ["pcg graded 8.5", 8.5],
    ["084/PCG-P プロモ", null],
    ["PCGS MS65", null],
    ["PSA 10 リザードン", null],
    ["PCG 100 cards lot", null],
  ];
  for (const [t, v] of cases) it(`${t} -> ${v}`, () => expect(parseGradeFromText(t)?.value ?? null).toBe(v));

  it("records 10+ as a hint, value 10", () => {
    expect(parseGradeFromText("PCG 10+ Charizard")).toEqual({ value: 10, tierHint: "10+" });
  });
});

describe("parseTierLabel", () => {
  it("maps English, katakana and renamed labels", () => {
    expect(parseTierLabel("PCG 10 GEM MINT")).toBe("Gem Mint");
    expect(parseTierLabel("PCG PRISTINE 10")).toBe("Pristine");
    expect(parseTierLabel("Flawless 10")).toBe("Flawless");
    expect(parseTierLabel("Gold Pristine 10")).toBe("Flawless");
    expect(parseTierLabel("PCG10 フローレス")).toBe("Flawless");
    expect(parseTierLabel("ジェムミント")).toBe("Gem Mint");
    expect(parseTierLabel("PCG 9 Mint")).toBeNull();
  });
});

describe("stripGradeToken (recall bug: glued PCG-grade vs 2004-06 PCGn era set codes)", () => {
  it("removes the glued grade token but keeps the surrounding set code and number text", () => {
    const stripped = stripGradeToken("SV4a 100/190 PCG10鑑定品");
    expect(stripped).not.toContain("PCG10");
    expect(stripped).toContain("SV4a");
    expect(stripped).toContain("100/190");
  });

  it("removes only the first grade match, leaving a later grade-shaped token alone", () => {
    const stripped = stripGradeToken("PCG10 PCG9");
    expect(stripped).not.toContain("PCG10");
    expect(stripped).toContain("PCG9");
  });

  it("is a no-op when there is no grade token", () => {
    expect(stripGradeToken("M2a 212/193")).toBe("M2a 212/193");
  });
});

describe("normalizeGradeValue (eBay Grade aspect)", () => {
  it("parses numeric strings", () => {
    expect(normalizeGradeValue("10")).toBe(10);
    expect(normalizeGradeValue("9.5")).toBe(9.5);
  });
  it("maps Authentic", () => expect(normalizeGradeValue("Authentic")).toBe("authentic"));
  it("rejects junk", () => {
    expect(normalizeGradeValue("11")).toBeNull();
    expect(normalizeGradeValue(undefined)).toBeNull();
  });
});
