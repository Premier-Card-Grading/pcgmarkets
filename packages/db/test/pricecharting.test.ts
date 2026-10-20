import { describe, it, expect } from "vitest";
import type { Db } from "../src/client";
import { deleteUnmappedAutoLinks, loadLinkedForEstimates, loadSetMap } from "../src/repo/pricecharting";

/** Chainable fake: every builder method is recorded; range() resolves a slice of `rows`; awaiting a delete chain resolves ok. */
function fakeDb(rows: unknown[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const deletes: { eq: unknown[][]; in: unknown[][] }[] = [];
  let cur: { eq: unknown[][]; in: unknown[][] } | null = null;
  const builder: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "in", "order", "delete"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      if (m === "delete") { cur = { eq: [], in: [] }; deletes.push(cur); }
      else if (cur && m === "eq") cur.eq.push(args);
      else if (cur && m === "in") cur.in.push(args);
      return builder;
    };
  }
  builder.range = (from: number, to: number) => { calls.push({ method: "range", args: [from, to] }); return Promise.resolve({ data: rows.slice(from, to + 1), error: null }); };
  builder.then = (res: (v: unknown) => unknown) => { cur = null; return res({ data: null, error: null }); };
  return { db: builder as unknown as Db, calls, deletes };
}

describe("deleteUnmappedAutoLinks", () => {
  it("deletes only non-override links outside the keep set, in chunks of 500, and returns the count", async () => {
    const links = Array.from({ length: 1700 }, (_, i) => ({ pc_id: String(i) }));
    const keep = links.slice(0, 600).map((l) => l.pc_id);
    const { db, calls, deletes } = fakeDb(links);
    expect(await deleteUnmappedAutoLinks(db, keep)).toBe(1100);
    expect(calls.filter((c) => c.method === "eq" && c.args[0] === "is_override").length).toBeGreaterThanOrEqual(1 + deletes.length);
    expect(deletes.map((d) => (d.in[0]![1] as string[]).length)).toEqual([500, 500, 100]);
    for (const d of deletes) expect(d.eq).toContainEqual(["is_override", false]);
    const dropped = deletes.flatMap((d) => d.in[0]![1] as string[]);
    expect(dropped.some((id) => keep.includes(id))).toBe(false);
    expect(new Set(calls.filter((c) => c.method === "order").map((c) => c.args[0]))).toEqual(new Set(["pc_id"]));
  });
  it("deletes nothing when every auto link is kept", async () => {
    const { db, deletes } = fakeDb([{ pc_id: "a" }]);
    expect(await deleteUnmappedAutoLinks(db, ["a"])).toBe(0);
    expect(deletes).toEqual([]);
  });
});

describe("loadLinkedForEstimates", () => {
  it("returns the override flag and the PriceCharting console name", async () => {
    const { db, calls } = fakeDb([{ product_id: "p1", is_override: true, pc_products: { console_name: "Pokemon X", sales_volume: 3, prices_usd: { "10": 5 } }, products: { language: "en", set_id: "s1", sets: { release_date: "2020-01-01" } } }]);
    expect(await loadLinkedForEstimates(db)).toEqual([{ productId: "p1", language: "en", setId: "s1", releaseDate: "2020-01-01", salesVolume: 3, pricesUsd: { "10": 5 }, isOverride: true, consoleName: "Pokemon X" }]);
    const sel = String(calls.find((c) => c.method === "select")!.args[0]);
    expect(sel).toContain("is_override");
    expect(sel).toContain("console_name");
  });
});

describe("loadSetMap", () => {
  it("embeds the set's language", async () => {
    const { db, calls } = fakeDb([{ set_id: "s1", console_name: "Pokemon Japanese X", era_override: null, sets: { language: "ja" } }, { set_id: "s2", console_name: "Pokemon Y", era_override: "mid", sets: null }]);
    expect(await loadSetMap(db)).toEqual([
      { setId: "s1", consoleName: "Pokemon Japanese X", eraOverride: null, language: "ja" },
      { setId: "s2", consoleName: "Pokemon Y", eraOverride: "mid", language: null },
    ]);
    expect(String(calls.find((c) => c.method === "select")!.args[0])).toContain("sets(language)");
  });
});
