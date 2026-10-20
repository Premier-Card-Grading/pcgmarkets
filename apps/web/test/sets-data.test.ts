// apps/web/test/sets-data.test.ts
import { describe, it, expect } from "vitest";
import { asLang, groupBySeries, filterTiles, tilePrice, sortCards, type SetTile, type SetCard } from "../lib/sets-data";

const tile = (o: Partial<SetTile>): SetTile => ({ id: "x", code: null, nameEn: null, nameJa: null, displayName: "x", releaseDate: null, cardCount: 0, officialCount: null, hasCards: true, logoUrl: null, series: null, saleCount: 0, aliases: [], ...o });
const card = (o: Partial<SetCard>): SetCard => ({ id: "c", number_printed: "001/100", number_num: 1, number_denom: 100, number_suffix: null, name_en: null, name_ja: null, rarity: null, image_url: null, pcg10_median_usd: null, pcg10_n_sales: null, est10_usd: null, est10_as_of: null, sale_count: 0, ...o });
const now = new Date("2026-10-21T00:00:00Z");

describe("sets-data", () => {
  it("defaults the language to English", () => { expect(asLang("ja")).toBe("ja"); expect(asLang("zh")).toBe("en"); expect(asLang(undefined)).toBe("en"); });
  it("groups by series, newest group first, Other last", () => {
    const g = groupBySeries([
      tile({ id: "a", series: "Sword & Shield", releaseDate: "2022-01-01" }),
      tile({ id: "b", series: "Scarlet & Violet", releaseDate: "2024-01-01" }),
      tile({ id: "c", series: null, releaseDate: "2026-01-01" }),
      tile({ id: "d", series: "Scarlet & Violet", releaseDate: "2025-01-01" }),
    ]);
    expect(g.map((x) => x.series)).toEqual(["Scarlet & Violet", "Sword & Shield", "Other"]);
    expect(g[0]!.sets.map((s) => s.id)).toEqual(["d", "b"]);
  });
  it("filters by English name, Japanese name, code or alias", () => {
    const t = [tile({ id: "1", nameEn: "Black Bolt", nameJa: "ブラックボルト", code: "SV11B" }), tile({ id: "2", nameEn: "White Flare", code: "SV11W", aliases: ["WHT"] })];
    expect(filterTiles(t, "bolt").map((x) => x.id)).toEqual(["1"]);
    expect(filterTiles(t, "ボルト").map((x) => x.id)).toEqual(["1"]);
    expect(filterTiles(t, "sv11w").map((x) => x.id)).toEqual(["2"]);
    expect(filterTiles(t, "wht").map((x) => x.id)).toEqual(["2"]);
    expect(filterTiles(t, " ")).toHaveLength(2);
  });
  it("prices tiles: PCG 10, then a fresh estimate, then none", () => {
    expect(tilePrice(card({ pcg10_median_usd: 120, pcg10_n_sales: 3, est10_usd: 90, est10_as_of: "2026-10-20T00:00:00Z" }), now)).toEqual({ kind: "pcg", usd: 120, nSales: 3 });
    expect(tilePrice(card({ est10_usd: 90, est10_as_of: "2026-10-20T00:00:00Z" }), now)).toEqual({ kind: "estimate", usd: 90 });
    expect(tilePrice(card({ est10_usd: 90, est10_as_of: "2026-09-01T00:00:00Z" }), now)).toEqual({ kind: "none" });
    expect(tilePrice(card({}), now)).toEqual({ kind: "none" });
  });
  it("sorts by number, or by price with no-comps last", () => {
    const cs = [card({ id: "a", number_num: 3 }), card({ id: "b", number_num: 1, est10_usd: 50, est10_as_of: "2026-10-20T00:00:00Z" }), card({ id: "c", number_num: 2, pcg10_median_usd: 80, pcg10_n_sales: 1 })];
    expect(sortCards(cs, "number", now).map((c) => c.id)).toEqual(["b", "c", "a"]);
    expect(sortCards(cs, "price", now).map((c) => c.id)).toEqual(["c", "b", "a"]);
  });
});
