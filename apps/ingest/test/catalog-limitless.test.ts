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
      { ...card("98", "Pokemon Catcher"), nameJa: "ポケモンキャッチャー" }, { ...card("99", "Special Vest"), nameJa: "とくちゅうチョッキ" },
      { ...card("10", null), nameJa: "ロケット団のミュウツーex" }, { ...card("11", "Zacian-V"), nameJa: "ザシアンV" },
      { ...card("12", "Porygon2"), nameJa: "ポリゴン2" }] },
    B: { code: "B", nameJa: null, nameEn: null, releaseDate: null, cards: [card("1")] },
  };
  return { ...real, limitless: { ...real.limitless,
    listSets: vi.fn(async () => [
      { code: "A", nameEn: null, releaseDate: null, cardCount: 999, series: null },
      { code: "C", nameEn: null, releaseDate: null, cardCount: 4, series: null },
      { code: "XY2", nameEn: null, releaseDate: null, cardCount: 1, series: "XY" },
      { code: "M6", nameEn: null, releaseDate: null, cardCount: 5, series: "Mega" },
      { code: "B", nameEn: "B set", releaseDate: null, cardCount: 5, series: null }]),
    getSet: vi.fn(async (c: string) => { if (c === "B") throw new Error("boom"); return pages[c]; }),
    ourSetIdFor: vi.fn((c: string) => (c === "A" ? "SVA" : c === "C" ? "SVC" : c === "XY2" || c === "M6" ? c : null)) } };
});
const existingRows = [
  { id: "SVC-002", set_id: "SVC", number_printed: "002", number_num: 2, number_denom: null, number_suffix: null, name_en: "Kept Name", name_ja: "なぞ", rarity: null, language: "ja", image_url: null, image_source: null },
  { id: "SVC-004", set_id: "SVC", number_printed: "004", number_num: 4, number_denom: null, number_suffix: null, name_en: null, name_ja: "なぞ", rarity: null, language: "ja", image_url: null, image_source: null },
];
const xyRows = [{ id: "XY2-090", set_id: "XY2", number_printed: "090/088", number_num: 90, number_denom: 88, number_suffix: null, name_en: "Old secret", name_ja: "ひみつ", rarity: null, language: "ja", image_url: null, image_source: null },
  { id: "XY2-055", set_id: "XY2", number_printed: "055", number_num: 55, number_denom: null, number_suffix: null, name_en: "Charizard-EX", name_ja: "リザードンEX", rarity: null, language: "ja", image_url: null, image_source: null }];
const m6Rows = [
  { id: "M6-098", set_id: "M6", number_printed: "098", number_num: 98, number_denom: null, number_suffix: null, name_en: "Pokemon Catcher", name_ja: "とくちゅうチョッキ", rarity: null, language: "ja", image_url: null, image_source: null },
  { id: "M6-099", set_id: "M6", number_printed: "099", number_num: 99, number_denom: null, number_suffix: null, name_en: "Special Vest", name_ja: "ポケモンキャッチャー", rarity: null, language: "ja", image_url: null, image_source: null },
  { id: "M6-012", set_id: "M6", number_printed: "012", number_num: 12, number_denom: null, number_suffix: null, name_en: "Porygon2", name_ja: "ポリゴン２", rarity: null, language: "ja", image_url: "https://x/M6-012.webp", image_source: "limitless" },
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
    // R17: Limitless owns name_ja on its sets. M6-098/099 had TCGdex's swapped name_ja; Limitless's replaces it, the stored
    // English name (which belonged to the wrong Japanese name) is not trusted, and both changes are logged.
    const m6 = new Map(prods.find((r) => r[0]!.set_id === "M6")!.map((p) => [p.id, p]));
    expect(named("M6")).toEqual([["M6-098", "Pokémon Catcher"], ["M6-099", "Special Vest"], ["M6-010", "Team Rocket's Mewtwo ex"], ["M6-011", "Zacian V"], ["M6-012", "Porygon2"]]);
    expect(m6.get("M6-098")).toMatchObject({ name_ja: "ポケモンキャッチャー" });
    expect(m6.get("M6-099")).toMatchObject({ name_ja: "とくちゅうチョッキ" });
    // same name up to width and spacing: our spelling stays, nothing logged; the rest of the row is kept
    expect(m6.get("M6-012")).toMatchObject({ name_ja: "ポリゴン２", image_url: "https://x/M6-012.webp", image_source: "limitless" });
    expect(logs.filter((l) => /^M6-09[89]: name_ja "/.test(l))).toHaveLength(2);
    expect(logs.some((l) => l.startsWith("M6-012"))).toBe(false);
    expect(logs.filter((l) => /^(XY2-055|M6-098|M6-099) /.test(l))).toHaveLength(1);
    // numbers carry the total printed on the cards, on new rows and on rows that already existed
    expect(m6.get("M6-012")).toMatchObject({ number_printed: "012/076", number_num: 12, number_denom: 76, number_suffix: null });
    expect(m6.get("M6-098")).toMatchObject({ number_printed: "098/076", number_denom: 76 });
    const xy = prods.filter((r) => r[0]!.set_id === "XY2").flat();
    expect(xy.find((p) => p.id === "XY2-055")).toMatchObject({ number_printed: "055/080", number_denom: 80 });
    // a TCGdex-only card Limitless doesn't list keeps its row but gets the printed total too
    expect(xy.find((p) => p.id === "XY2-090")).toMatchObject({ number_printed: "090/080", number_denom: 80, name_en: "Old secret" });
    expect(c[0]).toMatchObject({ number_printed: "001/021", number_num: 1, number_denom: 21 });
    expect(logs.some((l) => l.startsWith("set B: boom"))).toBe(true);
    expect(logs.at(-1)).toContain("1 sets failed");
  });
});
