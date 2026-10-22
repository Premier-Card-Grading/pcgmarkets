import { describe, it, expect } from "vitest";
import { gradeOptions, defaultGradeKey, salesFor, deltaPct, rollingMedian, niceStep, gradeKey, gradeLabel, estimateOptions, ESTIMATE_MAX_AGE_DAYS, SOLDCOMPS_ESTIMATE_MAX_AGE_DAYS } from "../lib/grades";
import type { EstimateRow, PricePointRow, SaleRow } from "../lib/card-data";
const pt = (grade_value: number, grade_label: string, n_sales: number, window = "90d"): PricePointRow => ({ product_id: "x", grade_value, grade_label, window, n_sales, median_usd: 100, min_usd: 90, max_usd: 110, last_sold_at: "2026-09-01", confidence: "med" });
const now = new Date("2026-09-21T00:00:00Z");
const sale = (daysAgo: number, usd: number, grade: number, label: string | null = null, bo = false): SaleRow => ({ id: `${daysAgo}-${usd}`, grade_value: grade, grade_label: label, price: usd, currency: "USD", price_usd: usd, sold_at: new Date(now.getTime() - daysAgo * 86400000).toISOString(), source: "soldcomps", url: "#", is_best_offer: bo });

describe("grade options", () => {
  it("orders 10 tiers first, includes 'all tiers' only when unlabelled 10s exist, then lower grades", () => {
    const opts = gradeOptions([pt(10, "any", 5), pt(10, "Gem Mint", 3), pt(10, "Pristine", 1), pt(9.5, "any", 4), pt(9, "any", 0), pt(8, "any", 2)], "90d");
    expect(opts.map((o) => o.key)).toEqual(["10pr", "10gm", "10", "95", "8"]);
    expect(opts[2]!.label).toBe("PCG 10 · all tiers"); expect(opts[2]!.nSales).toBe(5);
  });
  it("omits 'all tiers' when every 10 is labelled", () => {
    expect(gradeOptions([pt(10, "any", 3), pt(10, "Gem Mint", 3)], "90d").map((o) => o.key)).toEqual(["10gm"]);
  });
  it("ignores other windows", () => { expect(gradeOptions([pt(10, "any", 3, "30d")], "90d")).toEqual([]); });
  it("defaults to 10gm, then 10, then most sales", () => {
    expect(defaultGradeKey(gradeOptions([pt(10, "any", 2), pt(10, "Gem Mint", 1), pt(9, "any", 9)], "90d"))).toBe("10gm");
    expect(defaultGradeKey(gradeOptions([pt(10, "any", 2), pt(9, "any", 9)], "90d"))).toBe("10");
    expect(defaultGradeKey(gradeOptions([pt(9.5, "any", 2), pt(9, "any", 9)], "90d"))).toBe("9");
    expect(defaultGradeKey([])).toBeNull();
  });
  it("keys and labels", () => { expect(gradeKey(9.5, null)).toBe("95"); expect(gradeKey(10, "Gem Mint")).toBe("10gm"); expect(gradeLabel(9.5, null)).toBe("PCG 9.5"); expect(gradeLabel(10, "Flawless")).toBe("PCG 10 Flawless"); });
});
describe("sales filtering and delta", () => {
  const opt = gradeOptions([pt(10, "Gem Mint", 4)], "90d")[0]!;
  const sales = [sale(5, 400, 10, "Gem Mint"), sale(50, 420, 10, "Gem Mint"), sale(80, 380, 10, "Gem Mint", true), sale(100, 300, 10, "Gem Mint"), sale(120, 310, 10, "Gem Mint"), sale(150, 290, 10, "Gem Mint"), sale(10, 200, 9.5)];
  it("filters by grade, tier and window, newest first", () => { expect(salesFor(sales, opt, "90d", now).map((s) => s.price_usd)).toEqual([400, 420, 380]); });
  it("'all tiers' option takes every 10 in the window", () => {
    const all = gradeOptions([pt(10, "any", 4)], "90d")[0]!; expect(salesFor([...sales, sale(3, 999, 10, null)], all, "90d", now)).toHaveLength(4);
  });
  it("delta compares medians of this window and the previous one, ignoring best offers, null under 3 sales", () => {
    expect(deltaPct(sales, opt, "90d", now)).toBeNull(); // this window has only 2 non-best-offer sales
    const more = [...sales, sale(20, 410, 10, "Gem Mint")];
    expect(deltaPct(more, opt, "90d", now)).toBeCloseTo(((410 - 300) / 300) * 100, 5);
    expect(deltaPct(more, opt, "all", now)).toBeNull();
  });
  it("rolling median uses up to 4 points, oldest first, skipping best offers", () => {
    const r = rollingMedian([sale(1, 500, 10), sale(2, 100, 10, null, true), sale(3, 300, 10), sale(4, 200, 10)]);
    expect(r.map((p) => p.v)).toEqual([200, 250, 300]);
    expect(r[0]!.t).toBeLessThan(r[1]!.t);
  });
  it("nice steps", () => { expect(niceStep(418)).toBe(200); expect(niceStep(1240)).toBe(500); expect(niceStep(74)).toBe(25); });
});

