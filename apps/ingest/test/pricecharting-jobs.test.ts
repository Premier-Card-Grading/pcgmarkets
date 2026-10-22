// apps/ingest/test/pricecharting-jobs.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => ({
  lastOk: null as null | { id: string; fetched_at: string; row_count: number },
  imports: [] as { id: string; status: string; notes: string | null }[],
  upserted: 0, deletedStale: false, snapshots: [] as string[], links: [] as unknown[], estimates: [] as unknown[],
  failUpsert: false,
  setMap: null as null | unknown[], pcRows: null as null | unknown[], cands: null as null | unknown[],
  keptPcIds: null as null | string[], consoles: [] as string[], candSets: [] as string[], deletedAuto: 0, linkedForEstimates: null as null | unknown[],
  psaSales: [] as unknown[],
}));
vi.mock("@pcg/db", () => ({
  lastOkImport: async () => state.lastOk,
  startImport: async () => { state.imports.push({ id: "imp1", status: "suspect", notes: "in progress" }); return "imp1"; },
  finishImport: async (_db: unknown, id: string, status: string, notes: string | null) => { const i = state.imports.find((x) => x.id === id)!; i.status = status; i.notes = notes; },
  upsertPcProducts: async (_db: unknown, _id: string, rows: unknown[]) => { if (state.failUpsert) throw new Error("db down"); state.upserted += rows.length; },
  deleteStalePcProducts: async () => { state.deletedStale = true; },
  snapshotPcPrices: async (_db: unknown, id: string) => { state.snapshots.push(id); return 2; },
  loadSetMap: async () => state.setMap ?? [{ setId: "sv03.5", consoleName: "Pokemon Scarlet & Violet 151", eraOverride: null, language: "en" }],
  loadPcProductsForConsoles: async (_db: unknown, consoles: string[]) => { state.consoles = consoles; return state.pcRows ?? [
    { pcId: "5001", consoleName: "Pokemon Scarlet & Violet 151", productName: "Blastoise ex #200", cardNumber: "200" },
    { pcId: "5003", consoleName: "Pokemon Scarlet & Violet 151", productName: "Blastoise ex [Reverse Holo] #9", cardNumber: "9" },
    { pcId: "5009", consoleName: "Pokemon Scarlet & Violet 151", productName: "Overridden #1", cardNumber: "1" },
  ]; },
  loadAllConsoleCounts: async () => new Map([["Pokemon Scarlet & Violet 151", 3], ["Pokemon Base Set", 2]]),
  loadLinkCandidates: async (_db: unknown, setIds: string[]) => { state.candSets = setIds; return state.cands ?? [{ id: "sv03.5-200", setId: "sv03.5", numberNum: 200, numberPrinted: "200/165" }, { id: "sv03.5-9", setId: "sv03.5", numberNum: 9, numberPrinted: "009/165" }]; },
  loadOverriddenPcIds: async () => new Set(["5009"]),
  upsertPcLinks: async (_db: unknown, rows: unknown[]) => { state.links = rows; },
  deleteUnmappedAutoLinks: async (_db: unknown, keep: string[]) => { state.keptPcIds = keep; return state.deletedAuto; },
  loadLinkedForEstimates: async () => state.linkedForEstimates ?? [
    { productId: "sv03.5-200", language: "en", setId: "sv03.5", releaseDate: "2023-09-22", salesVolume: 412, pricesUsd: { "10": 1240, "9": 110 }, isOverride: false, consoleName: "Pokemon Scarlet & Violet 151" },
    { productId: "nodate-1", language: "en", setId: "x", releaseDate: null, salesVolume: 1, pricesUsd: { "10": 10 }, isOverride: true, consoleName: "Pokemon Other" },
  ],
  loadPcgGradedPairs: async () => new Set(["sv03.5-200|10"]),
  loadPsaSalesForEstimates: async () => state.psaSales,
  replaceEstimates: async (_db: unknown, rows: unknown[]) => { state.estimates = rows; return rows.length; },
}));

