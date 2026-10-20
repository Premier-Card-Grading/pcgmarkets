import { describe, it, expect, vi } from "vitest";

vi.mock("@pcg/connectors", async (orig) => {
  const real = await orig<typeof import("@pcg/connectors")>();
  const set = { id: "SV11B", name: "ブラックボルト", releaseDate: "2025-06-06", cardCount: { total: 1, official: 86 }, serie: { id: "SV", name: "x" }, cards: [{ id: "SV11B-001", localId: "001", name: "ツタージャ", image: null }] };
  return { ...real, tcgdex: { ...real.tcgdex, listSets: vi.fn(async (l: string) => (l === "ja" ? [set] : [])), getSet: vi.fn(async () => set), JA_SUPPLEMENT_SETS: [] } };
});
const upserts: { table: string; rows: Record<string, unknown>[] }[] = [];
vi.mock("@pcg/db", async (orig) => ({
  ...(await orig<typeof import("@pcg/db")>()),
  loadLimitlessOwnedSetIds: vi.fn(async () => new Set(["SV11B"])),
  upsertSets: vi.fn(async (_db: unknown, rows: Record<string, unknown>[]) => { upserts.push({ table: "sets", rows }); }),
  upsertProducts: vi.fn(async (_db: unknown, rows: Record<string, unknown>[]) => { upserts.push({ table: "products", rows }); }),
}));

describe("catalog:tcgdex on a Limitless-owned set", () => {
  it("never writes the fields Limitless owns", async () => {
    const { catalogTcgdex } = await import("../src/jobs/catalog-tcgdex");
    await catalogTcgdex({ db: {} as never, log: () => {} });
    const product = upserts.find((u) => u.table === "products")!.rows[0]!;
    const set = upserts.find((u) => u.table === "sets" && u.rows[0]?.id === "SV11B")!.rows[0]!;
    for (const k of ["name_en", "rarity", "image_url", "image_source"]) expect(product).not.toHaveProperty(k);
    for (const k of ["name_en", "series", "logo_url"]) expect(set).not.toHaveProperty(k);
    expect(product).toMatchObject({ id: "SV11B-001", name_ja: "ツタージャ" });
  });
});
