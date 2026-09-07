import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { extractRecords, toRawListing } from "../src/thecardapi";

const body = JSON.parse(readFileSync(new URL("./fixtures/thecardapi-sample.json", import.meta.url), "utf8"));

describe("thecardapi mapping", () => {
  const recs = extractRecords(body);
  it("finds records in the envelope", () => expect(recs.length).toBeGreaterThan(0));
  it("maps every record to a RawListing with the required fields", () => {
    for (const r of recs) {
      const l = toRawListing(r);
      expect(l).not.toBeNull();
      expect(l!.source).toBe("thecardapi");
      expect(l!.sourceItemId.length).toBeGreaterThan(0);
      expect(l!.title.length).toBeGreaterThan(0);
      expect(l!.price).toBeGreaterThan(0);
      expect(l!.currency).toMatch(/^[A-Z]{3}$/);
      expect(l!.kind).toBe("sold");
      expect(l!.soldAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(l!.url).toMatch(/^https?:\/\//);
    }
  });
  it("normalises grader/grade into EbayMetadata when present", () => {
    const withGrader = recs.map(toRawListing).find((l) => l && "grader" in l.metadata);
    if (withGrader) expect(typeof (withGrader.metadata as { grader?: string }).grader).toBe("string");
  });

  // Regression: an empty-string schema field path (the "absent" sentinel for ebayItemId/language)
  // must resolve to undefined, not to the whole record — a naive get() previously produced
  // externalItemId === "[object Object]" and metadata.language === "[object Object]" on every row.
  it("leaves absent fields (ebayItemId, language) genuinely absent, never '[object Object]'", () => {
    for (const l of recs.map(toRawListing)) {
      expect(l).not.toBeNull();
      expect(l!.externalItemId).toBe(null);
      expect(l!.externalItemId).not.toBe("[object Object]");
      expect("language" in l!.metadata).toBe(false);
      expect((l!.metadata as { language?: unknown }).language).not.toBe("[object Object]");
    }
  });
});

// Regression: The Card API's `listing_type` enum ("auction"|"fixed_price"|"best_offer") must map
// to isBestOffer via THECARDAPI.bestOfferValues, not via a `=== true`/`=== "true"` boolean check
// that can never match a string enum (which previously left isBestOffer permanently false).
describe("thecardapi best-offer mapping (synthetic records)", () => {
  const base = {
    id: "synthetic-1",
    title: "Synthetic Test Card",
    listing_url: "https://example.com/itm/synthetic-1",
    price: 42,
    currency: "USD",
    sold_at: "2026-01-01T00:00:00Z",
  };

  it("marks a best_offer listing_type as isBestOffer=true", () => {
    const rec = { ...base, listing_type: "best_offer" };
    const l = toRawListing(rec);
    expect(l).not.toBeNull();
    expect(l!.isBestOffer).toBe(true);
  });

  it("marks a fixed_price listing_type as isBestOffer=false", () => {
    const rec = { ...base, listing_type: "fixed_price" };
    const l = toRawListing(rec);
    expect(l).not.toBeNull();
    expect(l!.isBestOffer).toBe(false);
  });

  it("marks an auction listing_type as isBestOffer=false", () => {
    const rec = { ...base, listing_type: "auction" };
    const l = toRawListing(rec);
    expect(l).not.toBeNull();
    expect(l!.isBestOffer).toBe(false);
  });
});
