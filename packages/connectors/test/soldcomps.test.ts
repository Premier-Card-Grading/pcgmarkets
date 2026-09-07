import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { extractItems, toRawListing } from "../src/soldcomps";

const body = JSON.parse(readFileSync(new URL("./fixtures/soldcomps-sample.json", import.meta.url), "utf8"));

describe("soldcomps mapping", () => {
  const items = extractItems(body);
  it("finds items in the envelope", () => expect(items.length).toBeGreaterThan(0));

  it("maps every item to a RawListing with the required fields", () => {
    for (const it of items) {
      const l = toRawListing(it);
      expect(l).not.toBeNull();
      expect(l!.source).toBe("soldcomps");
      expect(l!.sourceItemId.length).toBeGreaterThan(0);
      expect(l!.kind).toBe("sold");
      expect(l!.price).toBeGreaterThan(0);
      expect(l!.currency).toMatch(/^[A-Z]{3}$/);
      expect(l!.soldAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(l!.url).toMatch(/^https:\/\/www\.ebay\.com\/itm\//);
      expect(l!.isBestOffer).toBe(false);
      expect(l!.metadata).toEqual({});
    }
  });

  it("never copies sellerUsername or sellerPositivePercent into a typed RawListing field", () => {
    for (const it of items) {
      const l = toRawListing(it);
      expect(l).not.toBeNull();
      const json = JSON.stringify({ ...l, raw: undefined });
      expect(json).not.toContain("sellerUsername");
      expect(json).not.toContain("sellerPositivePercent");
      // it may only remain inside raw, untouched
      expect((l!.raw as { sellerUsername?: string }).sellerUsername).toBeDefined();
    }
  });

  it("returns null when required fields are missing", () => {
    expect(toRawListing({ title: "no id", soldPrice: "1", endedAt: "2026-01-01" })).toBeNull();
    expect(toRawListing({ itemId: "1", title: "no price", endedAt: "2026-01-01" })).toBeNull();
    expect(toRawListing({ itemId: "1", title: "no ended", soldPrice: "1" })).toBeNull();
    expect(toRawListing({ itemId: "1", soldPrice: "1", endedAt: "2026-01-01" })).toBeNull();
    expect(toRawListing({ itemId: "1", title: "zero price", soldPrice: "0", endedAt: "2026-01-01" })).toBeNull();
  });
});
