import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../migrations/0011_estimate_sources.sql", import.meta.url), "utf8").toLowerCase();
const view = (name: string) => sql.slice(sql.indexOf(`create or replace view ${name}`), sql.indexOf(";", sql.indexOf(`create or replace view ${name}`)));

describe("0011_estimate_sources", () => {
  it("records each estimate's source, and needs an import only for PriceCharting ones", () => {
    expect(sql).toContain("check (source in ('pricecharting','soldcomps'))");
    expect(sql).toContain("check (source <> 'pricecharting' or import_id is not null)");
  });
  it("adds source to the public views without exposing the PSA price, pct or era", () => {
    for (const v of [view("public_price_estimates"), view("public_set_cards")]) {
      expect(v).toMatch(/source/);
      expect(v).not.toMatch(/\bpct\b|\bera\b|prices_usd|psa_sales/);
    }
  });
  it("keeps the views read-only for the public and the replace function service-only", () => {
    expect(sql).toContain("grant select on public_price_estimates to anon, authenticated");
    expect(sql).toContain("grant select on public_set_cards to anon, authenticated");
    expect(sql).toContain("revoke execute on function replace_price_estimates(jsonb) from public, anon, authenticated");
  });
  it("is wrapped in one transaction", () => {
    expect(sql.trimStart()).toMatch(/^(--[^\n]*\n)*\s*begin;/);
    expect(sql.trimEnd()).toMatch(/commit;$/);
  });
});
