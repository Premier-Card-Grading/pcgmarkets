import { describe, it, expect } from "vitest";
import { parseCardQuery, matchesCardQuery, type QueryableCard } from "../src/card-query";

const pika: QueryableCard = { number_printed: "069/187", number_num: 69, number_denom: 187, number_suffix: null, name_en: "Pikachu ex", name_ja: "ピカチュウex" };
const promo: QueryableCard = { number_printed: "001/SV-P", number_num: 1, number_denom: null, number_suffix: "SV-P", name_en: null, name_ja: "ニャオハ" };
const vintage: QueryableCard = { number_printed: "Charizard", number_num: null, number_denom: null, number_suffix: null, name_en: "Charizard", name_ja: null };

describe("parseCardQuery", () => {
  it("is 'all' for blank input", () => { expect(parseCardQuery("  ")).toEqual({ kind: "all" }); });
  it("reads full, short and padded numbers", () => {
    expect(parseCardQuery("069/187")).toEqual({ kind: "number", num: 69, denom: 187, suffix: null });
    expect(parseCardQuery("69/187")).toEqual({ kind: "number", num: 69, denom: 187, suffix: null });
    expect(parseCardQuery("69")).toEqual({ kind: "number", num: 69, denom: null, suffix: null });
    expect(parseCardQuery("069")).toEqual({ kind: "number", num: 69, denom: null, suffix: null });
    expect(parseCardQuery("#69")).toEqual({ kind: "number", num: 69, denom: null, suffix: null });
  });
  it("reads promo numbers", () => { expect(parseCardQuery("001/sv-p")).toEqual({ kind: "number", num: 1, denom: null, suffix: "SV-P" }); });
  it("treats anything else as text", () => { expect(parseCardQuery(" Pikachu ")).toEqual({ kind: "text", text: "pikachu" }); });
});

describe("matchesCardQuery", () => {
  it("matches by number with or without the denominator", () => {
    expect(matchesCardQuery(pika, parseCardQuery("069/187"))).toBe(true);
    expect(matchesCardQuery(pika, parseCardQuery("69"))).toBe(true);
    expect(matchesCardQuery(pika, parseCardQuery("69/188"))).toBe(false);
    expect(matchesCardQuery(pika, parseCardQuery("70"))).toBe(false);
  });
  it("matches promo suffixes", () => {
    expect(matchesCardQuery(promo, parseCardQuery("001/SV-P"))).toBe(true);
    expect(matchesCardQuery(promo, parseCardQuery("1"))).toBe(true);
  });
  it("matches English names ignoring case, and Japanese names", () => {
    expect(matchesCardQuery(pika, parseCardQuery("PIKACHU"))).toBe(true);
    expect(matchesCardQuery(pika, parseCardQuery("ピカチュウ"))).toBe(true);
    expect(matchesCardQuery(pika, parseCardQuery("raichu"))).toBe(false);
  });
  it("falls back to the printed number for non-numeric cards", () => {
    expect(matchesCardQuery(vintage, parseCardQuery("chariz"))).toBe(true);
  });
  it("matches everything for 'all'", () => { expect(matchesCardQuery(vintage, { kind: "all" })).toBe(true); });
});
