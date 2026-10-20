import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../migrations/0006_sets_browse.sql", import.meta.url), "utf8").toLowerCase();
const view = sql.slice(sql.indexOf("create view public_set_cards"), sql.indexOf(";", sql.indexOf("create view public_set_cards")));

describe("0006_sets_browse", () => {
  it("adds the set and product columns", () => {
    for (const c of ["add column logo_url text", "add column series text", "add column source text not null default 'tcgdex'", "add column limitless_code text", "add column image_source text"]) expect(sql).toContain(c);
  });
  it("public_set_cards exposes no PSA, pct, era or import data", () => {
    expect(view.length).toBeGreaterThan(0);
    for (const bad of ["pct", "import_id", "pc_", "psa"]) expect(view).not.toContain(bad);
    expect(view).not.toMatch(/\bera\b/);
  });
  it("public_set_cards takes PCG 10 any-tier 90d and grade-10 estimates", () => {
    expect(view).toContain("grade_value = 10");
    expect(view).toContain("grade_label = 'any'");
    expect(view).toContain("\"window\" = '90d'");
  });
  it("revokes before granting select on the view", () => {
    const revoke = sql.indexOf("revoke all on public_set_cards from public, anon, authenticated");
    expect(revoke).toBeGreaterThan(-1);
    expect(revoke).toBeLessThan(sql.indexOf("grant select on public_set_cards to anon, authenticated"));
  });
  it("creates two public buckets and no anon write policy", () => {
    expect(sql).toContain("insert into storage.buckets");
    expect(sql).toContain("'set-logos'");
    expect(sql).toContain("'card-images'");
    expect(sql).not.toMatch(/create policy[^;]*storage\.objects[^;]*(insert|update|delete)/);
  });
  it("runs as one transaction", () => {
    const body = sql.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).join("\n").trim();
    expect(body.startsWith("begin;")).toBe(true);
    expect(body.endsWith("commit;")).toBe(true);
  });
});
