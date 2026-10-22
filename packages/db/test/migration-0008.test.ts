import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../migrations/0008_set_cards_top_grade.sql", import.meta.url), "utf8").toLowerCase();

describe("0008_set_cards_top_grade", () => {
  it("keeps the view read-only for the public", () => {
    expect(sql).toContain("revoke all on public_set_cards from public, anon, authenticated");
    expect(sql).toContain("grant select on public_set_cards to anon, authenticated");
  });
  it("picks the 90-day grade below 10 with the most sales, higher grade on a tie", () => {
    expect(sql).toContain(`x.grade_value < 10 and x.grade_label = 'any' and x."window" = '90d' and x.n_sales > 0`);
    expect(sql).toContain("order by x.n_sales desc, x.grade_value desc limit 1");
  });
  it("is wrapped in one transaction", () => {
    expect(sql.trimStart()).toMatch(/^(--[^\n]*\n)*\s*begin;/);
    expect(sql.trimEnd()).toMatch(/commit;$/);
  });
});