describe("estimate options", () => {
  const est = (grade_value: number, estimate_usd: number, daysOld = 1): EstimateRow => ({ grade_value, estimate_usd, source_as_of: new Date(now.getTime() - daysOld * 86400000).toISOString() });
  it("builds options only for grades with no real price in any window, highest first, keyed with an 'e' suffix", () => {
    const opts = estimateOptions([pt(9, "any", 2, "all")], [est(9, 50), est(10, 84), est(8, 30)], now);
    expect(opts.map((o) => o.key)).toEqual(["10e", "8e"]);
    expect(opts[0]).toMatchObject({ gradeValue: 10, label: "PCG 10", medianUsd: 84, estimate: true, nSales: 0 });
  });
  it("treats a grade that sold only outside the current window as real, so it gets no estimate", () => {
    expect(estimateOptions([pt(9.5, "any", 1, "all"), pt(9.5, "any", 0, "90d")], [est(9.5, 40)], now)).toEqual([]);
  });
  it("treats any grade in the sales list as real, so a grade with only a best-offer sale gets no estimate", () => {
    const opts = estimateOptions([], [est(9, 50), est(10, 84)], now, [sale(5, 45, 9, null, true)]);
    expect(opts.map((o) => o.key)).toEqual(["10e"]);
  });
  it("treats a sale with no USD price as real too", () => {
    expect(estimateOptions([], [est(8, 30)], now, [{ ...sale(5, 30, 8), price_usd: null }])).toEqual([]);
  });
  it("keeps a SoldComps estimate while its newest PSA sale is within 90 days", () => {
    const sc = (daysOld: number): EstimateRow => ({ ...est(10, 84, daysOld), source: "soldcomps" });
    expect(estimateOptions([], [sc(ESTIMATE_MAX_AGE_DAYS + 30)], now)).toHaveLength(1);
    expect(estimateOptions([], [sc(SOLDCOMPS_ESTIMATE_MAX_AGE_DAYS + 1)], now)).toEqual([]);
  });
  it("drops estimates older than ESTIMATE_MAX_AGE_DAYS", () => {
    expect(estimateOptions([], [est(10, 84, ESTIMATE_MAX_AGE_DAYS + 1)], now)).toEqual([]);
  });
  it("default grade prefers a real grade over an estimated 10, and falls back to the first estimate", () => {
    const real = gradeOptions([pt(9, "any", 3)], "90d");
    const mixed = [...real, ...estimateOptions([pt(9, "any", 3, "all")], [est(10, 84)], now)];
    expect(defaultGradeKey(mixed)).toBe("9");
    expect(defaultGradeKey(estimateOptions([], [est(10, 84), est(9, 40)], now))).toBe("10e");
  });
});
