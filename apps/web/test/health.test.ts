import { describe, it, expect } from "vitest";
import { formatCursor, summarise, resultLine } from "../lib/health";
const run = (job: string, status: "ok" | "failed" | "suspect" | "running", started_at: string, extra: Partial<{ items_seen: number; items_new: number; errors: unknown[]; finished_at: string | null }> = {}) => ({ id: `${job}-${started_at}`, job, status, started_at, finished_at: started_at, items_seen: 0, items_new: 0, items_updated: 0, errors: [], ...extra });
describe("health helpers", () => {
  it("formats cursors", () => {
    expect(formatCursor({ page: 3, since: "2026-09-21T06:10:00Z" })).toBe("page 3 · 2026-09-21T06:10Z");
    expect(formatCursor("2026-09-20T18:00:00.000Z")).toBe("2026-09-20T18:00Z"); expect(formatCursor(null)).toBe("—");
  });
  it("summarises latest run per job, failures first", () => {
    const s = summarise([run("prices", "ok", "2026-09-21T06:09:00Z"), run("ebay:sold", "failed", "2026-09-21T02:03:00Z", { errors: [{ message: "thecardapi 401: key expired" }] }), run("ebay:sold", "ok", "2026-09-20T20:00:00Z"), run("yahoo:auctions", "suspect", "2026-09-21T02:01:00Z")]);
    expect(s.map((x) => x.job)).toEqual(["ebay:sold", "yahoo:auctions", "prices"]); expect(s[0]!.err).toBe("thecardapi 401: key expired");
  });
  it("result lines", () => {
    expect(resultLine(run("ebay:sold-comps", "ok", "x", { items_seen: 312, items_new: 41 }))).toBe("OK · 312 seen, 41 new");
    expect(resultLine(run("catalog:tcgdex", "ok", "x", { items_seen: 512, items_new: 38940 }))).toBe("OK · 512 sets, 38,940 cards");
    expect(resultLine(run("yahoo:auctions", "suspect", "x", { items_seen: 0 }))).toBe("Suspect: 0 seen, 0 new");
  });
});
