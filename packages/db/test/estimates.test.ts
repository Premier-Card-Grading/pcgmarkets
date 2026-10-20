import { describe, it, expect } from "vitest";
import type { Db } from "../src/client";
import { loadPcgGradedPairs } from "../src/repo/estimates";
import { selectAll } from "../src/paginate";

/** Minimal chainable fake of the supabase query builder. Records every call; range() resolves the rows slice. */
function fakeDb(rows: unknown[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "gt", "not", "order"]) {
    builder[m] = (...args: unknown[]) => { calls.push({ method: m, args }); return builder; };
  }
  builder.range = (from: number, to: number) => {
    calls.push({ method: "range", args: [from, to] });
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  };
  return { db: builder as unknown as Db, calls };
}

describe("loadPcgGradedPairs", () => {
  it("reads matched sales from public_sales, ordered by the unique sale id so range pages are stable", async () => {
    const { db, calls } = fakeDb([{ product_id: "p1", grade_value: 10 }]);
    await loadPcgGradedPairs(db);
    expect(calls.find((c) => c.method === "from")!.args[0]).toBe("public_sales");
    expect(calls.filter((c) => c.method === "order").map((c) => c.args[0])).toEqual(["id"]);
    expect(calls.filter((c) => c.method === "not").map((c) => c.args)).toEqual([["grade_value", "is", null]]);
  });
  it("does not filter out best-offer sales or sales without a USD price", async () => {
    const { db, calls } = fakeDb([]);
    await loadPcgGradedPairs(db);
    const filtered = calls.filter((c) => ["eq", "gt", "not"].includes(c.method)).map((c) => c.args[0]);
    expect(filtered).not.toContain("is_best_offer");
    expect(filtered).not.toContain("price_usd");
    expect(filtered).not.toContain("price");
  });
  it("returns graded keys for every sale row, including best-offer and unpriced ones", async () => {
    const { db } = fakeDb([
      { product_id: "p1", grade_value: "10", is_best_offer: false, price_usd: 100 },
      { product_id: "p2", grade_value: 9, is_best_offer: true, price_usd: 50 },
      { product_id: "p3", grade_value: 8.5, is_best_offer: false, price_usd: null },
      { product_id: "p1", grade_value: 10 },
      { product_id: null, grade_value: 7 },
    ]);
    expect([...(await loadPcgGradedPairs(db))].sort()).toEqual(["p1|10", "p2|9", "p3|8.5"]);
  });
  it("pages past 1000 rows", async () => {
    const { db, calls } = fakeDb(Array.from({ length: 1500 }, (_, i) => ({ product_id: `p${i}`, grade_value: 10 })));
    expect((await loadPcgGradedPairs(db)).size).toBe(1500);
    expect(calls.filter((c) => c.method === "range")).toHaveLength(2);
  });
});

describe("selectAll short page", () => {
  it("stops after a short page and does not request further ranges", async () => {
    const { db, calls } = fakeDb(Array.from({ length: 3 }, (_, i) => ({ i })));
    const out = await selectAll<{ i: number }>((f, t) => (db as unknown as { range: (f: number, t: number) => Promise<{ data: { i: number }[]; error: null }> }).range(f, t));
    expect(out).toHaveLength(3);
    expect(calls.filter((c) => c.method === "range")).toEqual([{ method: "range", args: [0, 999] }]);
  });
});
