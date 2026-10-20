// apps/ingest/test/pricecharting-jobs.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => ({
  lastOk: null as null | { id: string; fetched_at: string; row_count: number },
  imports: [] as { id: string; status: string; notes: string | null }[],
  upserted: 0, deletedStale: false, links: [] as unknown[], estimates: [] as unknown[],
  failUpsert: false,
  setMap: null as null | unknown[], pcRows: null as null | unknown[], cands: null as null | unknown[],
}));
vi.mock("@pcg/db", () => ({
  lastOkImport: async () => state.lastOk,
  startImport: async () => { state.imports.push({ id: "imp1", status: "suspect", notes: "in progress" }); return "imp1"; },
  finishImport: async (_db: unknown, id: string, status: string, notes: string | null) => { const i = state.imports.find((x) => x.id === id)!; i.status = status; i.notes = notes; },
  upsertPcProducts: async (_db: unknown, _id: string, rows: unknown[]) => { if (state.failUpsert) throw new Error("db down"); state.upserted += rows.length; },
  deleteStalePcProducts: async () => { state.deletedStale = true; },
  loadSetMap: async () => state.setMap ?? [{ setId: "sv03.5", consoleName: "Pokemon Scarlet & Violet 151", eraOverride: null }],
  loadPcProductsForConsoles: async () => state.pcRows ?? [
    { pcId: "5001", consoleName: "Pokemon Scarlet & Violet 151", productName: "Blastoise ex #200", cardNumber: "200" },
    { pcId: "5003", consoleName: "Pokemon Scarlet & Violet 151", productName: "Blastoise ex [Reverse Holo] #9", cardNumber: "9" },
    { pcId: "5009", consoleName: "Pokemon Scarlet & Violet 151", productName: "Overridden #1", cardNumber: "1" },
  ],
  loadAllConsoleCounts: async () => new Map([["Pokemon Scarlet & Violet 151", 3], ["Pokemon Base Set", 2]]),
  loadLinkCandidates: async () => state.cands ?? [{ id: "sv03.5-200", setId: "sv03.5", numberNum: 200, numberPrinted: "200/165" }, { id: "sv03.5-9", setId: "sv03.5", numberNum: 9, numberPrinted: "009/165" }],
  loadOverriddenPcIds: async () => new Set(["5009"]),
  upsertPcLinks: async (_db: unknown, rows: unknown[]) => { state.links = rows; },
  loadLinkedForEstimates: async () => [
    { productId: "sv03.5-200", language: "en", setId: "sv03.5", releaseDate: "2023-09-22", salesVolume: 412, pricesUsd: { "10": 1240, "9": 110 } },
    { productId: "nodate-1", language: "en", setId: "x", releaseDate: null, salesVolume: 1, pricesUsd: { "10": 10 } },
  ],
  loadPcgGradedPairs: async () => new Set(["sv03.5-200|10"]),
  replaceEstimates: async (_db: unknown, rows: unknown[]) => { state.estimates = rows; return rows.length; },
}));

const { pricechartingCsvJob } = await import("../src/jobs/pricecharting-csv");
const { linkMapped } = await import("../src/jobs/pricecharting-link");
const { estimatesJob } = await import("../src/jobs/estimates");
const csv = readFileSync(new URL("../../../packages/connectors/test/fixtures/pricecharting-sample.csv", import.meta.url), "utf8");
const ctx = { db: {} as never, log: () => {} };

beforeEach(() => { Object.assign(state, { lastOk: null, imports: [], upserted: 0, deletedStale: false, links: [], estimates: [], failUpsert: false, setMap: null, pcRows: null, cands: null }); process.env.PRICECHARTING_TOKEN = "t"; });

