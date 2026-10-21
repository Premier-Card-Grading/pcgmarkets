import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSetsIndex, loadSetPage } from "../lib/sets-data";

type Chain = { table: string; calls: [string, unknown[]][] };
type Res = { data?: unknown; count?: number | null; error: { message: string } | null };
/** Fake supabase: every chain is recorded; awaiting it (or maybeSingle/range) resolves `respond(chain)`. */
function fakeDb(respond: (c: Chain) => Res) {
  const chains: Chain[] = [];
  const db = {
    from(table: string) {
      const chain: Chain = { table, calls: [] };
      chains.push(chain);
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "range", "maybeSingle"]) b[m] = (...args: unknown[]) => { chain.calls.push([m, args]); return b; };
      b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(respond(chain)).then(ok, bad);
      return b;
    },
  };
  return { db: db as unknown as SupabaseClient, chains };
}
const isHead = (c: Chain) => c.calls.some(([m, a]) => m === "select" && (a[1] as { head?: boolean } | undefined)?.head);
const setRow = { id: "SV4a", printed_code: "SV4a", name_en: "Shiny Treasure ex", name_ja: "シャイニートレジャーex", release_date: "2023-12-01", card_count: 190, logo_url: null, series: "Scarlet & Violet", aliases: [], language: "ja", products: [{ count: 1 }] };

describe("loadSetsIndex", () => {
  it("throws when the sale counts fail instead of showing zero sales", async () => {
    const { db } = fakeDb((c) => (c.table === "set_sale_counts" ? { data: null, error: { message: "boom" } } : isHead(c) ? { count: 1, error: null } : { data: [setRow], error: null }));
    await expect(loadSetsIndex(db, "ja")).rejects.toThrow(/boom/);
  });
  it("throws when a language count fails", async () => {
    const { db } = fakeDb((c) => (c.table === "set_sale_counts" ? { data: [], error: null } : isHead(c) ? { count: null, error: { message: "count failed" } } : { data: [setRow], error: null }));
    await expect(loadSetsIndex(db, "ja")).rejects.toThrow(/count failed/);
  });
});

describe("loadSetPage", () => {
  it("loads only this set's sale count", async () => {
    const { db, chains } = fakeDb((c) => (c.table === "set_sale_counts" ? { data: [{ id: "SV4a", sale_count: 7 }], error: null } : c.table === "sets" ? { data: setRow, error: null } : { data: [], error: null }));
    const page = await loadSetPage(db, "SV4a");
    expect(page!.set.saleCount).toBe(7);
    const sales = chains.find((c) => c.table === "set_sale_counts")!;
    expect(sales.calls).toContainEqual(["eq", ["id", "SV4a"]]);
  });
});
