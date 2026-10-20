import { describe, it, expect } from "vitest";
import { toRecentSale, sourceName, setLine } from "../lib/home-data";
describe("home-data", () => {
  it("maps a recent sale row", () => {
    const s = toRecentSale({ id: "1", product_id: "sv2a-205", name_en: "Mew ex", name_ja: "ミュウex", number_printed: "205/165", image_url: null, set_code: "SV2a", set_name_en: null, set_name_ja: "ポケモンカード151", language: "ja", grade_value: 10, grade_label: "Gem Mint", price: 62000, currency: "JPY", price_usd: 418.2, sold_at: "2026-09-19T00:00:00Z", source: "soldcomps" });
    expect(s).toEqual({ id: "1", productId: "sv2a-205", name: "Mew ex", setLine: "SV2a 205/165 · 19 Sept", imageUrl: null, gradeValue: 10, gradeLabel: "Gem Mint", priceUsd: 418.2, source: "eBay", soldAt: "2026-09-19T00:00:00Z" });
  });
  it("names sources", () => { expect(sourceName("yahoo_auc")).toBe("Yahoo!"); expect(sourceName("thecardapi")).toBe("eBay"); });
  it("falls back to set name when there is no code", () => { expect(setLine({ set_code: null, set_name_en: "Paldean Fates", set_name_ja: null, number_printed: "006/091", sold_at: "2026-09-16T00:00:00Z" })).toBe("Paldean Fates 006/091 · 16 Sept"); });
});
