import { describe, it, expect, vi } from "vitest";
import { runJob } from "../src/run";

function fakeDb() {
  const runs: Record<string, unknown>[] = [];
  const upd: Record<string, unknown>[] = [];
  return {
    runs, upd,
    from: () => ({
      insert: (r: Record<string, unknown>) => ({ select: () => ({ single: async () => { runs.push(r); return { data: { id: "run-1" }, error: null }; } }) }),
      update: (p: Record<string, unknown>) => ({ eq: async () => { upd.push(p); return { data: null, error: null }; } }),
    }),
  } as unknown as import("@pcg/db").Db & { runs: unknown[]; upd: Record<string, unknown>[] };
}

describe("runJob", () => {
  it("skips when the kill switch is off", async () => {
    const db = fakeDb();
    const job = vi.fn();
    expect(await runJob("yahoo:auctions", job, { db, env: { CONNECTOR_YAHOO_AUC: "off" } })).toBe("skipped");
    expect(job).not.toHaveBeenCalled();
  });
  it("records ok with stats", async () => {
    const db = fakeDb();
    const r = await runJob("fx:daily", async () => ({ items_seen: 3, items_new: 3, items_updated: 0 }), { db, env: {} });
    expect(r).toBe("ok");
    expect(db.upd[0]).toMatchObject({ status: "ok", items_new: 3 });
  });
  it("records failed with the error and does not throw", async () => {
    const db = fakeDb();
    const r = await runJob("ebay:sold", async () => { throw new Error("boom"); }, { db, env: {} });
    expect(r).toBe("failed");
    expect(JSON.stringify(db.upd[0]!.errors)).toContain("boom");
  });
  it("records suspect", async () => {
    const db = fakeDb();
    expect(await runJob("yahoo:auctions", async () => ({ items_seen: 0, items_new: 0, items_updated: 0, suspect: true }), { db, env: {} })).toBe("suspect");
  });
  it("returns failed without throwing when startRun's insert fails", async () => {
    const db = {
      from: () => ({
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "insert failed" } }) }) }),
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
      }),
    } as unknown as import("@pcg/db").Db;
    const job = vi.fn();
    const r = await runJob("fx:daily", job, { db, env: {} });
    expect(r).toBe("failed");
    expect(job).not.toHaveBeenCalled();
  });
  it("returns failed without throwing when no db is given and credentials are missing", async () => {
    const savedUrl = process.env.SUPABASE_URL;
    const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const job = vi.fn();
      const r = await runJob("fx:daily", job, { env: {} });
      expect(r).toBe("failed");
      expect(job).not.toHaveBeenCalled();
    } finally {
      if (savedUrl !== undefined) process.env.SUPABASE_URL = savedUrl;
      if (savedKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
    }
  });
});
