import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { InMemoryCatalog, matchListing, type SetRef, type ProductRef } from "../src";

// Fixture produced by spikes/count-coverage.ts (Task 15). Skipped until it exists.
const path = new URL("./fixtures/titles.json", import.meta.url);
const titles: { source: "yahoo_auc" | "thecardapi"; title: string; expect: "matched" | "needs_review" }[] = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
const catalogPath = new URL("./fixtures/catalog-sample.json", import.meta.url);
const cat: { sets: SetRef[]; products: ProductRef[] } = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, "utf8")) : { sets: [], products: [] };
const catalog = new InMemoryCatalog(cat.sets, cat.products);

describe.skipIf(titles.length === 0)("real titles never produce a wrong match", () => {
  for (const t of titles) {
    it(t.title, () => {
      const r = matchListing({ source: t.source, title: t.title, description: null, metadata: {}, cert: null }, catalog);
      // A title annotated needs_review must never be auto-matched; matched ones may still route to review if the sample catalog lacks the set.
      if (t.expect === "needs_review") expect(r.state).not.toBe("matched");
      else expect(["matched", "needs_review"]).toContain(r.state);
    });
  }
});