const { pricechartingCsvJob } = await import("../src/jobs/pricecharting-csv");
const { linkMapped } = await import("../src/jobs/pricecharting-link");
const { estimatesJob } = await import("../src/jobs/estimates");
const csv = readFileSync(new URL("../../../packages/connectors/test/fixtures/pricecharting-sample.csv", import.meta.url), "utf8");
const ctx = { db: {} as never, log: () => {} };

beforeEach(() => { Object.assign(state, { lastOk: null, imports: [], upserted: 0, deletedStale: false, snapshots: [], links: [], estimates: [], failUpsert: false, setMap: null, pcRows: null, cands: null, keptPcIds: null, consoles: [], candSets: [], deletedAuto: 0, linkedForEstimates: null, psaSales: [] }); process.env.PRICECHARTING_TOKEN = "t"; });

describe("pricecharting:csv", () => {
  it("imports, marks ok only after the upsert, drops stale rows, and links mapped sets", async () => {
    const stats = await pricechartingCsvJob({ download: async () => csv })(ctx);
    expect(state.upserted).toBe(7);
    expect(state.deletedStale).toBe(true);
    expect(state.imports[0]).toMatchObject({ status: "ok", notes: null });
    expect(stats.suspect).toBeUndefined();
    expect(state.snapshots).toEqual(["imp1"]); // dated copy kept: PriceCharting serves today's file only
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
    expect(state.snapshots).toEqual([]);
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
    expect(state.snapshots).toEqual([]);
  });
  it("fails fast without a token", async () => {
    delete process.env.PRICECHARTING_TOKEN;
    await expect(pricechartingCsvJob({ download: async () => csv })(ctx)).rejects.toThrow("PRICECHARTING_TOKEN");
  });
});

describe("estimates", () => {
  const psaSale = (gradeValue: number, priceUsd: number, daysAgo: number) => ({ productId: "sv03.5-200", gradeValue, priceUsd, soldAt: new Date(Date.now() - daysAgo * 86400000) });
  it("is suspect and leaves out PriceCharting prices when the latest ok import is older than 7 days, but still uses SoldComps", async () => {
    state.lastOk = { id: "imp0", fetched_at: new Date(Date.now() - 8 * 86400000).toISOString(), row_count: 7 };
    state.psaSales = [psaSale(9, 100, 1), psaSale(9, 120, 2), psaSale(9, 140, 3)];
    expect((await estimatesJob(ctx)).suspect).toBe(true);
    expect(state.estimates).toMatchObject([{ product_id: "sv03.5-200", grade_value: 9, estimate_usd: 90, source: "soldcomps", import_id: null }]);
  });
  it("skips graded pairs and cards without an era, and stamps the import, at a flat 75%", async () => {
    const at = new Date().toISOString();
    state.lastOk = { id: "imp1", fetched_at: at, row_count: 7 };
    await estimatesJob(ctx);
    expect(state.estimates).toEqual([{ product_id: "sv03.5-200", grade_value: 9, estimate_usd: 82.5, pct: 0.75, era: "modern", import_id: "imp1", source_as_of: at, source: "pricecharting" }]);
  });
  it("prefers SoldComps PSA sales over PriceCharting, dated by the newest sale used", async () => {
    state.lastOk = { id: "imp1", fetched_at: new Date().toISOString(), row_count: 7 };
    state.psaSales = [psaSale(9, 100, 1), psaSale(9, 120, 2), psaSale(9, 140, 3)];
    await estimatesJob(ctx);
    const e = (state.estimates as { source: string; estimate_usd: number; source_as_of: string; import_id: string | null }[])[0]!;
    expect(e).toMatchObject({ source: "soldcomps", estimate_usd: 90, import_id: null });
    expect(new Date(e.source_as_of).getTime()).toBe((state.psaSales[0] as { soldAt: Date }).soldAt.getTime());
  });
  it("ignores auto links whose PriceCharting console is no longer mapped to the card's set, but always keeps overrides", async () => {
    const at = new Date().toISOString();
    state.lastOk = { id: "imp1", fetched_at: at, row_count: 7 };
    const base = { language: "en", releaseDate: "2023-09-22", salesVolume: 1, pricesUsd: { "9": 100 } };
    state.linkedForEstimates = [
      { ...base, productId: "sv03.5-1", setId: "sv03.5", isOverride: false, consoleName: "Pokemon Scarlet & Violet 151" },
      { ...base, productId: "sv03.5-2", setId: "sv03.5", isOverride: false, consoleName: "Pokemon Old Console" },
      { ...base, productId: "unmapped-3", setId: "nomap", isOverride: false, consoleName: "Pokemon Scarlet & Violet 151" },
      { ...base, productId: "sv03.5-4", setId: "sv03.5", isOverride: true, consoleName: "Pokemon Anything" },
    ];
    const logs: string[] = [];
    await estimatesJob({ db: {} as never, log: (m) => logs.push(m) });
    expect((state.estimates as { product_id: string }[]).map((e) => e.product_id).sort()).toEqual(["sv03.5-1", "sv03.5-4"]);
    expect(logs).toContain("skipped 2 auto links whose PriceCharting console is no longer mapped to the card's set");
  });
  it("runs on SoldComps PSA sales alone when there has never been a PriceCharting import", async () => {
    state.psaSales = [psaSale(10, 200, 1), psaSale(10, 200, 2), psaSale(10, 220, 3), psaSale(9, 100, 1), psaSale(9, 100, 2), psaSale(9, 100, 3)];
    expect((await estimatesJob(ctx)).suspect).toBeUndefined();
    // PCG 10 already has a PCG sale, so only PCG 9 is estimated.
    expect(state.estimates).toMatchObject([{ product_id: "sv03.5-200", grade_value: 9, estimate_usd: 75, source: "soldcomps", era: null, import_id: null }]);
  });
});