describe("pricecharting:csv", () => {
  it("imports, marks ok only after the upsert, drops stale rows, and links mapped sets", async () => {
    const stats = await pricechartingCsvJob({ download: async () => csv })(ctx);
    expect(state.upserted).toBe(7);
    expect(state.deletedStale).toBe(true);
    expect(state.imports[0]).toMatchObject({ status: "ok", notes: null });
    expect(stats.suspect).toBeUndefined();
    expect(state.links).toEqual([
      { pc_id: "5001", state: "linked", product_id: "sv03.5-200", review_reason: null },
      { pc_id: "5003", state: "needs_review", product_id: null, review_reason: "variant" },
    ]); // 5009 is an admin override and is never touched
  });
  it("is suspect and replaces nothing when the row count drops more than 20%", async () => {
    state.lastOk = { id: "old", fetched_at: new Date().toISOString(), row_count: 100 };
    const stats = await pricechartingCsvJob({ download: async () => csv })(ctx);
    expect(stats.suspect).toBe(true);
    expect(state.upserted).toBe(0);
    expect(state.deletedStale).toBe(false);
  });
  it("is suspect and replaces nothing when too many rows are malformed", async () => {
    const stats = await pricechartingCsvJob({ download: async () => csv.trimEnd() + "\n9999,Extra,Field,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18\n" })(ctx);
    expect(stats.suspect).toBe(true);
    expect(state.upserted).toBe(0);
    expect(state.deletedStale).toBe(false);
  });
  it("leaves the import suspect if the upsert dies halfway", async () => {
    state.failUpsert = true;
    await expect(pricechartingCsvJob({ download: async () => csv })(ctx)).rejects.toThrow("db down");
    expect(state.imports[0]!.status).toBe("suspect");
  });
  it("fails fast without a token", async () => {
    delete process.env.PRICECHARTING_TOKEN;
    await expect(pricechartingCsvJob({ download: async () => csv })(ctx)).rejects.toThrow("PRICECHARTING_TOKEN");
  });
});

describe("estimates", () => {
  it("is suspect and keeps existing estimates when the latest ok import is older than 7 days", async () => {
    state.lastOk = { id: "imp0", fetched_at: new Date(Date.now() - 8 * 86400000).toISOString(), row_count: 7 };
    expect((await estimatesJob(ctx)).suspect).toBe(true);
    expect(state.estimates).toEqual([]);
  });
  it("skips graded pairs and cards without an era, and stamps the import", async () => {
    const at = new Date().toISOString();
    state.lastOk = { id: "imp1", fetched_at: at, row_count: 7 };
    await estimatesJob(ctx);
    expect(state.estimates).toEqual([{ product_id: "sv03.5-200", grade_value: 9, estimate_usd: 66, pct: 0.6, era: "modern", import_id: "imp1", source_as_of: at }]);
  });
  it("fails clearly when there has never been an ok import", async () => {
    await expect(estimatesJob(ctx)).rejects.toThrow("pricecharting:csv");
  });
});

describe("linkMapped with several sets on one console", () => {
  const C = "Pokemon Shared";
  const setup = (cands: unknown[]) => {
    state.setMap = [{ setId: "a", consoleName: C, eraOverride: null }, { setId: "b", consoleName: C, eraOverride: null }];
    state.pcRows = [{ pcId: "7001", consoleName: C, productName: "Card #5", cardNumber: "5" }];
    state.cands = cands;
  };
  it("links to the only set that has the number", async () => {
    setup([{ id: "a-5", setId: "a", numberNum: 5, numberPrinted: "5/10" }, { id: "b-6", setId: "b", numberNum: 6, numberPrinted: "6/10" }]);
    const r = await linkMapped({} as never, () => {});
    expect(r).toEqual({ linked: 1, review: 0 });
    expect(state.links).toEqual([{ pc_id: "7001", state: "linked", product_id: "a-5", review_reason: null }]);
  });
  it("sends colliding numbers to review as ambiguous", async () => {
    setup([{ id: "a-5", setId: "a", numberNum: 5, numberPrinted: "5/10" }, { id: "b-5", setId: "b", numberNum: 5, numberPrinted: "5/12" }]);
    await linkMapped({} as never, () => {});
    expect(state.links).toEqual([{ pc_id: "7001", state: "needs_review", product_id: null, review_reason: "ambiguous" }]);
  });
  it("logs the multi-set mapping", async () => {
    setup([]);
    const logs: string[] = [];
    await linkMapped({} as never, (m) => logs.push(m));
    expect(logs).toContain(`console "${C}" is mapped to several sets: a, b; matching against all of them`);
  });
});
