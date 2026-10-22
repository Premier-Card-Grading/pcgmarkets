import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../migrations/0009_psa_sales.sql", import.meta.url), "utf8").toLowerCase();

describe("0009_psa_sales", () => {
  it("keeps PSA prices private: RLS on, no grants, no policies", () => {
    expect(sql).toContain("alter table psa_sales enable row level security");
    expect(sql).toContain("revoke all on psa_sales from anon, authenticated");
    expect(sql).not.toMatch(/create policy/);
    expect(sql).not.toMatch(/grant /);
  });
  it("stores no seller identity", () => {
    expect(sql).not.toMatch(/seller_(username|name|id)/);
  });
  it("is wrapped in one transaction", () => {
    expect(sql.trimStart()).toMatch(/^(--[^\n]*\n)*\s*begin;/);
    expect(sql.trimEnd()).toMatch(/commit;$/);
  });
});
