import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../migrations/0005_psa_estimates.sql", import.meta.url), "utf8").toLowerCase();
const PRIVATE = ["pc_imports", "pc_products", "pc_set_map", "pc_product_links", "price_estimates"];

describe("0005_psa_estimates", () => {
  it("enables RLS on every new table", () => {
    for (const t of PRIVATE) expect(sql).toContain(`alter table ${t} enable row level security`);
  });
  it("creates no policy on any new table (only the view is public)", () => {
    for (const t of PRIVATE) expect(sql).not.toMatch(new RegExp(`create policy[^;]* on ${t}\\b`));
  });
  it("public view omits pct, import_id and era", () => {
    const view = sql.slice(sql.indexOf("create view public_price_estimates"), sql.indexOf(";", sql.indexOf("create view public_price_estimates")));
    expect(view).not.toContain("pct");
    expect(view).not.toContain("import_id");
    expect(view).not.toMatch(/\bera\b/);
    expect(sql).toContain("grant select on public_price_estimates to anon, authenticated");
  });
  it("revokes default grants on the private tables from anon and authenticated", () => {
    expect(sql).toContain("revoke all on pc_imports, pc_products, pc_set_map, pc_product_links, price_estimates from anon, authenticated");
  });
  it("revokes all on the view before granting select, so anon cannot write through it", () => {
    const revoke = sql.indexOf("revoke all on public_price_estimates from public, anon, authenticated");
    expect(revoke).toBeGreaterThan(-1);
    expect(revoke).toBeLessThan(sql.indexOf("grant select on public_price_estimates to anon, authenticated"));
  });
  it("keeps the RPC away from anon", () => {
    expect(sql).toContain("revoke execute on function replace_price_estimates(jsonb) from public, anon, authenticated");
  });
  it("runs as one transaction", () => {
    const body = sql.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).join("\n").trim();
    expect(body.startsWith("begin;")).toBe(true);
    expect(body.endsWith("commit;")).toBe(true);
  });
  it("keeps era on the private table", () => {
    const table = sql.slice(sql.indexOf("create table price_estimates"), sql.indexOf(");", sql.indexOf("create table price_estimates")));
    expect(table).toMatch(/\bera\b/);
  });
  it("enforces the 60–90% band in the schema", () => {
    expect(sql).toContain("check (pct >= 0.60 and pct <= 0.90)");
  });
});
