import { describe, it, expect } from "vitest";
import { median, confidence, computePricePoints, type Sale } from "../src/pricing";

const now = new Date("2026-09-06T00:00:00Z");
const d = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000);
const s = (p: Partial<Sale> & { priceUsd: number; daysAgo: number }): Sale => ({
  productId: "P", gradeValue: 10, gradeLabel: null, soldAt: d(p.daysAgo), ...p,
});

describe("median", () => {
  it("odd", () => expect(median([3, 1, 2])).toBe(2));
  it("even → mean of middle two", () => expect(median([1, 2, 3, 10])).toBe(2.5));
});

describe("confidence", () => {
  it("high needs ≥5 and spread <2", () => expect(confidence(5, 100, 199)).toBe("high"));
  it("≥5 with spread ≥2 is med", () => expect(confidence(5, 100, 200)).toBe("med"));
  it("2–4 is med", () => expect(confidence(2, 1, 1000)).toBe("med"));
  it("1 is low", () => expect(confidence(1, 50, 50)).toBe("low"));
});

describe("computePricePoints", () => {
  it("pools all 10s into 'any' and slices tiers", () => {
    const sales = [
      s({ priceUsd: 100, daysAgo: 1, gradeLabel: "Gem Mint" }),
      s({ priceUsd: 120, daysAgo: 2, gradeLabel: "Gem Mint" }),
      s({ priceUsd: 300, daysAgo: 3, gradeLabel: "Pristine" }),
      s({ priceUsd: 110, daysAgo: 4, gradeLabel: null }),
    ];
    const pts = computePricePoints(sales, now);
    const any90 = pts.find((p) => p.gradeLabel === "any" && p.window === "90d")!;
    expect(any90).toMatchObject({ nSales: 4, medianUsd: 115, minUsd: 100, maxUsd: 300, confidence: "med" });
    const gem90 = pts.find((p) => p.gradeLabel === "Gem Mint" && p.window === "90d")!;
    expect(gem90).toMatchObject({ nSales: 2, medianUsd: 110 });
    const pristine90 = pts.find((p) => p.gradeLabel === "Pristine" && p.window === "90d")!;
    expect(pristine90.nSales).toBe(1); // tier row exists; the UI hides tiers under 2 sales
  });
  it("only grade 10 gets tier rows", () => {
    const pts = computePricePoints([s({ priceUsd: 50, daysAgo: 1, gradeValue: 9.5, gradeLabel: null })], now);
    expect(pts.every((p) => p.gradeLabel === "any")).toBe(true);
    expect(pts.map((p) => p.window).sort()).toEqual(["180d", "30d", "90d", "all"]);
  });
  it("respects windows", () => {
    const pts = computePricePoints([s({ priceUsd: 10, daysAgo: 45 }), s({ priceUsd: 20, daysAgo: 5 })], now);
    expect(pts.find((p) => p.window === "30d")!.nSales).toBe(1);
    expect(pts.find((p) => p.window === "90d")!.nSales).toBe(2);
  });
  it("emits no row for empty buckets", () => {
    expect(computePricePoints([], now)).toEqual([]);
  });
  it("last_sold_at is the newest sale in the bucket", () => {
    const pts = computePricePoints([s({ priceUsd: 10, daysAgo: 9 }), s({ priceUsd: 20, daysAgo: 2 })], now);
    expect(pts.find((p) => p.window === "all")!.lastSoldAt).toEqual(d(2));
  });
});
