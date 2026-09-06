import { describe, it, expect } from "vitest";
import { parseCardNumber, classifySearch, numberFromCatalog } from "../src/card-number";

describe("parseCardNumber", () => {
  it("parses zero-padded with denominator", () => {
    expect(parseCardNumber("080/090")).toEqual({ num: 80, denom: 90, suffix: null, printed: "080/090" });
  });
  it("normalises spaces and missing zeros to the same key", () => {
    const a = parseCardNumber("80/90")!, b = parseCardNumber("080 / 090")!;
    expect([a.num, a.denom]).toEqual([b.num, b.denom]);
  });
  it("parses numerator only", () => {
    expect(parseCardNumber("080")).toEqual({ num: 80, denom: null, suffix: null, printed: "080" });
  });
  it("parses promo suffix", () => {
    expect(parseCardNumber("001/SV-P")).toEqual({ num: 1, denom: null, suffix: "SV-P", printed: "001/SV-P" });
    expect(parseCardNumber("84/pcg-p")!.suffix).toBe("PCG-P");
  });
  it("rejects non-numbers", () => {
    expect(parseCardNumber("Charizard")).toBeNull();
    expect(parseCardNumber("1234/5")).toBeNull();
  });
});

describe("classifySearch", () => {
  it("routes 9 digits to cert", () => {
    expect(classifySearch("000343136")).toEqual({ kind: "cert", cert: "000343136" });
  });
  it("routes number-shaped to number", () => {
    expect(classifySearch(" 201/165 ")).toMatchObject({ kind: "number", number: { num: 201, denom: 165 } });
  });
  it("routes everything else to name", () => {
    expect(classifySearch("Charizard ex")).toEqual({ kind: "name", q: "Charizard ex" });
  });
});

describe("numberFromCatalog", () => {
  it("builds printed number from TCGdex localId + official count", () => {
    expect(numberFromCatalog("073", { id: "SV1a", cardCountOfficial: 73 }))
      .toEqual({ num: 73, denom: 73, suffix: null, printed: "073/073" });
  });
  it("handles secret rares above the denominator", () => {
    expect(numberFromCatalog("201", { id: "sv03", cardCountOfficial: 165 })!.printed).toBe("201/165");
  });
  it("treats -P sets as promos with suffix", () => {
    expect(numberFromCatalog("001", { id: "SV-P", cardCountOfficial: null }))
      .toEqual({ num: 1, denom: null, suffix: "SV-P", printed: "001/SV-P" });
  });
  it("returns null for non-numeric localIds (vintage JP)", () => {
    expect(numberFromCatalog("Charizard", { id: "base1", cardCountOfficial: 102 })).toBeNull();
  });
});
