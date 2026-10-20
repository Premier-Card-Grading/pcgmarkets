import { describe, it, expect } from "vitest";
import type { Db } from "../src/client";
import { loadMatchedSales } from "../src/repo/prices";

/** Chainable fake: records calls; range() resolves a slice; awaiting without range() returns at most 1000 rows, like Supabase. */
function fakeDb(rows: unknown[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "not", "order"]) builder[m] = (...args: unknown[]) => { calls.push({ method: m, args }); return builder; };
  builder.range = (from: number, to: number) => { calls.push({ method: "range", args: [from, to] }); return Promise.resolve({ data: rows.slice(from, to + 1), error: null }); };
  builder.then = (res: (v: unknown) => unknown) => res({ data: rows.slice(0, 1000), error: null });
  return { db: builder as unknown as Db, calls };
}
const row = (i: number, over: Record<string, unknown> = {}) => ({ product_id: `p${i}`, grade_value: 10, grade_label: "Gem Mint", price_usd: 100, sold_at: "2026-09-01T00:00:00Z", is_best_offer: false, price: 100, ...over });

describe("loadMatchedSales", () => {
  it("pages past 1000 rows instead of truncating", async () => {
    const { db, calls } = fakeDb(Array.from({ length: 2300 }, (_, i) => row(i)));
    expect(await loadMatchedSales(db)).toHaveLength(2300);
    expect(calls.filter((c) => c.method === "range").map((c) => c.args)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("orders by the unique sale id so pages are stable", async () => {
    const { db, calls } = fakeDb([]);
    await loadMatchedSales(db);
    expect(calls.filter((c) => c.method === "order").map((c) => c.args[0])).toEqual(["id"]);
  });
  it("keeps its shape and still drops best offers, unpriced and ungraded rows", async () => {
    const { db } = fakeDb([row(1, { grade_value: "9.5", grade_label: null }), row(2, { is_best_offer: true }), row(3, { price_usd: null }), row(4, { grade_value: null }), row(5, { sold_at: null }), row(6, { price: 0 })]);
    expect(await loadMatchedSales(db)).toEqual([{ productId: "p1", gradeValue: 9.5, gradeLabel: null, priceUsd: 100, soldAt: new Date("2026-09-01T00:00:00Z") }]);
  });
});
