import { describe, it, expect, vi } from "vitest";

const card = (number: string, nameEn: string | null = "N") => ({ number, nameJa: "ジャ", nameEn, type: null, rarity: "C", imageXs: null });
vi.mock("@pcg/connectors", async (orig) => {
  const real = await orig<typeof import("@pcg/connectors")>();
  const pages: Record<string, unknown> = {
    A: { code: "A", nameJa: null, nameEn: null, releaseDate: null, cards: [card("1"), card("1"), card("")] },
    C: { code: "C", nameJa: null, nameEn: null, releaseDate: null, cards: [
      { ...card("1", null), nameJa: "キャタピー" }, { ...card("2", null), nameJa: "なぞ" }, { ...card("3", "Limitless Name"), nameJa: "なぞ3" }, { ...card("4", null), nameJa: "なぞ" }] },
    XY2: { code: "XY2", nameJa: null, nameEn: null, releaseDate: null, cards: [{ ...card("55", null), nameJa: "リザードンEX", type: "N Mega Evolution", rarity: "Double Rare" }] },
    M6: { code: "M6", nameJa: null, nameEn: null, releaseDate: null, cards: [
      { ...card("98", "Pokemon Catcher"), nameJa: "とくちゅうチョッキ" }, { ...card("99", "Special Vest"), nameJa: "ポケモンキャッチャー" },
      { ...card("10", null), nameJa: "ロケット団のミュウツーex" }, { ...card("11", "Zacian-V"), nameJa: "ザシアンV" }] },
    B: { code: "B", nameJa: null, nameEn: null, releaseDate: null, cards: [card("1")] },
  };
  return { ...real, limitless: { ...real.limitless,
    listSets: vi.fn(async () => [
      { code: "A", nameEn: null, releaseDate: null, cardCount: 999, series: null },
      { code: "C", nameEn: null, releaseDate: null, cardCount: 4, series: null },
      { code: "XY2", nameEn: null, releaseDate: null, cardCount: 1, series: "XY" },
      { code: "M6", nameEn: null, releaseDate: null, cardCount: 4, series: "Mega" },
      { code: "B", nameEn: "B set", releaseDate: null, cardCount: 5, series: null }]),
    getSet: vi.fn(async (c: string) => { if (c === "B") throw new Error("boom"); return pages[c]; }),
    ourSetIdFor: vi.fn((c: string) => (c === "A" ? "SVA" : c === "C" ? "SVC" : c === "XY2" || c === "M6" ? c : null)) } };
});
const existingRows = [
  { id: "SVC-002", set_id: "SVC", number_printed: "002", number_num: 2, number_denom: null, number_suffix: null, name_en: "Kept Name", name_ja: "なぞ", rarity: null, language: "ja", image_url: null, image_source: null },
  { id: "SVC-004", set_id: "SVC", number_printed: "004", number_num: 4, number_denom: null, number_suffix: null, name_en: null, name_ja: "なぞ", rarity: null, language: "ja", image_url: null, image_source: null },
];
const xyRows = [{ id: "XY2-055", set_id: "XY2", number_printed: "055", number_num: 55, number_denom: null, number_suffix: null, name_en: "Charizard-EX", name_ja: "リザードンEX", rarity: null, language: "ja", image_url: null, image_source: null }];
const m6Rows = [
  { id: "M6-098", set_id: "M6", number_printed: "098", number_num: 98, number_denom: null, number_suffix: null, name_en: "Pokemon Catcher", name_ja: "とくちゅうチョッキ", rarity: null, language: "ja", image_url: null, image_source: null },
  { id: "M6-099", set_id: "M6", number_printed: "099", number_num: 99, number_denom: null, number_suffix: null, name_en: "Special Vest", name_ja: "ポケモンキャッチャー", rarity: null, language: "ja", image_url: null, image_source: null },
];
const sets: Record<string, unknown>[][] = [];
const prods: Record<string, unknown>[][] = [];
vi.mock("@pcg/db", async (orig) => ({
  ...(await orig<typeof import("@pcg/db")>()),
  loadSetIds: vi.fn(async () => new Set(["SVA", "SVC", "XY2", "M6"])),
  loadSetRow: vi.fn(async () => ({ id: "SVA", printed_code: "SVA", language: "ja", name_en: "Old EN", name_ja: "旧", release_date: "2020-01-01", card_count: 86, aliases: ["old"], series: "S" })),
  loadSetProducts: vi.fn(async (_d: unknown, id: string) => (id === "SVC" ? existingRows : id === "XY2" ? xyRows : id === "M6" ? m6Rows : [])),
  upsertSets: vi.fn(async (_d: unknown, r: Record<string, unknown>[]) => { sets.push(r); }),
  upsertProducts: vi.fn(async (_d: unknown, r: Record<string, unknown>[]) => { prods.push(r); }),
}));

describe("catalog:limitless", () => {
  it("keeps TCGdex values, dedupes ids and survives a failing set", async () => {
    const logs: string[] = [];
    const { catalogLimitless } = await import("../src/jobs/catalog-limitless");
    await catalogLimitless({ db: {} as never, log: (m: string) => logs.push(m) });
    expect(sets).toHaveLength(4);
    expect(sets[0]![0]).toMatchObject({ id: "SVA", card_count: 86, name_en: "Old EN", name_ja: "旧", release_date: "2020-01-01", series: "S", aliases: ["old", "A"] });
    expect(prods[0]!.map((p) => p.id)).toEqual(["SVA-001"]);
    const c = prods.find((r) => r[0]!.set_id === "SVC")!;
    // R15: Limitless and dictionary agree or one is present; a stored name is kept unless a rule contradicts it
    expect(c.map((p) => [p.id, p.name_en])).toEqual([["SVC-001", "Caterpie"], ["SVC-002", "Kept Name"], ["SVC-003", "Limitless Name"], ["SVC-004", null]]);
    const named = (set: string) => prods.find((r) => r[0]!.set_id === set)!.map((p) => [p.id, p.name_en]);
    // XY2-055 is a Mega Evolution: Limitless drops the M from リザードンEX
    expect(named("XY2")).toEqual([["XY2-055", "M Charizard-EX"]]);
    // M6-098/099: Limitless swapped the English names; both are dropped and logged, never kept
    expect(named("M6")).toEqual([["M6-098", null], ["M6-099", null], ["M6-010", "Team Rocket's Mewtwo ex"], ["M6-011", "Zacian V"]]);
    expect(logs.filter((l) => /^(XY2-055|M6-098|M6-099) /.test(l))).toHaveLength(3);
    expect(logs.some((l) => l.startsWith("set B: boom"))).toBe(true);
    expect(logs.at(-1)).toContain("1 sets failed");
  });
});
