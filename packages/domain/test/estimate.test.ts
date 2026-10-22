import { describe, it, expect } from "vitest";
import { eraFor, pcKeyForGrade, percentileRanks, computeEstimates, dropDuplicateProducts, gradedKey, psaGradePrices, combineEstimates, FLAT_PCT, MIN_GROUP, type EstimateInput } from "../src/estimate";

const card = (i: number, vol: number | null, prices: EstimateInput["pricesUsd"] = { "10": 100, "9": 50 }, over: Partial<EstimateInput> = {}): EstimateInput =>
  ({ productId: `p${i}`, language: "en", era: "modern", salesVolume: vol, pricesUsd: prices, ...over });
const group = (n: number, over: Partial<EstimateInput> = {}) => Array.from({ length: n }, (_, i) => card(i, i, { "10": 100 }, over));

describe("eraFor", () => {
  it("splits on the exact boundaries", () => {
    expect(eraFor("2003-06-30", null)).toBe("vintage");
    expect(eraFor("2003-07-01", null)).toBe("mid");
    expect(eraFor("2016-12-31", null)).toBe("mid");
    expect(eraFor("2017-01-01", null)).toBe("modern");
  });
  it("lets the override win and returns null with no date and no override", () => {
    expect(eraFor("2023-01-01", "vintage")).toBe("vintage");
    expect(eraFor(null, "mid")).toBe("mid");
    expect(eraFor(null, null)).toBeNull();
  });
});

describe("pcKeyForGrade", () => {
  it("maps PCG grades onto PriceCharting keys", () => {
    expect([10, 9.5, 9, 8.5, 8, 7.5, 7, 6, 1].map(pcKeyForGrade)).toEqual(["10", "9.5", "9", "8", "8", "7", "7", "6", "1"]);
    expect(pcKeyForGrade(6.5)).toBeNull();
  });
});

describe("percentileRanks", () => {
  it("maps lowest to 0 and highest to 1", () => expect(percentileRanks([5, 1, 9])).toEqual([0.5, 0, 1]));
  it("gives ties the share of values strictly below them", () => {
    const r = percentileRanks([1, 3, 3, 9]);
    [0, 1 / 3, 1 / 3, 1].forEach((v, i) => expect(r[i]).toBeCloseTo(v, 10));
  });
  it("returns 0 for a single value", () => expect(percentileRanks([7])).toEqual([0]));
});

describe("computeEstimates", () => {
  it("maps the bottom of a group to 60% and the top to 90%, never above PSA", () => {
    const cards = group(MIN_GROUP);
    const out = computeEstimates(cards, new Set());
    const lo = out.find((e) => e.productId === "p0" && e.gradeValue === 10)!;
    const hi = out.find((e) => e.productId === `p${MIN_GROUP - 1}` && e.gradeValue === 10)!;
    expect(lo).toMatchObject({ estimateUsd: 60, pct: 0.6, era: "modern" });
    expect(hi).toMatchObject({ estimateUsd: 90, pct: 0.9 });
    for (const e of out) expect(e.estimateUsd).toBeLessThanOrEqual(100);
  });
  it("floors every card in a group smaller than MIN_GROUP to 60%", () => {
    const out = computeEstimates(group(MIN_GROUP - 1), new Set());
    expect(new Set(out.map((e) => e.pct))).toEqual(new Set([0.6]));
  });
  it("ranks languages and eras separately so vintage is not compared with modern", () => {
    const modern = Array.from({ length: MIN_GROUP }, (_, i) => card(i, 1000 + i, { "10": 100 }));
    const vintage = Array.from({ length: MIN_GROUP }, (_, i) => card(100 + i, i, { "10": 100 }, { era: "vintage" }));
    const out = computeEstimates([...modern, ...vintage], new Set());
    expect(out.find((e) => e.productId === `p${100 + MIN_GROUP - 1}`)!.pct).toBe(0.9); // best-selling vintage card
  });
  it("puts an all-zero group at 60%", () => {
    const out = computeEstimates(Array.from({ length: MIN_GROUP }, (_, i) => card(i, 0, { "10": 100 })), new Set());
    expect(new Set(out.map((e) => e.pct))).toEqual(new Set([0.6]));
  });
  it("puts zero-volume cards at 60% even when they are half the group", () => {
    const zeros = Array.from({ length: 10 }, (_, i) => card(i, 0, { "10": 100 }));
    const sold = Array.from({ length: 10 }, (_, i) => card(10 + i, i + 1, { "10": 100 }));
    const out = computeEstimates([...zeros, ...sold], new Set());
    for (let i = 0; i < 10; i++) expect(out.find((e) => e.productId === `p${i}`)!.pct).toBe(0.6);
    expect(out.find((e) => e.productId === "p19")!.pct).toBe(0.9);
  });
  it("treats null sales volume as 0", () => {
    const cards = [...group(MIN_GROUP - 1).map((c) => ({ ...c, salesVolume: (c.salesVolume ?? 0) + 1 })), card(99, null, { "10": 100 })];
    expect(computeEstimates(cards, new Set()).find((e) => e.productId === "p99")!.pct).toBe(0.6);
  });
  it("skips any grade that already has a PCG price point (any window)", () => {
    const out = computeEstimates([card(1, 5, { "10": 100, "9": 50 })], new Set([gradedKey("p1", 10)]));
    expect(out.map((e) => e.gradeValue)).toEqual([9]);
  });
  it("estimates 8.5 and 8 from the '8' price and 7.5 and 7 from '7', and skips missing or zero prices", () => {
    const out = computeEstimates([card(1, 5, { "8": 40, "7": 0 })], new Set());
    expect(out.map((e) => e.gradeValue).sort()).toEqual([8, 8.5]);
    expect(out.every((e) => e.estimateUsd === 24)).toBe(true);
  });
  it("rounds to cents", () => {
    const out = computeEstimates([card(1, 5, { "10": 33.33 })], new Set());
    expect(out[0]!.estimateUsd).toBe(20);
  });
});

