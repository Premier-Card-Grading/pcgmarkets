import { describe, it, expect, vi } from "vitest";

// A JA set TCGdex owns (not Limitless): name_en comes from the dictionary, but never nulls a stored name without a reason.
vi.mock("@pcg/connectors", async (orig) => {
  const real = await orig<typeof import("@pcg/connectors")>();
  const set = { id: "PCG5", name: "まぼろしの森", releaseDate: "2005-01-01", cardCount: { total: 4, official: 4 }, serie: { id: "PCG", name: "x" }, cards: [
    { id: "PCG5-001", localId: "001", name: "ピカチュウ", image: null },
    { id: "PCG5-002", localId: "002", name: "なぞのカード", image: null },
    { id: "PCG5-003", localId: "003", name: "ロケット団のミュウツー", image: null },
    { id: "PCG5-004", localId: "004", name: "すごいきずぐすり", image: null },
  ] };
  return { ...real, tcgdex: { ...real.tcgdex, listSets: vi.fn(async (l: string) => (l === "ja" ? [set] : [])), getSet: vi.fn(async () => set), JA_SUPPLEMENT_SETS: [] } };
});
const stored = [
  { id: "PCG5-001", name_en: null },
  { id: "PCG5-002", name_en: "Kept Name" },
  { id: "PCG5-003", name_en: "Rocket's Mewtwo" },
  { id: "PCG5-004", name_en: "Super Potion" },
].map((p) => ({ ...p, set_id: "PCG5", number_printed: p.id.slice(-3), number_num: Number(p.id.slice(-3)), number_denom: 4, number_suffix: null, name_ja: null, rarity: null, language: "ja", image_url: null, image_source: null }));
const products: Record<string, unknown>[] = [];
vi.mock("@pcg/db", async (orig) => ({
  ...(await orig<typeof import("@pcg/db")>()),
  loadLimitlessOwnedSetIds: vi.fn(async () => new Set<string>()),
  loadSetProducts: vi.fn(async (_db: unknown, id: string) => (id === "PCG5" ? stored : [])),
  upsertSets: vi.fn(async () => {}),
  upsertProducts: vi.fn(async (_db: unknown, rows: Record<string, unknown>[]) => { products.push(...rows); }),
}));

describe("catalog:tcgdex names on a TCGdex-owned JA set", () => {
  it("translates, keeps uncontradicted names, and corrects retired ones with a log line", async () => {
    const logs: string[] = [];
    const { catalogTcgdex } = await import("../src/jobs/catalog-tcgdex");
    await catalogTcgdex({ db: {} as never, log: (m: string) => logs.push(m) });
    expect(products.map((p) => [p.id, p.name_en])).toEqual([
      ["PCG5-001", "Pikachu"], ["PCG5-002", "Kept Name"], ["PCG5-003", null], ["PCG5-004", null]]);
    expect(logs.filter((l) => /^PCG5-00[34] /.test(l))).toHaveLength(2);
  });
});
