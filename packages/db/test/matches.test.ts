import { describe, it, expect } from "vitest";
import { loadListingsToMatch } from "../src/repo/matches";
import type { Db } from "../src/client";

interface FakeRawListingRow {
  id: string;
  source: string;
  title: string;
  description: string | null;
  metadata: Record<string, never>;
  listing_matches: { state: string; is_override: boolean } | { state: string; is_override: boolean }[] | null;
}

function fakeDb(rows: FakeRawListingRow[]): Db {
  const page = (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  return {
    from: () => ({ select: () => ({ order: () => ({ range: page }) }) }),
  } as unknown as Db;
}

function row(id: string, listing_matches: FakeRawListingRow["listing_matches"]): FakeRawListingRow {
  return { id, source: "ebay:sold", title: `listing ${id}`, description: null, metadata: {}, listing_matches };
}

describe("loadListingsToMatch", () => {
  it("excludes an is_override row (object embed) regardless of all — the human-decisions-win invariant", async () => {
    const db = fakeDb([row("override-1", { state: "matched", is_override: true })]);
    expect((await loadListingsToMatch(db, { all: false })).map((r) => r.id)).toEqual([]);
    expect((await loadListingsToMatch(db, { all: true })).map((r) => r.id)).toEqual([]);
  });

  it("includes a row with no match yet (null embed) regardless of all", async () => {
    const db = fakeDb([row("new-1", null)]);
    expect((await loadListingsToMatch(db, { all: false })).map((r) => r.id)).toEqual(["new-1"]);
    expect((await loadListingsToMatch(db, { all: true })).map((r) => r.id)).toEqual(["new-1"]);
  });

  it("includes needs_review (non-override) under all:false, and gates matched (non-override) on all", async () => {
    const needsReview = row("nr-1", { state: "needs_review", is_override: false });
    const matched = row("m-1", { state: "matched", is_override: false });
    const dbNeedsReview = fakeDb([needsReview]);
    expect((await loadListingsToMatch(dbNeedsReview, { all: false })).map((r) => r.id)).toEqual(["nr-1"]);

    const dbMatched = fakeDb([matched]);
    expect((await loadListingsToMatch(dbMatched, { all: false })).map((r) => r.id)).toEqual([]);
    expect((await loadListingsToMatch(dbMatched, { all: true })).map((r) => r.id)).toEqual(["m-1"]);
  });

  it("also excludes an is_override row when the embed comes back as an array (defensive tolerance)", async () => {
    const db = fakeDb([row("override-arr-1", [{ state: "matched", is_override: true }])]);
    expect((await loadListingsToMatch(db, { all: false })).map((r) => r.id)).toEqual([]);
    expect((await loadListingsToMatch(db, { all: true })).map((r) => r.id)).toEqual([]);
  });

  it("strips the listing_matches embed off the returned rows", async () => {
    const db = fakeDb([row("new-1", null)]);
    const [result] = await loadListingsToMatch(db, { all: false });
    expect(result).not.toHaveProperty("listing_matches");
    expect(result).toEqual({ id: "new-1", source: "ebay:sold", title: "listing new-1", description: null, metadata: {} });
  });

  it("reads past Supabase's 1000-row cap", async () => {
    const db = fakeDb(Array.from({ length: 1500 }, (_, i) => row(`r-${i}`, null)));
    expect(await loadListingsToMatch(db, { all: true })).toHaveLength(1500);
  });
});
