import { describe, it, expect, vi } from "vitest";

const card = (number: string, nameEn: string | null = "N") => ({ number, nameJa: "ジャ", nameEn, type: null, rarity: "C", imageXs: null });
vi.mock("@pcg/connectors", async (orig) => {
  const real = await orig<typeof import("@pcg/connectors")>();
  const pages: Record<string, unknown> = {
    A: { code: "A", nameJa: null, nameEn: null, releaseDate: null, cards: [card("1"), card("1"), card("")] },
    C: { code: "C", nameJa: null, nameEn: null, releaseDate: null, cards: [
      { ...card("1", null), nameJa: "キャタピー" }, { ...card("2", null), nameJa: "なぞ" }, { ...card("3", "Limitless Name"), nameJa: "キャタピー" }, { ...card("4", null), nameJa: "なぞ" }] },
    B: { code: "B", nameJa: null, nameEn: null, releaseDate: null, cards: [card("1")] },
  };
  return { ...real, limitless: { ...real.limitless,
    listSets: vi.fn(async () => [
      { code: "A", nameEn: null, releaseDate: null, cardCount: 999, series: null },
      { code: "C", nameEn: null, releaseDate: null, cardCount: 4, series: null },
      { code: "B", nameEn: "B set", releaseDate: null, cardCount: 5, series: null }]),
    getSet: vi.fn(async (c: string) => { if (c === "B") throw new Error("boom"); return pages[c]; }),
    ourSetIdFor: vi.fn((c: string) => (c === "A" ? "SVA" : c === "C" ? "SVC" : null)) } };
});
const existingRows = [
  { id: "SVC-002", set_id: "SVC", number_printed: "002", number_num: 2, number_denom: null, number_suffix: null, name_en: "Kept Name", name_ja: "なぞ", rarity: null, language: "ja", image_url: null, image_source: null },
  { id: "SVC-004", set_id: "SVC", number_printed: "004", number_num: 4, number_denom: null, number_suffix: null, name_en: null, name_ja: "なぞ", rarity: null, language: "ja", image_url: null, image_source: null },
];
const sets: Record<string, unknown>[][] = [];
const prods: Record<string, unknown>[][] = [];
vi.mock("@pcg/db", async (orig) => ({
  ...(await orig<typeof import("@pcg/db")>()),
  loadSetIds: vi.fn(async () => new Set(["SVA", "SVC"])),
  loadSetRow: vi.fn(async () => ({ id: "SVA", printed_code: "SVA", language: "ja", name_en: "Old EN", name_ja: "旧", release_date: "2020-01-01", card_count: 86, aliases: ["old"], series: "S" })),
  loadSetProducts: vi.fn(async (_d: unknown, id: string) => (id === "SVC" ? existingRows : [])),
  upsertSets: vi.fn(async (_d: unknown, r: Record<string, unknown>[]) => { sets.push(r); }),
  upsertProducts: vi.fn(async (_d: unknown, r: Record<string, unknown>[]) => { prods.push(r); }),
}));

describe("catalog:limitless", () => {
  it("keeps TCGdex values, dedupes ids and survives a failing set", async () => {
    const logs: string[] = [];
    const { catalogLimitless } = await import("../src/jobs/catalog-limitless");
    await catalogLimitless({ db: {} as never, log: (m: string) => logs.push(m) });
    expect(sets).toHaveLength(2);
    expect(sets[0]![0]).toMatchObject({ id: "SVA", card_count: 86, name_en: "Old EN", name_ja: "旧", release_date: "2020-01-01", series: "S", aliases: ["old", "A"] });
    expect(prods[0]!.map((p) => p.id)).toEqual(["SVA-001"]);
    const c = prods.find((r) => r[0]!.set_id === "SVC")!;
    // limitless name > dictionary > existing name; a null never replaces a name
    expect(c.map((p) => [p.id, p.name_en])).toEqual([["SVC-001", "Caterpie"], ["SVC-002", "Kept Name"], ["SVC-003", "Limitless Name"], ["SVC-004", null]]);
    expect(logs.some((l) => l.startsWith("set B: boom"))).toBe(true);
    expect(logs.at(-1)).toContain("1 sets failed");
  });
});
