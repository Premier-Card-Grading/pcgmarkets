import { describe, it, expect } from "vitest";
import type { Db } from "../src/client";
import { loadCatalog, limitlessLabel } from "../src/repo/catalog";

/** Chainable fake per table: records builder calls; range() resolves a slice of that table's rows; awaiting without range() resolves everything. */
function fakeDb(tables: Record<string, unknown[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const db = {
    from(table: string) {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order"]) b[m] = (...args: unknown[]) => { calls.push({ table, method: m, args }); return b; };
      b.range = (from: number, to: number) => { calls.push({ table, method: "range", args: [from, to] }); return Promise.resolve({ data: tables[table]!.slice(from, to + 1), error: null }); };
      b.then = (res: (v: unknown) => unknown) => res({ data: tables[table], error: null });
      return b;
    },
  };
  return { db: db as unknown as Db, calls };
}

describe("loadCatalog", () => {
  it("pages sets and products with a unique order", async () => {
    const sets = Array.from({ length: 1200 }, (_, i) => ({ id: `S${String(i).padStart(4, "0")}`, printed_code: null, language: "ja", name_en: null, name_ja: null, release_date: null, card_count: null, aliases: [] }));
    const products = Array.from({ length: 2500 }, (_, i) => ({ id: `P${i}`, set_id: "S0000", number_num: i, number_denom: null, number_suffix: null, language: "ja" }));
    const { db, calls } = fakeDb({ sets, products });
    const cat = await loadCatalog(db);
    expect(cat).toBeDefined();
    for (const t of ["sets", "products"]) {
      expect(calls.filter((c) => c.table === t && c.method === "order").map((c) => c.args[0])).toContain("id");
      expect(calls.filter((c) => c.table === t && c.method === "range").length).toBeGreaterThan(1);
    }
  });
});

describe("limitlessLabel", () => {
  it("recovers Limitless's card label from our id, which image URLs use", () => {
    expect(limitlessLabel("SV11B-001", "SV11B")).toBe("1");
    expect(limitlessLabel("HS-1a", "HS")).toBe("1a");
    expect(limitlessLabel("BGS-NAN1", "BGS")).toBe("NAN1");
    expect(limitlessLabel("ja-SV1-012", "ja-SV1")).toBe("12");
  });
});