describe("linkMapped stale auto links", () => {
  it("keeps the links of every PriceCharting row on a mapped console and logs how many others it deleted", async () => {
    state.deletedAuto = 4;
    const logs: string[] = [];
    await linkMapped({} as never, (m) => logs.push(m));
    expect(state.keptPcIds!.sort()).toEqual(["5001", "5003", "5009"]);
    expect(logs).toContain("deleted 4 auto links for PriceCharting rows on consoles that are no longer mapped");
  });
});

describe("linkMapped language guard", () => {
  it("skips a Japanese console mapped to a non-Japanese set and a Japanese set mapped to a non-Japanese console", async () => {
    state.setMap = [
      { setId: "en1", consoleName: "Pokemon Base Set", eraOverride: null, language: "en" },
      { setId: "en2", consoleName: "Pokemon japanese Clay Burst", eraOverride: null, language: "en" },
      { setId: "ja1", consoleName: "Pokemon Shiny Treasure ex", eraOverride: null, language: "ja" },
      { setId: "ja2", consoleName: "Pokemon Japanese Shiny Treasure ex", eraOverride: null, language: "ja" },
    ];
    state.pcRows = []; state.cands = [];
    const logs: string[] = [];
    await linkMapped({} as never, (m) => logs.push(m));
    expect(state.consoles.sort()).toEqual(["Pokemon Base Set", "Pokemon Japanese Shiny Treasure ex"]);
    expect(state.candSets.sort()).toEqual(["en1", "ja2"]);
    expect(logs).toContain(`warning: skipping set en2 mapped to console "Pokemon japanese Clay Burst": a Japanese console on a non-Japanese set`);
    expect(logs).toContain(`warning: skipping set ja1 mapped to console "Pokemon Shiny Treasure ex": a Japanese set on a non-Japanese console`);
  });
});

describe("linkMapped with several sets on one console", () => {
  const C = "Pokemon Shared";
  const setup = (cands: unknown[]) => {
    state.setMap = [{ setId: "a", consoleName: C, eraOverride: null, language: "en" }, { setId: "b", consoleName: C, eraOverride: null, language: "en" }];
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
