import { describe, it, expect, vi } from "vitest";

const card = (number: string, nameEn: string | null = "N") => ({ number, nameJa: "ジャ", nameEn, type: null, rarity: "C", imageXs: null });
vi.mock("@pcg/connectors", async (orig) => {
  const real = await orig<typeof import("@pcg/connectors")>();
  const pages: Record<string, unknown> = {
    A: { code: "A", nameJa: null, nameEn: null, releaseDate: null, cards: [card("1"), card("1"), card("")] },
    B: { code: "B", nameJa: null, nameEn: null, releaseDate: null, cards: [card("1")] },
  };
  return { ...real, limitless: { ...real.limitless,
    listSets: vi.fn(async () => [
      { code: "A", nameEn: null, releaseDate: null, cardCount: 999, series: null },
      { code: "B", nameEn: "B set", releaseDate: null, cardCount: 5, series: null }]),
    getSet: vi.fn(async (c: string) => { if (c === "B") throw new Error("boom"); return pages[c]; }),
    ourSetIdFor: vi.fn((c: string) => (c === "A" ? "SVA" : null)) } };
});
const sets: Record<string, unknown>[][] = [];
const prods: Record<string, unknown>[][] = [];
vi.mock("@pcg/db", async (orig) => ({
  ...(await orig<typeof import("@pcg/db")>()),
  loadSetIds: vi.fn(async () => new Set(["SVA"])),
  loadSetRow: vi.fn(async () => ({ id: "SVA", printed_code: "SVA", language: "ja", name_en: "Old EN", name_ja: "旧", release_date: "2020-01-01", card_count: 86, aliases: ["old"], series: "S" })),
  loadSetProducts: vi.fn(async () => []),
  upsertSets: vi.fn(async (_d: unknown, r: Record<string, unknown>[]) => { sets.push(r); }),
  upsertProducts: vi.fn(async (_d: unknown, r: Record<string, unknown>[]) => { prods.push(r); }),
}));

describe("catalog:limitless", () => {
  it("keeps TCGdex values, dedupes ids and survives a failing set", async () => {
    const logs: string[] = [];
    const { catalogLimitless } = await import("../src/jobs/catalog-limitless");
    await catalogLimitless({ db: {} as never, log: (m: string) => logs.push(m) });
    expect(sets).toHaveLength(1);
    expect(sets[0]![0]).toMatchObject({ id: "SVA", card_count: 86, name_en: "Old EN", name_ja: "旧", release_date: "2020-01-01", series: "S", aliases: ["old", "A"] });
    expect(prods[0]!.map((p) => p.id)).toEqual(["SVA-001"]);
    expect(logs.some((l) => l.startsWith("set B: boom"))).toBe(true);
    expect(logs.at(-1)).toContain("1 sets failed");
  });
});
