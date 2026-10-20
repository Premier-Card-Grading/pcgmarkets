import { describe, it, expect } from "vitest";
import type { Db } from "../src/client";
import { loadPcgGradedPairs } from "../src/repo/estimates";
import { selectAll } from "../src/paginate";

/** Minimal chainable fake of the supabase query builder. Records every call; range() resolves the rows slice. */
function fakeDb(rows: unknown[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "gt", "order"]) {
    builder[m] = (...args: unknown[]) => { calls.push({ method: m, args }); return builder; };
  }
  builder.range = (from: number, to: number) => {
    calls.push({ method: "range", args: [from, to] });
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  };
  return { db: builder as unknown as Db, calls };
}

describe("loadPcgGradedPairs", () => {
  it("orders by product_id, grade_value and grade_label so range pages are stable", async () => {
    const { db, calls } = fakeDb([{ product_id: "p1", grade_value: 10 }]);
    await loadPcgGradedPairs(db);
    const orders = calls.filter((c) => c.method === "order").map((c) => c.args[0]);
    expect(orders).toEqual(["product_id", "grade_value", "grade_label"]);
  });
  it("returns graded keys from the fetched rows", async () => {
    const { db } = fakeDb([{ product_id: "p1", grade_value: "10" }]);
    expect([...(await loadPcgGradedPairs(db))]).toEqual(["p1|10"]);
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
