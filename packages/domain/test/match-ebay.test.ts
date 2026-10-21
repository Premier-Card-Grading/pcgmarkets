import { describe, it, expect } from "vitest";
import { InMemoryCatalog, type SetRef, type ProductRef } from "../src/catalog-index";
import { matchEbay } from "../src/match-ebay";
import { matchListing, MATCHER_VERSION } from "../src/matcher";

const sets: SetRef[] = [
  { id: "sv03", printedCode: "OBF", language: "en", cardCount: 197, nameEn: "Obsidian Flames", nameJa: null, aliases: ["OBF"] },
  { id: "SV1a", printedCode: "SV1a", language: "ja", cardCount: 73, nameEn: null, nameJa: "トリプレットビート", aliases: ["Triplet Beat"] },
  { id: "sv3pt5", printedCode: "MEW", language: "en", cardCount: 165, nameEn: "151", nameJa: null, aliases: [] },
  { id: "SV2a", printedCode: "SV2a", language: "ja", cardCount: 165, nameEn: null, nameJa: "ポケモンカード151", aliases: ["151"] },
];
const products: ProductRef[] = [
  { id: "sv03-201", setId: "sv03", numberNum: 201, numberDenom: 197, numberSuffix: null, language: "en" },
  { id: "SV1a-073", setId: "SV1a", numberNum: 73, numberDenom: 73, numberSuffix: null, language: "ja" },
  { id: "sv3pt5-006", setId: "sv3pt5", numberNum: 6, numberDenom: 165, numberSuffix: null, language: "en" },
  { id: "SV2a-006", setId: "SV2a", numberNum: 6, numberDenom: 165, numberSuffix: null, language: "ja" },
];
const catalog = new InMemoryCatalog(sets, products);
const PCG = "Premier Card Grading (PCG)";

describe("matchEbay", () => {
  it("matches on grader + set + number", () => {
    const r = matchEbay({ title: "Charizard ex 201/197 PCG 10 GEM MINT", metadata: { grader: PCG, grade: "10", set: "Obsidian Flames", cardNumber: "201/197" }, cert: null }, catalog);
    expect(r).toMatchObject({ state: "matched", productId: "sv03-201", gradeValue: 10, gradeLabel: "Gem Mint", matchMethod: "ebay_metadata" });
  });
  it("accepts numerator-only card number once set resolves", () => {
    const r = matchEbay({ title: "x", metadata: { grader: PCG, grade: "9", set: "OBF", cardNumber: "201" }, cert: null }, catalog);
    expect(r).toMatchObject({ state: "matched", productId: "sv03-201", gradeValue: 9, gradeLabel: null });
  });
  it("uses Language to split an alias present in both languages", () => {
    const en = matchEbay({ title: "x", metadata: { grader: PCG, grade: "10", set: "151", cardNumber: "6", language: "English" }, cert: null }, catalog);
    const ja = matchEbay({ title: "x", metadata: { grader: PCG, grade: "10", set: "151", cardNumber: "6", language: "Japanese" }, cert: null }, catalog);
    expect(en.productId).toBe("sv3pt5-006");
    expect(ja.productId).toBe("SV2a-006");
  });
  it("routes alias collision without Language to ambiguous_set", () => {
    expect(matchEbay({ title: "x", metadata: { grader: PCG, grade: "10", set: "151", cardNumber: "6" }, cert: null }, catalog))
      .toMatchObject({ state: "needs_review", reviewReason: "ambiguous_set" });
  });
  it("rejects a named other grader", () => {
    expect(matchEbay({ title: "PCG 10 (NOT PSA)", metadata: { grader: "PSA", grade: "10" }, cert: null }, catalog))
      .toMatchObject({ state: "rejected", reviewReason: "grader_not_pcg" });
  });
  it("queues Other / missing grader", () => {
    expect(matchEbay({ title: "PCG 10", metadata: { grader: "Other", grade: "10", set: "OBF", cardNumber: "201" }, cert: null }, catalog))
      .toMatchObject({ state: "needs_review", reviewReason: "grader_missing" });
    expect(matchEbay({ title: "PCG 10", metadata: { grade: "10" }, cert: null }, catalog).reviewReason).toBe("grader_missing");
  });
  it("handles Authentic", () => {
    expect(matchEbay({ title: "x", metadata: { grader: PCG, grade: "Authentic", set: "OBF", cardNumber: "201" }, cert: null }, catalog))
      .toMatchObject({ state: "matched", gradeValue: null, gradeLabel: "Authentic" });
  });
  it("records 10+ hint without setting a label", () => {
    const r = matchEbay({ title: "Charizard PCG 10+", metadata: { grader: PCG, grade: "10", set: "OBF", cardNumber: "201" }, cert: null }, catalog);
    expect(r.gradeLabel).toBeNull();
    expect(r.extracted.tierHint).toBe("10+");
  });
  it("cert record overrides grade, label, number and set", () => {
    const cert = { gradedId: "000009973", setName: "Triplet Beat", cardNumber: "073/073", language: "Japanese", finalGrade: 10, grade: "Pristine" };
    const r = matchEbay({ title: "x", metadata: { grader: PCG, grade: "9", certNumber: "9973" }, cert }, catalog);
    expect(r).toMatchObject({ state: "matched", productId: "SV1a-073", gradeValue: 10, gradeLabel: "Pristine", certId: "000009973", matchMethod: "cert" });
  });
  it("missing metadata → no_metadata", () => {
    expect(matchEbay({ title: "PCG 10 Charizard", metadata: {}, cert: null }, catalog)).toMatchObject({ state: "needs_review", reviewReason: "no_metadata" });
  });
});

describe("matchListing dispatch", () => {
  it("routes by source", () => {
    expect(MATCHER_VERSION).toBe("4");
    const jp = matchListing({ source: "yahoo_auc", title: "SV1a 073/073 PCG10", description: null, metadata: {}, cert: null }, catalog);
    expect(jp.matchMethod).toBe("jp_set_code");
    const eb = matchListing({ source: "thecardapi", title: "x", description: null, metadata: { grader: PCG, grade: "10", set: "OBF", cardNumber: "201" }, cert: null }, catalog);
    expect(eb.matchMethod).toBe("ebay_metadata");
    // A SoldComps sale is never matched from its title, even one naming the set and number.
    const sc = matchListing({ source: "soldcomps", title: "Pokemon PCG 10 OBF 201/197", description: null, metadata: {}, cert: null }, catalog);
    expect(sc).toMatchObject({ state: "needs_review", reviewReason: "no_cert" });
  });
});
