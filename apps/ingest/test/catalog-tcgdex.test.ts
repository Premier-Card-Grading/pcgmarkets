import { describe, it, expect, vi, beforeAll } from "vitest";

// SV4a is Limitless-owned (its name_ja, aliases, names and images came from catalog:limitless); sv1 is a TCGdex-owned EN set
// whose card sv1-001 has a pokemontcg.io image from images:en because TCGdex has none.
const ja = { id: "SV4a", name: "レイジングサーフ", releaseDate: "2023-12-01", cardCount: { total: 2, official: 190 }, serie: { id: "SV", name: "x" }, cards: [
  { id: "SV4a-001", localId: "001", name: "ナゾノクサ", image: null },
  { id: "SV4a-002", localId: "002", name: "ピカチュウ", image: "https://assets.tcgdex.net/ja/SV/SV4a/002" },
] };
const en = { id: "sv1", name: "Scarlet & Violet", releaseDate: "2023-03-31", cardCount: { total: 2, official: 198 }, serie: { id: "sv", name: "Scarlet & Violet" }, cards: [
  { id: "sv1-001", localId: "001", name: "Pineco", image: null },
  { id: "sv1-002", localId: "002", name: "Forretress", image: "https://assets.tcgdex.net/en/sv/sv1/002" },
  { id: "sv1-003", localId: "003", name: "Scyther", image: null },
  { id: "sv1-004", localId: "004", name: "Scizor", image: "https://assets.tcgdex.net/en/sv/sv1/004" },
] };
vi.mock("@pcg/connectors", async (orig) => {
  const real = await orig<typeof import("@pcg/connectors")>();
  return { ...real, tcgdex: { ...real.tcgdex,
    listSets: vi.fn(async (l: string) => (l === "ja" ? [ja] : [en])),
    getSet: vi.fn(async (_l: string, id: string) => (id === "SV4a" ? ja : en)),
    JA_SUPPLEMENT_SETS: [] } };
});
const row = (o: Record<string, unknown>) => ({ number_printed: "001", number_num: 1, number_denom: null, number_suffix: null, rarity: null, image_url: null, image_source: null, ...o });
const stored: Record<string, Record<string, unknown>[]> = {
  SV4a: [row({ id: "SV4a-001", set_id: "SV4a", name_en: "Oddish", name_ja: "ナゾノクサ", language: "ja", rarity: "C", image_url: "https://x.supabase.co/card-images/SV4a-001.webp", image_source: "limitless" })],
  sv1: [
    row({ id: "sv1-001", set_id: "sv1", name_en: "Pineco", name_ja: null, language: "en", number_denom: 198, image_url: "https://images.pokemontcg.io/sv1/1_hires.png", image_source: "pokemontcg" }),
    row({ id: "sv1-002", set_id: "sv1", name_en: "Forretress", name_ja: null, language: "en", number_denom: 198, image_url: "https://images.pokemontcg.io/sv1/2_hires.png", image_source: "pokemontcg" }),
    row({ id: "sv1-004", set_id: "sv1", name_en: "Scizor", name_ja: null, language: "en", number_denom: 198, image_url: "/card-images/en/sv1/sv1-004.webp", image_source: "tcgdex" }),
  ],
};
const upserts: { table: string; rows: Record<string, unknown>[] }[] = [];
vi.mock("@pcg/db", async (orig) => ({
  ...(await orig<typeof import("@pcg/db")>()),
  loadLimitlessOwnedSetIds: vi.fn(async () => new Set(["SV4a"])),
  loadSetProducts: vi.fn(async (_db: unknown, id: string) => stored[id] ?? []),
  upsertSets: vi.fn(async (_db: unknown, rows: Record<string, unknown>[]) => { upserts.push({ table: "sets", rows }); }),
  upsertProducts: vi.fn(async (_db: unknown, rows: Record<string, unknown>[]) => { upserts.push({ table: "products", rows }); }),
}));

const products = () => upserts.filter((u) => u.table === "products").flatMap((u) => u.rows);
const sets = () => upserts.filter((u) => u.table === "sets").flatMap((u) => u.rows);

describe("catalog:tcgdex", () => {
  beforeAll(async () => {
    const { catalogTcgdex } = await import("../src/jobs/catalog-tcgdex");
    await catalogTcgdex({ db: {} as never, log: () => {} });
  });

  it("C2: never writes a Limitless-owned set row (name_ja, aliases, release date stay Limitless's)", () => {
    expect(sets().find((s) => s.id === "SV4a")).toBeUndefined();
  });

  it("C2: leaves stored cards on a Limitless-owned set untouched and inserts only new cards, as whole rows", () => {
    const owned = products().filter((p) => p.set_id === "SV4a");
    expect(owned.map((p) => p.id)).toEqual(["SV4a-002"]);
    expect(owned[0]).toMatchObject({ id: "SV4a-002", name_ja: "ピカチュウ", name_en: "Pikachu", language: "ja", rarity: null, image_source: "tcgdex" });
    for (const k of ["number_printed", "number_num", "number_denom", "number_suffix", "image_url"]) expect(owned[0]).toHaveProperty(k);
  });

  it("C1: keeps a stored pokemontcg.io image when TCGdex has none, but takes TCGdex's when it has one", () => {
    const byId = new Map(products().filter((p) => p.set_id === "sv1").map((p) => [p.id, p]));
    expect(byId.get("sv1-001")).toMatchObject({ image_url: "https://images.pokemontcg.io/sv1/1_hires.png", image_source: "pokemontcg" });
    expect(byId.get("sv1-002")).toMatchObject({ image_url: "https://assets.tcgdex.net/en/sv/sv1/002/high.webp", image_source: "tcgdex" });
    // every row in a batch carries the image keys (supabase-js fills missing keys with null across a batch)
    expect(byId.get("sv1-003")).toMatchObject({ image_url: null, image_source: null });
  });

  it("C1: keeps our own copy of an image (images:mirror) over TCGdex's remote URL", () => {
    expect(products().find((p) => p.id === "sv1-004")).toMatchObject({ image_url: "/card-images/en/sv1/sv1-004.webp", image_source: "tcgdex" });
  });

  it("still writes TCGdex-owned set rows", () => {
    expect(sets().find((s) => s.id === "sv1")).toMatchObject({ name_en: "Scarlet & Violet", language: "en" });
  });
});
