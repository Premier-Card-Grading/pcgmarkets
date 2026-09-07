import { describe, it, expect } from "vitest";
import { InMemoryCatalog, type SetRef, type ProductRef } from "../src/catalog-index";
import { matchEbayTitle } from "../src/match-ebay-title";

const sets: SetRef[] = [
  { id: "M2a", printedCode: "M2a", language: "ja", cardCount: 193, nameEn: null, nameJa: "MEGA Dream ex", aliases: [] },
  { id: "sv8a", printedCode: "sv8a", language: "ja", cardCount: 187, nameEn: null, nameJa: "Terastal Fes ex", aliases: [] },
  { id: "base1", printedCode: "base1", language: "en", cardCount: 102, nameEn: "Base Set", nameJa: null, aliases: [] },
];
const products: ProductRef[] = [
  { id: "M2a-230", setId: "M2a", numberNum: 230, numberDenom: 193, numberSuffix: null, language: "ja" },
  { id: "sv8a-069", setId: "sv8a", numberNum: 69, numberDenom: 187, numberSuffix: null, language: "ja" },
  { id: "base1-004", setId: "base1", numberNum: 4, numberDenom: 102, numberSuffix: null, language: "en" },
];
const catalog = new InMemoryCatalog(sets, products);
const m = (title: string) => matchEbayTitle({ title }, catalog);

describe("matchEbayTitle — set code path", () => {
  it("matches a glued-grade JA set code title", () => {
    expect(m("Pokemon PCG10 MEGA GENGAR EX M2a 230/193 MA 2025 Japanese")).toMatchObject({
      state: "matched", productId: "M2a-230", gradeValue: 10, matchMethod: "ebay_title",
    });
  });

  it("matches a spaced-grade JA set code title", () => {
    expect(m("Pokemon PCG 10 Sylveon EX sv8a 069/187")).toMatchObject({
      state: "matched", productId: "sv8a-069", gradeValue: 10, matchMethod: "ebay_title",
    });
  });

  it("matches an EN set via name/denominator with a Gem Mint label", () => {
    expect(m("Charizard Base Set 4/102 PCG 10 Gem Mint")).toMatchObject({
      state: "matched", productId: "base1-004", gradeValue: 10, gradeLabel: "Gem Mint", matchMethod: "ebay_title",
    });
  });
});

describe("matchEbayTitle — noise filters", () => {
  it("routes Chinese grey-market other-grader noise (Csv) to ambiguous_grader", () => {
    expect(m("Pokemon PCG10 EEVEE EX Csv9.5C 246/208 SAR 2026 Chinese")).toMatchObject({
      state: "needs_review", reviewReason: "ambiguous_grader",
    });
  });

  it("routes PCG-as-promo-name (Nagaba x PCG Campaign) to ambiguous_grader", () => {
    expect(m("PSA 10 Pikachu Yu Nagaba x PCG Campaign 208/S-P")).toMatchObject({
      state: "needs_review", reviewReason: "ambiguous_grader",
    });
  });
});

describe("matchEbayTitle — review routing", () => {
  it("grade + number but unknown set → no_set_code", () => {
    expect(m("Pokemon PCG 10 Mystery Card 5/50 UNKNOWNSET")).toMatchObject({
      state: "needs_review", reviewReason: "no_set_code",
    });
  });

  it("lot → lot", () => {
    expect(m("PCG 10 Pokemon Cards Lot x5 M2a")).toMatchObject({
      state: "needs_review", reviewReason: "lot",
    });
  });

  it("no grade → no_grade", () => {
    expect(m("Pokemon M2a 230/193 Japanese near mint")).toMatchObject({
      state: "needs_review", reviewReason: "no_grade",
    });
  });

  it("no card number → no_card_number", () => {
    expect(m("Pokemon PCG 10 M2a MEGA GENGAR EX Japanese")).toMatchObject({
      state: "needs_review", reviewReason: "no_card_number",
    });
  });
});
