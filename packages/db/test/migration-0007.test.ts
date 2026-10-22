import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../migrations/0007_pc_price_history.sql", import.meta.url), "utf8").toLowerCase();

describe("0007_pc_price_history", () => {
  it("keeps the history private, like the other pc_* tables", () => {
    expect(sql).toContain("alter table pc_price_history enable row level security");
    expect(sql).toContain("revoke all on pc_price_history from anon, authenticated");
    expect(sql).not.toMatch(/create policy[^;]* on pc_price_history\b/);
    expect(sql).toContain("revoke execute on function snapshot_pc_prices(uuid) from public, anon, authenticated");
  });
  it("keys a row by card and day, with no foreign key to pc_products so it outlives the card", () => {
    expect(sql).toContain("primary key (pc_id, as_of)");
    expect(sql).not.toContain("references pc_products");
  });
  it("snapshots only mapped sets, and only cards whose prices or volume changed", () => {
    expect(sql).toContain("p.console_name in (select console_name from pc_set_map)");
    expect(sql).toContain("last.prices_usd = p.prices_usd and last.sales_volume is not distinct from p.sales_volume");
  });
  it("is wrapped in one transaction", () => {
    expect(sql.trimStart()).toMatch(/^(--[^\n]*\n)*\s*begin;/);
    expect(sql.trimEnd()).toMatch(/commit;$/);
  });
});
