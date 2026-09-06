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
});