describe("dropDuplicateProducts", () => {
  it("drops every row of a product that appears more than once", () => {
    const r = dropDuplicateProducts([card(1, 1), card(1, 2), card(2, 3)]);
    expect(r.unique.map((c) => c.productId)).toEqual(["p2"]);
    expect(r.duplicates).toEqual(["p1"]);
  });
});

describe("psaGradePrices", () => {
  const now = new Date("2026-10-23T00:00:00Z");
  const sale = (priceUsd: number, daysAgo = 1, gradeValue = 10, productId = "sv10-229") => ({ productId, gradeValue, priceUsd, soldAt: new Date(now.getTime() - daysAgo * 86400000) });
  it("takes the median of 3+ priced sales of one card and grade in the last 90 days", () => {
    expect(psaGradePrices([sale(100, 1), sale(120, 5), sale(300, 80)], now)).toEqual([{ productId: "sv10-229", gradeValue: 10, medianUsd: 120, nSales: 3, newestSoldAt: new Date(now.getTime() - 86400000) }]);
  });
  it("needs 3 sales, ignores sales older than 90 days and unpriced ones, and keeps grades apart", () => {
    expect(psaGradePrices([sale(100), sale(120)], now)).toEqual([]);
    expect(psaGradePrices([sale(100), sale(120), sale(130, 91)], now)).toEqual([]);
    expect(psaGradePrices([sale(100), sale(120), sale(0)], now)).toEqual([]);
    expect(psaGradePrices([sale(100), sale(120), sale(130, 1, 9)], now)).toEqual([]);
  });
});

describe("combineEstimates", () => {
  const psa = (productId: string, gradeValue: number, medianUsd: number) => ({ productId, gradeValue, medianUsd, nSales: 3, newestSoldAt: new Date("2026-10-20T00:00:00Z") });
  const pc = (productId: string, gradeValue: number, estimateUsd: number) => ({ productId, gradeValue, estimateUsd, pct: FLAT_PCT, era: "modern" as const });
  it("uses 75% of the SoldComps PSA median, over PriceCharting for the same card and grade", () => {
    const out = combineEstimates([psa("a", 10, 200)], [pc("a", 10, 90), pc("a", 9, 40)], new Set(), FLAT_PCT);
    expect(out.find((e) => e.gradeValue === 10)).toMatchObject({ estimateUsd: 150, pct: 0.75, source: "soldcomps", era: "modern" });
    expect(out.find((e) => e.gradeValue === 9)).toMatchObject({ estimateUsd: 40, source: "pricecharting", asOf: null });
  });
  it("gives no estimate for a grade with a PCG sale, from either source", () => {
    expect(combineEstimates([psa("a", 10, 200)], [pc("a", 9, 40)], new Set([gradedKey("a", 10), gradedKey("a", 9)]), FLAT_PCT)).toEqual([]);
  });
  it("uses SoldComps alone when there is no PriceCharting", () => {
    expect(combineEstimates([psa("b", 9, 80)], [], new Set(), FLAT_PCT)).toEqual([{ productId: "b", gradeValue: 9, estimateUsd: 60, pct: 0.75, era: null, source: "soldcomps", asOf: new Date("2026-10-20T00:00:00Z") }]);
  });
});

describe("computeEstimates with a flat share", () => {
  it("gives every card the same share, whatever its popularity", () => {
    const out = computeEstimates([card(1, 0, { "10": 100 }), card(2, 999, { "10": 100 })], new Set(), { flatPct: FLAT_PCT });
    expect(out.map((e) => [e.estimateUsd, e.pct])).toEqual([[75, 0.75], [75, 0.75]]);
  });
});

