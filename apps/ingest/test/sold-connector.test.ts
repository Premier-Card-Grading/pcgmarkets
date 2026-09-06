import { describe, it, expect, vi } from "vitest";
import { soldConnectorJob } from "../src/jobs/sold-connector";
import { PausedError } from "@pcg/connectors";
import type { RawListing } from "@pcg/domain";

vi.mock("@pcg/db", () => {
  const cursors: Record<string, unknown> = {};
  const saved: RawListing[] = [];
  return {
    getCursor: async (_db: unknown, c: string) => cursors[c] ?? null,
    setCursor: async (_db: unknown, c: string, v: unknown) => { cursors[c] = v; },
    upsertRawListings: async (_db: unknown, ls: RawListing[]) => { saved.push(...ls); return { inserted: ls.length, updated: 0 }; },
    __state: { cursors, saved },
  };
});
const db = await import("@pcg/db") as unknown as { __state: { cursors: Record<string, unknown>; saved: RawListing[] } };

const listing = (id: string): RawListing => ({ source: "yahoo_auc", sourceItemId: id, url: "u", title: "t", description: null, price: 1, currency: "JPY", kind: "sold", soldAt: null, endedAt: null, isBestOffer: false, sellerCountry: "JP", externalItemId: null, imageUrls: [], metadata: {}, raw: {} });

describe("soldConnectorJob", () => {
  it("persists page then cursor, and reports stats", async () => {
    const conn = { name: "yahoo_auc" as const, async *fetchSold() { yield { listings: [listing("a"), listing("b")], nextCursor: { p: 2 } }; yield { listings: [listing("c")], nextCursor: { p: 3 } }; } };
    const stats = await soldConnectorJob(conn)({ db: {} as never, log: () => {} });
    expect(stats).toMatchObject({ items_seen: 3, items_new: 3 });
    expect(db.__state.cursors["yahoo_auc"]).toEqual({ p: 3 });
  });
  it("stops cleanly on PausedError and keeps the last committed cursor", async () => {
    const conn = { name: "yahoo_auc" as const, async *fetchSold() { yield { listings: [listing("d")], nextCursor: { p: 9 } }; throw new PausedError(429, "x"); } };
    const stats = await soldConnectorJob(conn)({ db: {} as never, log: () => {} });
    expect(stats.items_new).toBe(1);
    expect(db.__state.cursors["yahoo_auc"]).toEqual({ p: 9 });
  });
  it("marks suspect when a page reports it", async () => {
    const conn = { name: "yahoo_auc" as const, async *fetchSold() { yield { listings: [], nextCursor: null, suspect: true }; } };
    expect((await soldConnectorJob(conn)({ db: {} as never, log: () => {} })).suspect).toBe(true);
  });
});
