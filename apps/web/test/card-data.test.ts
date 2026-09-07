import { describe, it, expect } from "vitest";
import { gridColumns, type PricePointRow } from "../lib/card-data";

const p = (grade_value: number, grade_label: string, n_sales: number, median_usd = 100): PricePointRow =>
  ({ product_id: "x", grade_value, grade_label, window: "90d", n_sales, median_usd, min_usd: 1, max_usd: 1, last_sold_at: "2026-09-01", confidence: "med" });

describe("gridColumns", () => {
  it("shows any-10 always, tiers only at ≥2 sales, sorted high→low", () => {
    const cols = gridColumns([p(10, "any", 5), p(10, "Flawless", 1), p(10, "Pristine", 2), p(9.5, "any", 3), p(9, "any", 1)], "90d");
    expect(cols.map((c) => c.title)).toEqual(["10 Pristine", "10", "9.5", "9"]);
  });
  it("ignores other windows", () => {
    expect(gridColumns([{ ...p(10, "any", 5), window: "30d" }], "90d")).toEqual([]);
  });
});
