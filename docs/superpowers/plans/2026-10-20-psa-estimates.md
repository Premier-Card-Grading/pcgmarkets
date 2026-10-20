# PSA-based Price Estimates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For card grades with no PCG sales, show a labelled estimate. The estimate is 60–90% of the PriceCharting PSA-equivalent price, scaled by the card's yearly sales-volume percentile within its language and era.

**Architecture:**
- A new `pricecharting:csv` ingest job downloads the daily PriceCharting CSV into **private** `pc_*` tables, then links rows to our catalog through an admin-maintained set map.
- A new `estimates` job runs after `prices` and calls a pure domain function to write a public `price_estimates` table. The public reads it only through a view without `pct`.
- The card page adds estimated grades to the grade selector, after the real grades.

**Tech Stack:** TypeScript, pnpm workspaces, vitest, Supabase (Postgres + supabase-js), Next.js 15 app router, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-20-psa-estimates-design.md` (read it first). Research: `docs/research/2026-10-psa-price-sources.md`.

## Global Constraints

- Estimate band: `pct = 0.60 + 0.30 × p`, with `p ∈ [0,1]`. The estimate is never above the PSA price.
- `(language, era)` groups with fewer than **20** linked cards: `p = 0`.
- Eras: `vintage` is before `2003-07-01`; `mid` runs to `2016-12-31`; `modern` is from `2017-01-01`. `pc_set_map.era_override` wins. No date and no override means the card is skipped.
- Grade mapping, from PCG grade to PriceCharting key:

  | PCG grade | Key |
  |---|---|
  | 10 (all tiers) | `10` |
  | 9.5 | `9.5` |
  | 9 | `9` |
  | 8.5, 8 | `8` |
  | 7.5, 7 | `7` |
  | 6 to 1 | same number |

- Estimates exist only for `(product, grade)` pairs with **no** PCG price point in any window.
- CSV sanity gate: the import is `suspect` and nothing is replaced if the file is empty, a required column is missing, or `rows < 0.8 × last ok import`.
- `estimates` is `suspect` if the latest ok import is older than **7 days**. The web hides estimates whose `source_as_of` is older than **14 days**.
- No anon or authenticated access to `pc_*` tables or the `price_estimates` table. Public reads go only through the `public_price_estimates` view, which has no `pct`.
- The card page never shows the PSA price, `pct`, popularity rank or the source name. Estimates never appear in charts, the sold list, "last sold", home, or search.
- Footnote copy, exact: `Estimated from PSA market prices and card popularity — no PCG sales yet.`
- **Nothing is added to `.github/workflows`.** Jobs run manually with `pnpm ingest <job>`.
- Kill switch `CONNECTOR_PRICECHARTING=off` skips `pricecharting:csv`. The token comes from env `PRICECHARTING_TOKEN`.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GruY6B7gQp9Vpbk4oLvriD
  ```

## Review Focus

1. **Variant rows.** `Charizard [1st Edition] #4` and `Charizard #4` must not both feed one product. Only the plain row auto-links; the variant goes to review as `variant`. Pinned in Task 3.
2. **The real-price check across windows.** A grade that sold 200 days ago has no point in the 90d window but does have an `all` point. It must get **no** estimate. Pinned in Task 2 (domain) and Task 7 (web).
3. **The `10` key collision on the web.** An estimated PCG 10 must not take the URL key `10` used by the real "all tiers" option. Estimate keys get an `e` suffix, and the default grade must prefer real grades. Pinned in Task 7.
4. **Supabase's 1000-row default page size.** Loading `price_points`, `pc_products` and links without pagination silently truncates them, which loses estimates and wrongly treats graded pairs as ungraded. Every loader paginates. Pinned in Task 5.
5. **A failed import after `ok` is recorded.** If the upsert dies halfway, the import must not look `ok`. Imports are inserted as `suspect` ("in progress") and flipped to `ok` only after the upsert finishes. Pinned in Task 6.

---

## File map

**Create**
- `packages/db/migrations/0005_psa_estimates.sql`: tables, view, RPC.
- `packages/db/seed/pc-set-map.sql`: set-map seed, with instructions.
- `packages/db/test/migration-0005.test.ts`: static RLS assertions on the SQL.
- `packages/domain/src/estimate.ts` with `packages/domain/test/estimate.test.ts`.
- `packages/domain/src/pc-link.ts` with `packages/domain/test/pc-link.test.ts`.
- `packages/connectors/src/pricecharting/schema.ts`, `csv.ts`, `index.ts`.
- `packages/connectors/test/fixtures/pricecharting-sample.csv` with `packages/connectors/test/pricecharting.test.ts`.
- `packages/db/src/repo/pricecharting.ts` and `packages/db/src/repo/estimates.ts`.
- `packages/db/src/paginate.ts` with `packages/db/test/paginate.test.ts`.
- `apps/ingest/src/jobs/pricecharting-csv.ts`, `pricecharting-link.ts`, `estimates.ts`.
- `apps/ingest/test/pricecharting-jobs.test.ts`.
- `apps/web/components/EstimateBox.tsx`.
- `apps/web/app/admin/review/pricecharting/page.tsx` and `actions.ts`.

**Modify**
- `packages/domain/src/index.ts`, `packages/connectors/src/index.ts`, `packages/db/src/index.ts`: exports.
- `apps/ingest/src/cli.ts`: register jobs. `apps/ingest/src/run.ts`: kill switch.
- `.env.example`.
- `apps/web/lib/card-data.ts`, `apps/web/lib/grades.ts`, `apps/web/test/grades.test.ts`.
- `apps/web/components/CardView.tsx`, `apps/web/components/GradeSelect.tsx`.
- `apps/web/app/admin/review/page.tsx`: chip. `apps/web/app/admin/health/page.tsx`: switch and import age.

---

### Task 1: Migration, set-map seed, static RLS test

**Files:**
- Create: `packages/db/migrations/0005_psa_estimates.sql`
- Create: `packages/db/seed/pc-set-map.sql`
- Test: `packages/db/test/migration-0005.test.ts`

**Interfaces:**
- Produces:
  - Tables `pc_imports`, `pc_products`, `pc_set_map`, `pc_product_links`, `price_estimates`.
  - View `public_price_estimates(product_id, grade_value, estimate_usd, era, source_as_of)`.
  - RPC `replace_price_estimates(rows jsonb) returns int`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/db/test/migration-0005.test.ts
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
  it("public view omits pct and import_id", () => {
    const view = sql.slice(sql.indexOf("create view public_price_estimates"), sql.indexOf(";", sql.indexOf("create view public_price_estimates")));
    expect(view).not.toContain("pct");
    expect(view).not.toContain("import_id");
    expect(sql).toContain("grant select on public_price_estimates to anon, authenticated");
  });
  it("keeps the RPC away from anon", () => {
    expect(sql).toContain("revoke execute on function replace_price_estimates(jsonb) from public, anon, authenticated");
  });
  it("enforces the 60–90% band in the schema", () => {
    expect(sql).toContain("check (pct >= 0.60 and pct <= 0.90)");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @pcg/db test -- migration-0005`
Expected: FAIL with `ENOENT` (the migration file doesn't exist).

- [ ] **Step 3: Write the migration**

```sql
-- packages/db/migrations/0005_psa_estimates.sql
-- PSA-based price estimates (spec: docs/superpowers/specs/2026-10-20-psa-estimates-design.md).
-- pc_* tables and price_estimates are service-role only. The public reads public_price_estimates, which has no pct,
-- so the PSA price cannot be recovered as estimate / pct.

create table pc_imports (
  id          uuid primary key default gen_random_uuid(),
  fetched_at  timestamptz not null default now(),
  row_count   int not null,
  status      text not null check (status in ('ok','suspect')),
  notes       text
);
create index pc_imports_status_fetched_idx on pc_imports (status, fetched_at desc);

create table pc_products (
  pc_id         text primary key,
  console_name  text not null,
  product_name  text not null,
  card_number   text,
  sales_volume  int,
  prices_usd    jsonb not null,
  import_id     uuid not null references pc_imports(id)
);
create index pc_products_console_idx on pc_products (console_name);
create index pc_products_import_idx on pc_products (import_id);

create table pc_set_map (
  set_id        text primary key references sets(id),
  console_name  text not null,
  era_override  text check (era_override in ('vintage','mid','modern'))
);

create table pc_product_links (
  pc_id          text primary key references pc_products(pc_id) on delete cascade,
  state          text not null check (state in ('linked','needs_review','rejected')),
  product_id     text references products(id),
  review_reason  text,
  is_override    boolean not null default false,
  updated_at     timestamptz not null default now()
);
create index pc_product_links_state_idx on pc_product_links (state);
create index pc_product_links_product_idx on pc_product_links (product_id) where state = 'linked';

create table price_estimates (
  product_id    text not null references products(id),
  grade_value   numeric not null,
  estimate_usd  numeric not null,
  pct           numeric not null check (pct >= 0.60 and pct <= 0.90),
  era           text not null check (era in ('vintage','mid','modern')),
  import_id     uuid not null references pc_imports(id),
  source_as_of  timestamptz not null,
  computed_at   timestamptz not null default now(),
  primary key (product_id, grade_value)
);

alter table pc_imports enable row level security;
alter table pc_products enable row level security;
alter table pc_set_map enable row level security;
alter table pc_product_links enable row level security;
alter table price_estimates enable row level security;

create view public_price_estimates as
  select product_id, grade_value, estimate_usd, era, source_as_of from price_estimates;
grant select on public_price_estimates to anon, authenticated;

-- Atomic replace: supabase-js has no client-side transactions.
create function replace_price_estimates(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from price_estimates where true;
  insert into price_estimates (product_id, grade_value, estimate_usd, pct, era, import_id, source_as_of)
  select r.product_id, r.grade_value, r.estimate_usd, r.pct, r.era, r.import_id, r.source_as_of
  from jsonb_to_recordset(rows) as r(product_id text, grade_value numeric, estimate_usd numeric, pct numeric, era text, import_id uuid, source_as_of timestamptz);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function replace_price_estimates(jsonb) from public, anon, authenticated;
```

- [ ] **Step 4: Write the seed file**

```sql
-- packages/db/seed/pc-set-map.sql
-- The "list of sets" that get PSA-based estimates: our set id → PriceCharting console-name, exactly as it appears
-- in the CSV's console-name column. Find candidate names after an import with:
--   supabase db query --linked "select console_name, count(*) from pc_products group by 1 order by 2 desc limit 100"
-- (the `pricecharting:link` job also logs the largest unmapped console names).
-- era_override is required only when sets.release_date is null.
-- Apply with: supabase db query --linked -f packages/db/seed/pc-set-map.sql   (safe to re-run)
insert into pc_set_map (set_id, console_name, era_override) values
  ('sv03.5', 'Pokemon Scarlet & Violet 151', null)
on conflict (set_id) do update set console_name = excluded.console_name, era_override = excluded.era_override;
```

`sv03.5` is TCGdex's id for EN 151. Before running the seed, check it exists: `supabase db query --linked "select id,name_en from sets where name_en ilike '%151%'"`, and fix the id if it differs.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @pcg/db test -- migration-0005`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/0005_psa_estimates.sql packages/db/seed/pc-set-map.sql packages/db/test/migration-0005.test.ts
git commit -m "feat(db): PSA estimate tables, public view and replace RPC (0005)"
```

The commit message ends with the two trailer lines from Global Constraints. This applies to every commit in this plan.

---

### Task 2: Domain — estimate calculation

**Files:**
- Create: `packages/domain/src/estimate.ts`
- Modify: `packages/domain/src/index.ts` (add `export * from "./estimate";`)
- Test: `packages/domain/test/estimate.test.ts`

**Interfaces:**
- Produces:
  - `type Era = "vintage" | "mid" | "modern"`
  - `type PcGradeKey = "10" | "9.5" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2" | "1"`
  - `PCT_MIN = 0.6`, `PCT_MAX = 0.9`, `MIN_GROUP = 20`, `MAX_IMPORT_AGE_DAYS = 7`
  - `ERA_BOUNDS = { vintageBefore: "2003-07-01", modernFrom: "2017-01-01" }`
  - `ESTIMATE_GRADES: readonly number[]`
  - `eraFor(releaseDate: string | null, override: Era | null): Era | null`
  - `pcKeyForGrade(gradeValue: number): PcGradeKey | null`
  - `percentileRanks(values: number[]): number[]`
  - `interface EstimateInput { productId: string; language: Language; era: Era; salesVolume: number | null; pricesUsd: Partial<Record<PcGradeKey, number>> }`
  - `interface Estimate { productId: string; gradeValue: number; estimateUsd: number; pct: number; era: Era }`
  - `gradedKey(productId: string, gradeValue: number): string` (returns `${productId}|${gradeValue}`)
  - `dropDuplicateProducts(cards: EstimateInput[]): { unique: EstimateInput[]; duplicates: string[] }`
  - `computeEstimates(cards: EstimateInput[], pcgGraded: Set<string>): Estimate[]`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/domain/test/estimate.test.ts
import { describe, it, expect } from "vitest";
import { eraFor, pcKeyForGrade, percentileRanks, computeEstimates, dropDuplicateProducts, gradedKey, MIN_GROUP, type EstimateInput } from "../src/estimate";

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
  it("gives ties the average rank", () => expect(percentileRanks([1, 3, 3, 9])).toEqual([0, 0.5, 0.5, 1]));
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @pcg/domain test -- estimate`
Expected: FAIL with `Failed to resolve import "../src/estimate"`.

- [ ] **Step 3: Implement**

```ts
// packages/domain/src/estimate.ts
import type { Language } from "./types";

export type Era = "vintage" | "mid" | "modern";
export type PcGradeKey = "10" | "9.5" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2" | "1";

export const PCT_MIN = 0.6;
export const PCT_MAX = 0.9;
/** A (language, era) group smaller than this can't be ranked meaningfully; its cards get PCT_MIN. */
export const MIN_GROUP = 20;
export const MAX_IMPORT_AGE_DAYS = 7;
export const ERA_BOUNDS = { vintageBefore: "2003-07-01", modernFrom: "2017-01-01" } as const;
export const ESTIMATE_GRADES = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6, 5, 4, 3, 2, 1] as const;

export interface EstimateInput { productId: string; language: Language; era: Era; salesVolume: number | null; pricesUsd: Partial<Record<PcGradeKey, number>> }
export interface Estimate { productId: string; gradeValue: number; estimateUsd: number; pct: number; era: Era }

export function eraFor(releaseDate: string | null, override: Era | null): Era | null {
  if (override) return override;
  if (!releaseDate) return null;
  const d = releaseDate.slice(0, 10);
  if (d < ERA_BOUNDS.vintageBefore) return "vintage";
  if (d < ERA_BOUNDS.modernFrom) return "mid";
  return "modern";
}

export function pcKeyForGrade(g: number): PcGradeKey | null {
  if (g === 10) return "10";
  if (g === 9.5) return "9.5";
  if (g === 9) return "9";
  if (g === 8.5 || g === 8) return "8";
  if (g === 7.5 || g === 7) return "7";
  if ([6, 5, 4, 3, 2, 1].includes(g)) return String(g) as PcGradeKey;
  return null;
}

/** Rank scaled to [0,1]: lowest 0, highest 1, ties share the average rank. A single value gets 0. */
export function percentileRanks(values: number[]): number[] {
  const n = values.length;
  if (n <= 1) return values.map(() => 0);
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(n);
  for (let s = 0; s < n; ) {
    let e = s;
    while (e + 1 < n && order[e + 1]!.v === order[s]!.v) e++;
    const r = (s + e) / 2 / (n - 1);
    for (let k = s; k <= e; k++) out[order[k]!.i] = r;
    s = e + 1;
  }
  return out;
}

export const gradedKey = (productId: string, gradeValue: number) => `${productId}|${gradeValue}`;

export function dropDuplicateProducts(cards: EstimateInput[]): { unique: EstimateInput[]; duplicates: string[] } {
  const count = new Map<string, number>();
  for (const c of cards) count.set(c.productId, (count.get(c.productId) ?? 0) + 1);
  const duplicates = [...count.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  return { unique: cards.filter((c) => count.get(c.productId) === 1), duplicates };
}

const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;

export function computeEstimates(cards: EstimateInput[], pcgGraded: Set<string>): Estimate[] {
  const groups = new Map<string, EstimateInput[]>();
  for (const c of cards) {
    const k = `${c.language}|${c.era}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const out: Estimate[] = [];
  for (const g of groups.values()) {
    const ranks = g.length < MIN_GROUP ? g.map(() => 0) : percentileRanks(g.map((c) => c.salesVolume ?? 0));
    g.forEach((c, i) => {
      const pct = round(PCT_MIN + (PCT_MAX - PCT_MIN) * ranks[i]!, 4);
      for (const gradeValue of ESTIMATE_GRADES) {
        if (pcgGraded.has(gradedKey(c.productId, gradeValue))) continue;
        const key = pcKeyForGrade(gradeValue);
        const psa = key ? c.pricesUsd[key] : undefined;
        if (psa == null || !(psa > 0)) continue;
        out.push({ productId: c.productId, gradeValue, estimateUsd: Math.min(round(psa * pct, 2), psa), pct, era: c.era });
      }
    });
  }
  return out;
}
```

Then append `export * from "./estimate";` to `packages/domain/src/index.ts`.

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @pcg/domain test -- estimate`
Expected: PASS (all tests). Then run `pnpm --filter @pcg/domain typecheck`. Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/estimate.ts packages/domain/src/index.ts packages/domain/test/estimate.test.ts
git commit -m "feat(domain): PSA-based estimate calculation with era-relative popularity"
```

---

### Task 3: Domain — PriceCharting card linking

**Files:**
- Create: `packages/domain/src/pc-link.ts`
- Modify: `packages/domain/src/index.ts` (add `export * from "./pc-link";`)
- Test: `packages/domain/test/pc-link.test.ts`

**Interfaces:**
- Produces:
  - `type PcReviewReason = "no_card_number" | "variant" | "no_match" | "ambiguous"`
  - `extractPcNumber(productName: string): string | null` (uppercase token after the **last** `#`)
  - `isPcVariant(productName: string): boolean` (true if the name contains a `[...]` tag)
  - `interface LinkCandidate { id: string; numberNum: number | null; numberPrinted: string }`
  - `type LinkResult = { state: "linked"; productId: string } | { state: "needs_review"; reason: PcReviewReason }`
  - `linkPcProduct(row: { productName: string; cardNumber: string | null }, candidates: LinkCandidate[]): LinkResult` (candidates are the products of the one mapped set)

- [ ] **Step 1: Write the failing tests**

```ts
// packages/domain/test/pc-link.test.ts
import { describe, it, expect } from "vitest";
import { extractPcNumber, isPcVariant, linkPcProduct, type LinkCandidate } from "../src/pc-link";

const c = (id: string, numberNum: number | null, numberPrinted: string): LinkCandidate => ({ id, numberNum, numberPrinted });
const set151 = [c("sv03.5-200", 200, "200/165"), c("sv03.5-6", 6, "006/165"), c("sv03.5-TG05", null, "TG05")];

describe("extractPcNumber", () => {
  it("reads the token after the last #", () => {
    expect(extractPcNumber("Blastoise ex #200")).toBe("200");
    expect(extractPcNumber("Charizard ex #006")).toBe("006");
    expect(extractPcNumber("Pikachu #tg05")).toBe("TG05");
    expect(extractPcNumber("Mew #SV-P 001")).toBe("SV-P");
    expect(extractPcNumber("Booster Box")).toBeNull();
  });
});

describe("isPcVariant", () => {
  it("flags bracketed variant tags", () => {
    expect(isPcVariant("Charizard [1st Edition] #4")).toBe(true);
    expect(isPcVariant("Pikachu [Reverse Holo] #58")).toBe(true);
    expect(isPcVariant("Charizard #4")).toBe(false);
  });
});

describe("linkPcProduct", () => {
  it("links a numeric card number to exactly one product, ignoring leading zeros", () => {
    expect(linkPcProduct({ productName: "Blastoise ex #200", cardNumber: "200" }, set151)).toEqual({ state: "linked", productId: "sv03.5-200" });
    expect(linkPcProduct({ productName: "Charizard ex #006", cardNumber: "006" }, set151)).toEqual({ state: "linked", productId: "sv03.5-6" });
  });
  it("links an alphanumeric number by its printed form", () => {
    expect(linkPcProduct({ productName: "Pikachu #TG05", cardNumber: "TG05" }, set151)).toEqual({ state: "linked", productId: "sv03.5-TG05" });
  });
  it("sends a missing number, a variant, no match and an ambiguous match to review", () => {
    expect(linkPcProduct({ productName: "Booster Box", cardNumber: null }, set151)).toEqual({ state: "needs_review", reason: "no_card_number" });
    expect(linkPcProduct({ productName: "Blastoise ex [Reverse Holo] #200", cardNumber: "200" }, set151)).toEqual({ state: "needs_review", reason: "variant" });
    expect(linkPcProduct({ productName: "Nobody #999", cardNumber: "999" }, set151)).toEqual({ state: "needs_review", reason: "no_match" });
    const dup = [...set151, c("sv03.5-200b", 200, "200/165")];
    expect(linkPcProduct({ productName: "Blastoise ex #200", cardNumber: "200" }, dup)).toEqual({ state: "needs_review", reason: "ambiguous" });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @pcg/domain test -- pc-link`
Expected: FAIL with `Failed to resolve import "../src/pc-link"`.

- [ ] **Step 3: Implement**

```ts
// packages/domain/src/pc-link.ts
export type PcReviewReason = "no_card_number" | "variant" | "no_match" | "ambiguous";
export interface LinkCandidate { id: string; numberNum: number | null; numberPrinted: string }
export type LinkResult = { state: "linked"; productId: string } | { state: "needs_review"; reason: PcReviewReason };

export function extractPcNumber(productName: string): string | null {
  const ms = [...productName.matchAll(/#\s*([A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)/g)];
  return ms.length ? ms[ms.length - 1]![1]!.toUpperCase() : null;
}

/** PriceCharting lists variants ("[1st Edition]", "[Reverse Holo]") as separate products; our catalog does not. */
export const isPcVariant = (productName: string) => /\[[^\]]+\]/.test(productName);

const printedHead = (printed: string) => printed.split("/")[0]!.replace(/[\s-]/g, "").toUpperCase();

export function linkPcProduct(row: { productName: string; cardNumber: string | null }, candidates: LinkCandidate[]): LinkResult {
  const review = (reason: PcReviewReason): LinkResult => ({ state: "needs_review", reason });
  if (!row.cardNumber) return review("no_card_number");
  if (isPcVariant(row.productName)) return review("variant");
  const n = row.cardNumber;
  const hits = /^\d+$/.test(n)
    ? candidates.filter((c) => c.numberNum === parseInt(n, 10))
    : candidates.filter((c) => printedHead(c.numberPrinted) === n.replace(/[\s-]/g, ""));
  if (hits.length === 1) return { state: "linked", productId: hits[0]!.id };
  return review(hits.length === 0 ? "no_match" : "ambiguous");
}
```

Then append `export * from "./pc-link";` to `packages/domain/src/index.ts`.

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @pcg/domain test -- pc-link && pnpm --filter @pcg/domain typecheck`
Expected: PASS, and no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/pc-link.ts packages/domain/src/index.ts packages/domain/test/pc-link.test.ts
git commit -m "feat(domain): link PriceCharting products to catalog by exact card number"
```

---

### Task 4: Connector — PriceCharting CSV download, parse and sanity gate

**Files:**
- Create: `packages/connectors/src/pricecharting/schema.ts`, `csv.ts`, `index.ts`
- Create: `packages/connectors/test/fixtures/pricecharting-sample.csv`
- Modify: `packages/connectors/src/index.ts`
- Test: `packages/connectors/test/pricecharting.test.ts`

**Interfaces:**
- Consumes: `PcGradeKey` and `extractPcNumber` from `@pcg/domain` (Tasks 2 and 3).
- Produces:
  - `PRICECHARTING` (the schema constant)
  - `parseCsv(text: string): string[][]`
  - `interface PcRow { pcId: string; consoleName: string; productName: string; cardNumber: string | null; salesVolume: number | null; pricesUsd: Partial<Record<PcGradeKey, number>> }`
  - `parseMoney(s: string | undefined): number | null`
  - `parsePcCsv(text: string): { rows: PcRow[]; missing: string[] }`
  - `checkImport(rowCount: number, missing: string[], lastOkRowCount: number | null): { ok: true } | { ok: false; reason: string }`
  - `downloadPcCsv(token: string): Promise<string>`

- [ ] **Step 1: Create the fixture**

```csv
id,console-name,product-name,loose-price,cib-price,new-price,graded-price,box-only-price,manual-only-price,bgs-10-price,condition-16-price,condition-15-price,condition-14-price,condition-13-price,condition-10-price,condition-9-price,sales-volume,release-date
5001,Pokemon Scarlet & Violet 151,Blastoise ex #200,$45.10,$60.00,$75.50,$110.00,$150.25,"$1,240.00",$900.00,$40.00,,,,,,412,2023-09-22
5002,Pokemon Scarlet & Violet 151,"Charizard ex #006",$12.00,,,$40.00,,$180.00,,,,,,,,1880,2023-09-22
5003,Pokemon Scarlet & Violet 151,Blastoise ex [Reverse Holo] #9,$3.00,,,,,$95.00,,,,,,,,55,2023-09-22
5004,Pokemon Scarlet & Violet 151,Booster Bundle,$30.00,,,,,,,,,,,,,900,2023-09-22
5005,Pokemon Base Set,Charizard #4,$350.00,$900.00,"$1,500.00","$3,200.00","$6,000.00","$14,500.00",,$700.00,$560.00,$480.00,$420.00,$390.00,$350.00,96,1999-01-09
5006,Pokemon Japanese Pokemon 151,Mew ex #151,$20.00,,,$70.00,,$260.00,,,,,,,,300,2023-06-16
5007,Pokemon Base Set,"Pikachu ""Red Cheeks"" #58",$40.00,,,,,$0.00,,,,,,,,12,1999-01-09
```

- [ ] **Step 2: Write the failing tests**

```ts
// packages/connectors/test/pricecharting.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCsv, parseMoney, parsePcCsv, checkImport } from "../src/pricecharting";

const text = readFileSync(new URL("./fixtures/pricecharting-sample.csv", import.meta.url), "utf8");

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });
});

describe("parseMoney", () => {
  it("parses dollars with separators, drops empty and zero", () => {
    expect(parseMoney("$1,240.00")).toBe(1240);
    expect(parseMoney("110.5")).toBe(110.5);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("$0.00")).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });
});

describe("parsePcCsv", () => {
  const { rows, missing } = parsePcCsv(text);
  it("reads every row and reports no missing columns", () => { expect(rows).toHaveLength(7); expect(missing).toEqual([]); });
  it("maps grade columns onto PCG-equivalent keys", () => {
    const b = rows.find((r) => r.pcId === "5001")!;
    expect(b).toMatchObject({ consoleName: "Pokemon Scarlet & Violet 151", productName: "Blastoise ex #200", cardNumber: "200", salesVolume: 412 });
    expect(b.pricesUsd).toEqual({ "10": 1240, "9.5": 150.25, "9": 110, "8": 75.5, "7": 60, "6": 40 });
  });
  it("leaves out empty and zero prices and keeps quoted names", () => {
    const p = rows.find((r) => r.pcId === "5007")!;
    expect(p.productName).toBe('Pikachu "Red Cheeks" #58');
    expect(p.pricesUsd).toEqual({});
  });
  it("gives a null card number when the name has no #", () => expect(rows.find((r) => r.pcId === "5004")!.cardNumber).toBeNull());
  it("reports missing required columns", () => {
    expect(parsePcCsv("id,console-name,product-name\n1,a,b #1\n").missing).toEqual(["manual-only-price", "sales-volume"]);
  });
});

describe("checkImport", () => {
  it("passes a normal import and the first ever import", () => {
    expect(checkImport(1000, [], 1100)).toEqual({ ok: true });
    expect(checkImport(10, [], null)).toEqual({ ok: true });
  });
  it("fails empty files, missing columns and a >20% drop", () => {
    expect(checkImport(0, [], null).ok).toBe(false);
    expect(checkImport(100, ["sales-volume"], 100).ok).toBe(false);
    expect(checkImport(79, [], 100).ok).toBe(false);
    expect(checkImport(80, [], 100).ok).toBe(true);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --filter @pcg/connectors test -- pricecharting`
Expected: FAIL with `Failed to resolve import "../src/pricecharting"`.

- [ ] **Step 4: Implement the schema, CSV parser and connector**

```ts
// packages/connectors/src/pricecharting/schema.ts
import type { PcGradeKey } from "@pcg/domain";

/** Everything vendor-specific about PriceCharting lives here (docs: pricecharting.com/api-documentation). */
export const PRICECHARTING = {
  // Legendary-plan CSV download. CONFIRM on the first real download from Subscriptions → "API/Download" and
  // update here; PRICECHARTING_CSV_URL (full URL, token included) overrides it without a code change.
  csvUrl: (token: string) => `https://www.pricecharting.com/price-guide/download-custom?t=${encodeURIComponent(token)}&category=pokemon-cards`,
  required: ["id", "console-name", "product-name", "manual-only-price", "sales-volume"],
  // PCG-equivalent grade → CSV column. Only manual-only-price is PSA-specific; the rest are "graded N by a grading company".
  gradeColumns: {
    "10": "manual-only-price", "9.5": "box-only-price", "9": "graded-price", "8": "new-price", "7": "cib-price",
    "6": "condition-16-price", "5": "condition-15-price", "4": "condition-14-price", "3": "condition-13-price",
    "2": "condition-10-price", "1": "condition-9-price",
  } as Record<PcGradeKey, string>,
  minRowRatio: 0.8,
};
```

```ts
// packages/connectors/src/pricecharting/csv.ts
/** Minimal RFC 4180 parser: quoted fields, "" escapes, commas and newlines inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}
```

```ts
// packages/connectors/src/pricecharting/index.ts
import { extractPcNumber, type PcGradeKey } from "@pcg/domain";
import { politeFetch } from "../http";
import { parseCsv } from "./csv";
import { PRICECHARTING } from "./schema";

export { parseCsv } from "./csv";
export { PRICECHARTING } from "./schema";

export interface PcRow { pcId: string; consoleName: string; productName: string; cardNumber: string | null; salesVolume: number | null; pricesUsd: Partial<Record<PcGradeKey, number>> }

export function parseMoney(s: string | undefined): number | null {
  const t = (s ?? "").replace(/[$,\s]/g, "");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
}

export function parsePcCsv(text: string): { rows: PcRow[]; missing: string[] } {
  const [header = [], ...body] = parseCsv(text.replace(/^﻿/, ""));
  const col = new Map(header.map((h, i) => [h.trim(), i]));
  const missing = PRICECHARTING.required.filter((c) => !col.has(c));
  if (missing.length) return { rows: [], missing };
  const get = (r: string[], c: string) => { const i = col.get(c); return i == null ? undefined : r[i]; };
  const rows: PcRow[] = [];
  for (const r of body) {
    const pcId = get(r, "id")?.trim(), consoleName = get(r, "console-name")?.trim(), productName = get(r, "product-name")?.trim();
    if (!pcId || !consoleName || !productName) continue;
    const pricesUsd: Partial<Record<PcGradeKey, number>> = {};
    for (const [k, c] of Object.entries(PRICECHARTING.gradeColumns) as [PcGradeKey, string][]) {
      const v = parseMoney(get(r, c));
      if (v != null) pricesUsd[k] = v;
    }
    const vol = Number((get(r, "sales-volume") ?? "").replace(/,/g, ""));
    rows.push({ pcId, consoleName, productName, cardNumber: extractPcNumber(productName), salesVolume: Number.isFinite(vol) && (get(r, "sales-volume") ?? "") !== "" ? vol : null, pricesUsd });
  }
  return { rows, missing };
}

export function checkImport(rowCount: number, missing: string[], lastOkRowCount: number | null): { ok: true } | { ok: false; reason: string } {
  if (missing.length) return { ok: false, reason: `missing columns: ${missing.join(", ")}` };
  if (rowCount === 0) return { ok: false, reason: "empty file" };
  if (lastOkRowCount != null && rowCount < PRICECHARTING.minRowRatio * lastOkRowCount) return { ok: false, reason: `row count dropped to ${rowCount} from ${lastOkRowCount}` };
  return { ok: true };
}

export async function downloadPcCsv(token: string): Promise<string> {
  const url = process.env.PRICECHARTING_CSV_URL || PRICECHARTING.csvUrl(token);
  const res = await politeFetch(url, { minIntervalMs: 0 });
  if (!res.ok) throw new Error(`PriceCharting CSV download failed: HTTP ${res.status}`);
  return res.text();
}
```

Append to `packages/connectors/src/index.ts`:

```ts
export { parseCsv, parseMoney, parsePcCsv, checkImport, downloadPcCsv, PRICECHARTING } from "./pricecharting";
export type { PcRow } from "./pricecharting";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @pcg/connectors test -- pricecharting && pnpm --filter @pcg/connectors typecheck`
Expected: PASS, and no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/connectors/src/pricecharting packages/connectors/src/index.ts packages/connectors/test/pricecharting.test.ts packages/connectors/test/fixtures/pricecharting-sample.csv
git commit -m "feat(connectors): PriceCharting CSV download, parse and sanity gate"
```

---

### Task 5: DB repositories (paginated) for PriceCharting and estimates

**Files:**
- Create: `packages/db/src/paginate.ts`, `packages/db/src/repo/pricecharting.ts`, `packages/db/src/repo/estimates.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/test/paginate.test.ts`

**Interfaces:**
- Consumes: `PcRow` (Task 4) — re-declared structurally here as `PcProductInput`, because `@pcg/db` must not depend on `@pcg/connectors` (connectors already depends on db). Also `Era`, `PcGradeKey` and `Estimate` from `@pcg/domain`.
- Produces:
  - `selectAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, size?: number): Promise<T[]>`
  - `lastOkImport(db): Promise<{ id: string; fetched_at: string; row_count: number } | null>`
  - `startImport(db, rowCount: number): Promise<string>`, which inserts `status='suspect', notes='in progress'`
  - `finishImport(db, id: string, status: "ok" | "suspect", notes: string | null): Promise<void>`
  - `upsertPcProducts(db, importId: string, rows: PcProductInput[]): Promise<void>`
  - `deleteStalePcProducts(db, importId: string): Promise<void>`
  - `loadSetMap(db): Promise<{ setId: string; consoleName: string; eraOverride: Era | null }[]>`
  - `loadPcProductsForConsoles(db, consoles: string[]): Promise<{ pcId: string; consoleName: string; productName: string; cardNumber: string | null }[]>`
  - `loadAllConsoleCounts(db): Promise<Map<string, number>>`
  - `loadLinkCandidates(db, setIds: string[]): Promise<{ id: string; setId: string; numberNum: number | null; numberPrinted: string }[]>`
  - `loadOverriddenPcIds(db): Promise<Set<string>>`
  - `upsertPcLinks(db, rows: { pc_id: string; state: "linked" | "needs_review"; product_id: string | null; review_reason: string | null }[]): Promise<void>`
  - `loadLinkedForEstimates(db): Promise<{ productId: string; language: "ja" | "en"; setId: string; releaseDate: string | null; salesVolume: number | null; pricesUsd: Partial<Record<PcGradeKey, number>> }[]>`
  - `loadPcgGradedPairs(db): Promise<Set<string>>`, with keys from `gradedKey`
  - `replaceEstimates(db, rows: EstimateRowInput[]): Promise<number>`, where `EstimateRowInput = { product_id; grade_value; estimate_usd; pct; era; import_id; source_as_of }`

- [ ] **Step 1: Write the failing pagination test**

```ts
// packages/db/test/paginate.test.ts
import { describe, it, expect } from "vitest";
import { selectAll } from "../src/paginate";

describe("selectAll", () => {
  it("keeps paging until a short page, so results are not truncated at 1000", async () => {
    const data = Array.from({ length: 2500 }, (_, i) => i);
    const calls: [number, number][] = [];
    const out = await selectAll<number>(async (from, to) => { calls.push([from, to]); return { data: data.slice(from, to + 1), error: null }; });
    expect(out).toHaveLength(2500);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("throws on an error", async () => {
    await expect(selectAll(async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @pcg/db test -- paginate`
Expected: FAIL with `Failed to resolve import "../src/paginate"`.

- [ ] **Step 3: Implement the paginator and repos**

```ts
// packages/db/src/paginate.ts
/** Supabase caps a select at 1000 rows by default; page until a short page comes back. */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  size = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const r = await page(from, from + size - 1);
    if (r.error) throw new Error(r.error.message);
    const rows = r.data ?? [];
    out.push(...rows);
    if (rows.length < size) return out;
  }
}
```

```ts
// packages/db/src/repo/pricecharting.ts
import type { Db } from "../client";
import { must } from "../client";
import { selectAll } from "../paginate";
import type { Era, PcGradeKey } from "@pcg/domain";

export interface PcProductInput { pcId: string; consoleName: string; productName: string; cardNumber: string | null; salesVolume: number | null; pricesUsd: Partial<Record<PcGradeKey, number>> }
const CHUNK = 500;

export async function lastOkImport(db: Db): Promise<{ id: string; fetched_at: string; row_count: number } | null> {
  const r = must(await db.from("pc_imports").select("id,fetched_at,row_count").eq("status", "ok").order("fetched_at", { ascending: false }).limit(1)) as { id: string; fetched_at: string; row_count: number }[];
  return r[0] ?? null;
}
export async function startImport(db: Db, rowCount: number): Promise<string> {
  const row = must(await db.from("pc_imports").insert({ row_count: rowCount, status: "suspect", notes: "in progress" }).select("id").single()) as { id: string };
  return row.id;
}
export async function finishImport(db: Db, id: string, status: "ok" | "suspect", notes: string | null) {
  must(await db.from("pc_imports").update({ status, notes }).eq("id", id));
}
export async function upsertPcProducts(db: Db, importId: string, rows: PcProductInput[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({ pc_id: r.pcId, console_name: r.consoleName, product_name: r.productName, card_number: r.cardNumber, sales_volume: r.salesVolume, prices_usd: r.pricesUsd, import_id: importId }));
    must(await db.from("pc_products").upsert(chunk, { onConflict: "pc_id" }));
  }
}
export async function deleteStalePcProducts(db: Db, importId: string) {
  must(await db.from("pc_products").delete().neq("import_id", importId));
}
export async function loadSetMap(db: Db) {
  const rows = must(await db.from("pc_set_map").select("set_id,console_name,era_override")) as { set_id: string; console_name: string; era_override: Era | null }[];
  return rows.map((r) => ({ setId: r.set_id, consoleName: r.console_name, eraOverride: r.era_override }));
}
export async function loadPcProductsForConsoles(db: Db, consoles: string[]) {
  if (!consoles.length) return [];
  const rows = await selectAll<{ pc_id: string; console_name: string; product_name: string; card_number: string | null }>((f, t) =>
    db.from("pc_products").select("pc_id,console_name,product_name,card_number").in("console_name", consoles).order("pc_id").range(f, t));
  return rows.map((r) => ({ pcId: r.pc_id, consoleName: r.console_name, productName: r.product_name, cardNumber: r.card_number }));
}
export async function loadAllConsoleCounts(db: Db): Promise<Map<string, number>> {
  const rows = await selectAll<{ console_name: string }>((f, t) => db.from("pc_products").select("console_name").order("pc_id").range(f, t));
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.console_name, (m.get(r.console_name) ?? 0) + 1);
  return m;
}
export async function loadLinkCandidates(db: Db, setIds: string[]) {
  if (!setIds.length) return [];
  const rows = await selectAll<{ id: string; set_id: string; number_num: number | null; number_printed: string }>((f, t) =>
    db.from("products").select("id,set_id,number_num,number_printed").in("set_id", setIds).order("id").range(f, t));
  return rows.map((r) => ({ id: r.id, setId: r.set_id, numberNum: r.number_num, numberPrinted: r.number_printed }));
}
export async function loadOverriddenPcIds(db: Db): Promise<Set<string>> {
  const rows = await selectAll<{ pc_id: string }>((f, t) => db.from("pc_product_links").select("pc_id").eq("is_override", true).order("pc_id").range(f, t));
  return new Set(rows.map((r) => r.pc_id));
}
export async function upsertPcLinks(db: Db, rows: { pc_id: string; state: "linked" | "needs_review"; product_id: string | null; review_reason: string | null }[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({ ...r, is_override: false, updated_at: new Date().toISOString() }));
    must(await db.from("pc_product_links").upsert(chunk, { onConflict: "pc_id" }));
  }
}
export async function loadLinkedForEstimates(db: Db) {
  type Row = { product_id: string; pc_products: { sales_volume: number | null; prices_usd: Partial<Record<PcGradeKey, number>> } | null; products: { language: "ja" | "en"; set_id: string; sets: { release_date: string | null } | null } | null };
  const rows = await selectAll<Row>((f, t) =>
    db.from("pc_product_links").select("product_id,pc_products(sales_volume,prices_usd),products(language,set_id,sets(release_date))").eq("state", "linked").order("pc_id").range(f, t) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>);
  return rows.filter((r) => r.pc_products && r.products).map((r) => ({
    productId: r.product_id, language: r.products!.language, setId: r.products!.set_id, releaseDate: r.products!.sets?.release_date ?? null,
    salesVolume: r.pc_products!.sales_volume, pricesUsd: r.pc_products!.prices_usd ?? {},
  }));
}
```

```ts
// packages/db/src/repo/estimates.ts
import type { Db } from "../client";
import { selectAll } from "../paginate";
import { gradedKey, type Era } from "@pcg/domain";

export interface EstimateRowInput { product_id: string; grade_value: number; estimate_usd: number; pct: number; era: Era; import_id: string; source_as_of: string }

/** Every (product, grade) with a real PCG price in ANY window. The 'all' window is the superset. */
export async function loadPcgGradedPairs(db: Db): Promise<Set<string>> {
  const rows = await selectAll<{ product_id: string; grade_value: number }>((f, t) =>
    db.from("price_points").select("product_id,grade_value").eq("window", "all").gt("n_sales", 0).order("product_id").range(f, t));
  return new Set(rows.map((r) => gradedKey(r.product_id, Number(r.grade_value))));
}

export async function replaceEstimates(db: Db, rows: EstimateRowInput[]): Promise<number> {
  const { data, error } = await db.rpc("replace_price_estimates", { rows });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
```

Append to `packages/db/src/index.ts`:

```ts
export * from "./paginate";
export * from "./repo/pricecharting";
export * from "./repo/estimates";
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm --filter @pcg/db test && pnpm --filter @pcg/db typecheck`
Expected: PASS (existing tests plus paginate and migration-0005), and no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/paginate.ts packages/db/src/repo/pricecharting.ts packages/db/src/repo/estimates.ts packages/db/src/index.ts packages/db/test/paginate.test.ts
git commit -m "feat(db): paginated repos for PriceCharting imports, links and estimates"
```

---

### Task 6: Ingest jobs — `pricecharting:csv`, `pricecharting:link`, `estimates`

**Files:**
- Create: `apps/ingest/src/jobs/pricecharting-csv.ts`, `pricecharting-link.ts`, `estimates.ts`
- Modify: `apps/ingest/src/cli.ts`, `apps/ingest/src/run.ts` (kill switch), `.env.example`
- Test: `apps/ingest/test/pricecharting-jobs.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–5.
- Produces:
  - Jobs `pricecharting:csv`, `pricecharting:link` and `estimates` in the CLI.
  - `pricechartingCsvJob(deps?: { download: (token: string) => Promise<string> }): Job`
  - `linkMapped(db: Db, log: (m: string) => void): Promise<{ linked: number; review: number }>`
  - `estimatesJob: Job`

- [ ] **Step 1: Write the failing job tests**

```ts
// apps/ingest/test/pricecharting-jobs.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => ({
  lastOk: null as null | { id: string; fetched_at: string; row_count: number },
  imports: [] as { id: string; status: string; notes: string | null }[],
  upserted: 0, deletedStale: false, links: [] as unknown[], estimates: [] as unknown[],
  failUpsert: false,
}));
vi.mock("@pcg/db", () => ({
  lastOkImport: async () => state.lastOk,
  startImport: async () => { state.imports.push({ id: "imp1", status: "suspect", notes: "in progress" }); return "imp1"; },
  finishImport: async (_db: unknown, id: string, status: string, notes: string | null) => { const i = state.imports.find((x) => x.id === id)!; i.status = status; i.notes = notes; },
  upsertPcProducts: async (_db: unknown, _id: string, rows: unknown[]) => { if (state.failUpsert) throw new Error("db down"); state.upserted += rows.length; },
  deleteStalePcProducts: async () => { state.deletedStale = true; },
  loadSetMap: async () => [{ setId: "sv03.5", consoleName: "Pokemon Scarlet & Violet 151", eraOverride: null }],
  loadPcProductsForConsoles: async () => [
    { pcId: "5001", consoleName: "Pokemon Scarlet & Violet 151", productName: "Blastoise ex #200", cardNumber: "200" },
    { pcId: "5003", consoleName: "Pokemon Scarlet & Violet 151", productName: "Blastoise ex [Reverse Holo] #9", cardNumber: "9" },
    { pcId: "5009", consoleName: "Pokemon Scarlet & Violet 151", productName: "Overridden #1", cardNumber: "1" },
  ],
  loadAllConsoleCounts: async () => new Map([["Pokemon Scarlet & Violet 151", 3], ["Pokemon Base Set", 2]]),
  loadLinkCandidates: async () => [{ id: "sv03.5-200", setId: "sv03.5", numberNum: 200, numberPrinted: "200/165" }, { id: "sv03.5-9", setId: "sv03.5", numberNum: 9, numberPrinted: "009/165" }],
  loadOverriddenPcIds: async () => new Set(["5009"]),
  upsertPcLinks: async (_db: unknown, rows: unknown[]) => { state.links = rows; },
  loadLinkedForEstimates: async () => [
    { productId: "sv03.5-200", language: "en", setId: "sv03.5", releaseDate: "2023-09-22", salesVolume: 412, pricesUsd: { "10": 1240, "9": 110 } },
    { productId: "nodate-1", language: "en", setId: "x", releaseDate: null, salesVolume: 1, pricesUsd: { "10": 10 } },
  ],
  loadPcgGradedPairs: async () => new Set(["sv03.5-200|10"]),
  replaceEstimates: async (_db: unknown, rows: unknown[]) => { state.estimates = rows; return rows.length; },
}));

const { pricechartingCsvJob } = await import("../src/jobs/pricecharting-csv");
const { estimatesJob } = await import("../src/jobs/estimates");
const csv = readFileSync(new URL("../../../packages/connectors/test/fixtures/pricecharting-sample.csv", import.meta.url), "utf8");
const ctx = { db: {} as never, log: () => {} };

beforeEach(() => { Object.assign(state, { lastOk: null, imports: [], upserted: 0, deletedStale: false, links: [], estimates: [], failUpsert: false }); process.env.PRICECHARTING_TOKEN = "t"; });

describe("pricecharting:csv", () => {
  it("imports, marks ok only after the upsert, drops stale rows, and links mapped sets", async () => {
    const stats = await pricechartingCsvJob({ download: async () => csv })(ctx);
    expect(state.upserted).toBe(7);
    expect(state.deletedStale).toBe(true);
    expect(state.imports[0]).toMatchObject({ status: "ok", notes: null });
    expect(stats.suspect).toBeUndefined();
    expect(state.links).toEqual([
      { pc_id: "5001", state: "linked", product_id: "sv03.5-200", review_reason: null },
      { pc_id: "5003", state: "needs_review", product_id: null, review_reason: "variant" },
    ]); // 5009 is an admin override and is never touched
  });
  it("is suspect and replaces nothing when the row count drops more than 20%", async () => {
    state.lastOk = { id: "old", fetched_at: new Date().toISOString(), row_count: 100 };
    const stats = await pricechartingCsvJob({ download: async () => csv })(ctx);
    expect(stats.suspect).toBe(true);
    expect(state.upserted).toBe(0);
    expect(state.deletedStale).toBe(false);
  });
  it("leaves the import suspect if the upsert dies halfway", async () => {
    state.failUpsert = true;
    await expect(pricechartingCsvJob({ download: async () => csv })(ctx)).rejects.toThrow("db down");
    expect(state.imports[0]!.status).toBe("suspect");
  });
  it("fails fast without a token", async () => {
    delete process.env.PRICECHARTING_TOKEN;
    await expect(pricechartingCsvJob({ download: async () => csv })(ctx)).rejects.toThrow("PRICECHARTING_TOKEN");
  });
});

describe("estimates", () => {
  it("is suspect and keeps existing estimates when the latest ok import is older than 7 days", async () => {
    state.lastOk = { id: "imp0", fetched_at: new Date(Date.now() - 8 * 86400000).toISOString(), row_count: 7 };
    expect((await estimatesJob(ctx)).suspect).toBe(true);
    expect(state.estimates).toEqual([]);
  });
  it("skips graded pairs and cards without an era, and stamps the import", async () => {
    const at = new Date().toISOString();
    state.lastOk = { id: "imp1", fetched_at: at, row_count: 7 };
    await estimatesJob(ctx);
    expect(state.estimates).toEqual([{ product_id: "sv03.5-200", grade_value: 9, estimate_usd: 66, pct: 0.6, era: "modern", import_id: "imp1", source_as_of: at }]);
  });
  it("fails clearly when there has never been an ok import", async () => {
    await expect(estimatesJob(ctx)).rejects.toThrow("pricecharting:csv");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @pcg/ingest test -- pricecharting-jobs`
Expected: FAIL with `Failed to resolve import "../src/jobs/pricecharting-csv"`.

- [ ] **Step 3: Implement the jobs**

```ts
// apps/ingest/src/jobs/pricecharting-link.ts
import type { Job } from "../run";
import type { Db } from "@pcg/db";
import { loadSetMap, loadPcProductsForConsoles, loadLinkCandidates, loadOverriddenPcIds, upsertPcLinks, loadAllConsoleCounts } from "@pcg/db";
import { linkPcProduct, type LinkCandidate } from "@pcg/domain";

export async function linkMapped(db: Db, log: (m: string) => void): Promise<{ linked: number; review: number }> {
  const map = await loadSetMap(db);
  const setByConsole = new Map(map.map((m) => [m.consoleName, m.setId]));
  const [pcRows, candidates, overridden] = await Promise.all([
    loadPcProductsForConsoles(db, [...setByConsole.keys()]), loadLinkCandidates(db, map.map((m) => m.setId)), loadOverriddenPcIds(db)]);
  const bySet = new Map<string, LinkCandidate[]>();
  for (const c of candidates) bySet.set(c.setId, [...(bySet.get(c.setId) ?? []), c]);
  const rows: { pc_id: string; state: "linked" | "needs_review"; product_id: string | null; review_reason: string | null }[] = [];
  const perSet = new Map<string, { linked: number; total: number }>();
  for (const r of pcRows) {
    if (overridden.has(r.pcId)) continue;
    const setId = setByConsole.get(r.consoleName)!;
    const res = linkPcProduct(r, bySet.get(setId) ?? []);
    rows.push(res.state === "linked"
      ? { pc_id: r.pcId, state: "linked", product_id: res.productId, review_reason: null }
      : { pc_id: r.pcId, state: "needs_review", product_id: null, review_reason: res.reason });
    const s = perSet.get(setId) ?? { linked: 0, total: 0 };
    s.total++; if (res.state === "linked") s.linked++;
    perSet.set(setId, s);
  }
  await upsertPcLinks(db, rows);
  for (const [setId, s] of perSet) log(`${setId}: linked ${s.linked}/${s.total}${s.linked < s.total * 0.5 ? "  ← under 50% linked, check the console-name mapping" : ""}`);
  const counts = await loadAllConsoleCounts(db);
  const unmapped = [...counts.entries()].filter(([c]) => !setByConsole.has(c)).sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (unmapped.length) log(`largest unmapped console names: ${unmapped.map(([c, n]) => `${c} (${n})`).join("; ")}`);
  const linked = rows.filter((r) => r.state === "linked").length;
  return { linked, review: rows.length - linked };
}

export const pricechartingLinkJob: Job = async ({ db, log }) => {
  const { linked, review } = await linkMapped(db, log);
  return { items_seen: linked + review, items_new: linked, items_updated: review };
};
```

```ts
// apps/ingest/src/jobs/pricecharting-csv.ts
import type { Job } from "../run";
import { downloadPcCsv, parsePcCsv, checkImport } from "@pcg/connectors";
import { lastOkImport, startImport, finishImport, upsertPcProducts, deleteStalePcProducts } from "@pcg/db";
import { linkMapped } from "./pricecharting-link";

export function pricechartingCsvJob(deps: { download: (token: string) => Promise<string> } = { download: downloadPcCsv }): Job {
  return async ({ db, log }) => {
    const token = process.env.PRICECHARTING_TOKEN;
    if (!token) throw new Error("PRICECHARTING_TOKEN is required (Legendary subscription → API/Download)");
    const { rows, missing } = parsePcCsv(await deps.download(token));
    const last = await lastOkImport(db);
    const check = checkImport(rows.length, missing, last?.row_count ?? null);
    const importId = await startImport(db, rows.length);
    if (!check.ok) {
      await finishImport(db, importId, "suspect", check.reason);
      log(`suspect, previous data kept: ${check.reason}`);
      return { items_seen: rows.length, items_new: 0, items_updated: 0, suspect: true };
    }
    await upsertPcProducts(db, importId, rows);
    await deleteStalePcProducts(db, importId);
    await finishImport(db, importId, "ok", null);
    log(`imported ${rows.length} PriceCharting rows`);
    const { linked, review } = await linkMapped(db, log);
    return { items_seen: rows.length, items_new: linked, items_updated: review };
  };
}
```

Note on the Task 6 test "replaces nothing" case: `startImport` still records a suspect import row. That's intended; it's the audit trail. But `upsertPcProducts` and `deleteStalePcProducts` are never called.

```ts
// apps/ingest/src/jobs/estimates.ts
import type { Job } from "../run";
import { lastOkImport, loadLinkedForEstimates, loadSetMap, loadPcgGradedPairs, replaceEstimates } from "@pcg/db";
import { computeEstimates, dropDuplicateProducts, eraFor, MAX_IMPORT_AGE_DAYS, type EstimateInput } from "@pcg/domain";

export const estimatesJob: Job = async ({ db, log }) => {
  const imp = await lastOkImport(db);
  if (!imp) throw new Error("no ok PriceCharting import yet; run `pnpm ingest pricecharting:csv` first");
  const ageDays = (Date.now() - new Date(imp.fetched_at).getTime()) / 86400000;
  if (ageDays > MAX_IMPORT_AGE_DAYS) {
    log(`suspect: latest ok import is ${ageDays.toFixed(1)} days old (max ${MAX_IMPORT_AGE_DAYS}); existing estimates kept`);
    return { items_seen: 0, items_new: 0, items_updated: 0, suspect: true };
  }
  const [linked, map, graded] = await Promise.all([loadLinkedForEstimates(db), loadSetMap(db), loadPcgGradedPairs(db)]);
  const override = new Map(map.map((m) => [m.setId, m.eraOverride]));
  const inputs: EstimateInput[] = [];
  let noEra = 0;
  for (const l of linked) {
    const era = eraFor(l.releaseDate, override.get(l.setId) ?? null);
    if (!era) { noEra++; continue; }
    inputs.push({ productId: l.productId, language: l.language, era, salesVolume: l.salesVolume, pricesUsd: l.pricesUsd });
  }
  const { unique, duplicates } = dropDuplicateProducts(inputs);
  if (duplicates.length) log(`skipped ${duplicates.length} products linked to several PriceCharting rows: ${duplicates.slice(0, 10).join(", ")}`);
  if (noEra) log(`skipped ${noEra} cards with no release date and no era_override`);
  const est = computeEstimates(unique, graded);
  const n = await replaceEstimates(db, est.map((e) => ({ product_id: e.productId, grade_value: e.gradeValue, estimate_usd: e.estimateUsd, pct: e.pct, era: e.era, import_id: imp.id, source_as_of: imp.fetched_at })));
  const byEra = new Map<string, number>();
  for (const e of est) byEra.set(e.era, (byEra.get(e.era) ?? 0) + 1);
  log(`${n} estimates for ${unique.length} cards (${[...byEra].map(([k, v]) => `${k} ${v}`).join(", ")})`);
  return { items_seen: linked.length, items_new: n, items_updated: 0 };
};
```

In `apps/ingest/src/cli.ts`, add the imports and job entries:

```ts
import { pricechartingCsvJob } from "./jobs/pricecharting-csv";
import { pricechartingLinkJob } from "./jobs/pricecharting-link";
import { estimatesJob } from "./jobs/estimates";
// inside `const jobs = { ... }`, after `prices: pricesJob,`:
  "pricecharting:csv": pricechartingCsvJob(),
  "pricecharting:link": pricechartingLinkJob,
  estimates: estimatesJob,
```

In `apps/ingest/src/run.ts`, extend `KILL_SWITCH`:

```ts
const KILL_SWITCH: Record<string, string> = { "yahoo:auctions": "CONNECTOR_YAHOO_AUC", "ebay:sold": "CONNECTOR_THECARDAPI", "ebay:sold-comps": "CONNECTOR_SOLDCOMPS", "pricecharting:csv": "CONNECTOR_PRICECHARTING" };
```

Append to `.env.example`:

```
PRICECHARTING_TOKEN=
CONNECTOR_PRICECHARTING=on
# PRICECHARTING_CSV_URL=   # optional full download URL (token included) if it differs from the schema default
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @pcg/ingest test && pnpm --filter @pcg/ingest typecheck`
Expected: PASS (existing tests plus 7 new), and no type errors.

The expected estimate in the test works out as follows:
- One modern EN card, so the group is smaller than 20 and `pct` is 0.6.
- Its grade 10 is already graded, so it's skipped.
- Grade 9: 110 × 0.6 = 66.
- `nodate-1` is skipped because it has no era.

- [ ] **Step 5: Commit**

```bash
git add apps/ingest/src/jobs/pricecharting-csv.ts apps/ingest/src/jobs/pricecharting-link.ts apps/ingest/src/jobs/estimates.ts apps/ingest/src/cli.ts apps/ingest/src/run.ts .env.example apps/ingest/test/pricecharting-jobs.test.ts
git commit -m "feat(ingest): pricecharting:csv, pricecharting:link and estimates jobs"
```

---

### Task 7: Web data — load estimates and build estimate grade options

**Files:**
- Modify: `apps/web/lib/card-data.ts`, `apps/web/lib/grades.ts`
- Test: `apps/web/test/grades.test.ts` (append)

**Interfaces:**
- Produces:
  - `interface EstimateRow { grade_value: number; estimate_usd: number; source_as_of: string }`
  - `CardPageData.estimates: EstimateRow[]`
  - `GradeOption.estimate?: boolean`
  - `ESTIMATE_MAX_AGE_DAYS = 14`
  - `estimateOptions(points: PricePointRow[], estimates: EstimateRow[], now: Date): GradeOption[]` (keys `"<gradeKey>e"`, e.g. `"10e"`, `"95e"`)
  - `defaultGradeKey` now prefers non-estimate options.

- [ ] **Step 1: Append the failing tests**

```ts
// append to apps/web/test/grades.test.ts
import { estimateOptions, ESTIMATE_MAX_AGE_DAYS } from "../lib/grades";
import type { EstimateRow } from "../lib/card-data";

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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @pcg/web test -- grades`
Expected: FAIL with `estimateOptions is not a function` (or a missing export).

- [ ] **Step 3: Implement**

In `apps/web/lib/card-data.ts`:

```ts
export interface EstimateRow { grade_value: number; estimate_usd: number; source_as_of: string }
// add to CardPageData:
  estimates: EstimateRow[];
// in loadCard, extend the Promise.all:
  const [{ data: points }, { data: sales }, { data: estimates }] = await Promise.all([
    db.from("price_points").select("*").eq("product_id", id),
    db.from("public_sales").select("id,grade_value,grade_label,price,currency,price_usd,sold_at,source,url,is_best_offer").eq("product_id", id).order("sold_at", { ascending: false }).limit(500),
    db.from("public_price_estimates").select("grade_value,estimate_usd,source_as_of").eq("product_id", id),
  ]);
// and return:
  return { product: p, set: sets, points: (points ?? []) as PricePointRow[], sales: (sales ?? []) as SaleRow[], estimates: (estimates ?? []) as EstimateRow[] };
```

In `apps/web/lib/grades.ts`:

```ts
// change the import line:
import type { EstimateRow, PricePointRow, SaleRow } from "./card-data";
// add `estimate?: boolean` to GradeOption:
export interface GradeOption { key: GradeKey; gradeValue: number; tier: string | null; label: string; nSales: number; medianUsd: number; minUsd: number; maxUsd: number; confidence: "high" | "med" | "low"; lastSoldAt: string; estimate?: boolean }

export const ESTIMATE_MAX_AGE_DAYS = 14;
/** Estimated grades: only where the card has never had a PCG sale at that grade (any window), and the source is fresh. */
export function estimateOptions(points: PricePointRow[], estimates: EstimateRow[], now: Date): GradeOption[] {
  const real = new Set(points.filter((p) => p.n_sales > 0).map((p) => Number(p.grade_value)));
  const maxAge = ESTIMATE_MAX_AGE_DAYS * 86400000;
  return estimates
    .filter((e) => !real.has(Number(e.grade_value)) && now.getTime() - new Date(e.source_as_of).getTime() <= maxAge)
    .sort((a, b) => Number(b.grade_value) - Number(a.grade_value))
    .map((e) => {
      const g = Number(e.grade_value), v = Number(e.estimate_usd);
      return { key: `${gradeKey(g, null)}e`, gradeValue: g, tier: null, label: gradeLabel(g, null), nSales: 0, medianUsd: v, minUsd: v, maxUsd: v, confidence: "low" as const, lastSoldAt: "", estimate: true };
    });
}

// replace defaultGradeKey:
export function defaultGradeKey(options: GradeOption[]): GradeKey | null {
  const real = options.filter((o) => !o.estimate);
  if (real.length === 0) return options[0]?.key ?? null;
  return real.find((o) => o.key === "10gm")?.key ?? real.find((o) => o.key === "10")?.key ?? [...real].sort((a, b) => b.nSales - a.nSales)[0]!.key;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @pcg/web test && pnpm --filter @pcg/web typecheck`
Expected: all web tests PASS, including the existing `defaultGradeKey` tests. The typecheck will **fail** in `CardView.tsx` only if it destructures something removed; it shouldn't, because `estimates` is additive. Fix any error before committing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/card-data.ts apps/web/lib/grades.ts apps/web/test/grades.test.ts
git commit -m "feat(web): load public estimates and build estimate grade options"
```

---

### Task 8: Web UI — estimate grades in the selector and the estimate box

**Files:**
- Create: `apps/web/components/EstimateBox.tsx`
- Modify: `apps/web/components/GradeSelect.tsx`, `apps/web/components/CardView.tsx`

**Interfaces:**
- Consumes: `estimateOptions`, `GradeOption.estimate` and `defaultGradeKey` (Task 7).
- Produces: `EstimateBox({ opt }: { opt: GradeOption })`.

- [ ] **Step 1: Create the EstimateBox**

```tsx
// apps/web/components/EstimateBox.tsx
import type { GradeOption } from "@/lib/grades";
import { GradeBadge } from "./GradeBadge";
import { Price } from "./Price";
import { fmtUsd } from "@/lib/format";

export const ESTIMATE_FOOTNOTE = "Estimated from PSA market prices and card popularity — no PCG sales yet.";

export function EstimateBox({ opt }: { opt: GradeOption }) {
  return (<>
    <div className="rounded-[18px] border border-dashed border-line bg-surface px-[22px] py-5">
      <div className="flex flex-wrap items-center gap-2.5 text-sm font-semibold text-ink-2"><GradeBadge grade={opt.gradeValue} size="lg" /><span className="rounded-full bg-sunk px-2 py-0.5 text-[12.5px] font-bold text-mute">Est.</span></div>
      <div className="mt-2.5"><Price value={`~${fmtUsd(opt.medianUsd)}`} className="text-[clamp(44px,7vw,64px)] text-mute" /></div>
    </div>
    <p className="mt-3 max-w-[70ch] text-[13px] leading-[1.55] text-mute">{ESTIMATE_FOOTNOTE}</p>
  </>);
}
```

- [ ] **Step 2: Show "Est." in the GradeSelect**

In `apps/web/components/GradeSelect.tsx`, replace both occurrences of the sales-count span. One is in `Option`:

```tsx
<span className="ml-auto text-[13.5px] font-medium text-mute tnum">{o.nSales} sales</span>
```
with:
```tsx
<span className="ml-auto text-[13.5px] font-medium text-mute tnum">{o.estimate ? "Est." : `${o.nSales} sales`}</span>
```

The other is in `trigger`:

```tsx
<span className="text-[13.5px] font-medium text-mute tnum">{cur.nSales} sales</span>
```
with:
```tsx
<span className="text-[13.5px] font-medium text-mute tnum">{cur.estimate ? "Est." : `${cur.nSales} sales`}</span>
```

- [ ] **Step 3: Wire up CardView**

Replace the body of `CardView` in `apps/web/components/CardView.tsx` (imports, plus everything from `const options` to the end):

```tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import type { CardPageData } from "@/lib/card-data";
import { WINDOWS, gradeOptions, estimateOptions, defaultGradeKey, salesFor, isWindow, type Window } from "@/lib/grades";
import { GradeSelect } from "./GradeSelect";
import { GuideBox } from "./GuideBox";
import { EstimateBox } from "./EstimateBox";
import { SalesList } from "./SalesList";
import { PriceChart } from "./PriceChart";
import { Segmented } from "./Segmented";
import { SectionHead } from "./SectionHead";
export function CardView({ data, now }: { data: CardPageData; now: string }) {
  const router = useRouter(); const sp = useSearchParams();
  const window: Window = isWindow(sp.get("w")) ? (sp.get("w") as Window) : "90d";
  const nowD = new Date(now);
  const real = gradeOptions(data.points, window);
  const options = [...real, ...estimateOptions(data.points, data.estimates, nowD)];
  const key = options.some((o) => o.key === sp.get("g")) ? sp.get("g")! : defaultGradeKey(options);
  const opt = options.find((o) => o.key === key);
  const set = (k: string, v: string) => { const q = new URLSearchParams(sp.toString()); q.set(k, v); router.replace(`?${q.toString()}`, { scroll: false }); };
  const w = WINDOWS.find((x) => x.value === window)!;
  const isReal = opt != null && !opt.estimate;
  const sales = isReal ? salesFor(data.sales, opt, window, nowD) : [];
  return (<>
    <section>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3"><h2 className="m-0 text-[22px] font-extrabold tracking-[-0.02em]">Guide price</h2><Segmented label="Window" value={window} options={WINDOWS.map((x) => ({ value: x.value, label: x.label }))} onChange={(v) => set("w", v)} /></div>
      {opt ? (<>
        <div className="mb-3"><GradeSelect options={options} value={opt.key} onChange={(k) => set("g", k)} /></div>
        {opt.estimate ? <EstimateBox opt={opt} /> : (<>
          <GuideBox opt={opt} sales={data.sales} allOptions={real} window={window} now={nowD} />
          <p className="mt-3 max-w-[70ch] text-[13px] leading-[1.55] text-mute">Median of {opt.nSales} matched {opt.label} sales in the last {w.text}, in USD. Yen sales are converted at the ECB rate on the day they sold. Best-offer sales are listed but left out of the median.</p>
        </>)}
      </>) : <div className="rounded-[18px] border border-line-2 bg-surface p-6 text-mute">No PCG sales recorded in this window yet.</div>}
    </section>
    {isReal && (<section className="mt-10"><SectionHead title={`${opt.label} sales`} aside={`${sales.length} in this window`} /><SalesList sales={sales} opt={opt} /></section>)}
    {isReal && sales.length > 0 && (<section className="mt-10"><SectionHead title="Over time" aside={`Last ${w.text}, USD`} /><PriceChart sales={sales} gold={opt.gradeValue === 10} window={window} now={nowD} />
      <div className="flex flex-wrap gap-4 pt-2 text-[12.5px] font-medium text-mute"><span><i className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full" style={{ background: opt.gradeValue === 10 ? "var(--gold-badge)" : "var(--accent)" }} />{opt.label} sales</span><span><i className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full bg-surface" style={{ boxShadow: `inset 0 0 0 2px ${opt.gradeValue === 10 ? "var(--gold-badge)" : "var(--accent)"}` }} />Best offer, not in median</span><span className="ml-auto">Line is the rolling median</span></div></section>)}
  </>);
}
```

`GuideBox` gets `allOptions={real}` so "most traded grade" ignores estimates. This file is only reached through the card page; home, search and chart code never import `estimateOptions`.

- [ ] **Step 4: Typecheck, run the tests and check visually**

Run: `pnpm --filter @pcg/web typecheck && pnpm --filter @pcg/web test`
Expected: PASS.

Then run `pnpm web` and open a card page that has estimates (after Task 10 seeds data). Alternatively, temporarily insert a row with the service role:
```sql
insert into pc_imports (id,row_count,status) values ('00000000-0000-0000-0000-0000000000e1',1,'ok');
insert into price_estimates values ('<a product id with no PCG sales>',10,84,0.6,'modern','00000000-0000-0000-0000-0000000000e1',now(),now());
```
Then check:
- The selector shows "PCG 10 · Est.".
- The box shows "~$84" with an "Est." pill and the footnote.
- There's no sales list or chart.
- On a card that **has** PCG sales, the page looks unchanged.

Delete the test rows afterwards. Run `pnpm --filter @pcg/web shots` and look at the card-page screenshots in light and dark, at 390 and 1280 wide.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/EstimateBox.tsx apps/web/components/GradeSelect.tsx apps/web/components/CardView.tsx
git commit -m "feat(web): show labelled PSA-based estimates for never-sold grades on the card page"
```

---

### Task 9: Admin — PriceCharting link review and health

**Files:**
- Create: `apps/web/app/admin/review/pricecharting/page.tsx`, `apps/web/app/admin/review/pricecharting/actions.ts`
- Modify: `apps/web/app/admin/review/page.tsx`, `apps/web/app/admin/health/page.tsx`

**Interfaces:**
- Produces:
  - Server actions `linkPcRow(pcId: string, formData: FormData)` (reads `productId`) and `rejectPcRow(pcId: string)`.
  - Route `/admin/review/pricecharting`.

- [ ] **Step 1: Write the server actions**

```ts
// apps/web/app/admin/review/pricecharting/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { serviceClient } from "@/lib/supabase-server";

export async function linkPcRow(pcId: string, formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "").trim();
  if (!productId) throw new Error("product id is required");
  const db = serviceClient();
  const { data: p } = await db.from("products").select("id").eq("id", productId).maybeSingle();
  if (!p) throw new Error(`no product with id ${productId}`);
  const { error } = await db.from("pc_product_links").update({ state: "linked", product_id: productId, review_reason: null, is_override: true, updated_at: new Date().toISOString() }).eq("pc_id", pcId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/review/pricecharting");
}

export async function rejectPcRow(pcId: string) {
  await requireAdmin();
  const { error } = await serviceClient().from("pc_product_links").update({ state: "rejected", product_id: null, is_override: true, updated_at: new Date().toISOString() }).eq("pc_id", pcId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/review/pricecharting");
}
```

- [ ] **Step 2: Write the page**

```tsx
// apps/web/app/admin/review/pricecharting/page.tsx
import { serviceClient } from "@/lib/supabase-server";
import { ChipLink } from "@/components/Chip";
import { linkPcRow, rejectPcRow } from "./actions";

export const dynamic = "force-dynamic";
const REASONS: Record<string, string> = { no_card_number: "No card number", variant: "Variant", no_match: "No matching card", ambiguous: "Several matching cards" };

export default async function PcReview() {
  const { data } = await serviceClient().from("pc_product_links").select("pc_id,review_reason,pc_products(console_name,product_name,card_number)").eq("state", "needs_review").order("updated_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as unknown as { pc_id: string; review_reason: string | null; pc_products: { console_name: string; product_name: string; card_number: string | null } | null }[];
  return (<>
    <div className="mb-4 flex flex-wrap items-center gap-3"><ChipLink href="/admin/review">← Listings</ChipLink><h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em]">{rows.length} PriceCharting row{rows.length === 1 ? "" : "s"}<span className="ml-2 text-base font-semibold tracking-normal text-mute">need a card</span></h1></div>
    <p className="mb-4 max-w-[70ch] text-[13.5px] text-mute">These rows did not link to exactly one card, so they produce no estimate. Link one to a product id, for example <code>sv03.5-200</code>, or reject it.</p>
    <ul className="m-0 flex list-none flex-col gap-2 p-0">{rows.map((r) => (
      <li key={r.pc_id} className="grid grid-cols-1 gap-2 rounded-xl border border-line-2 bg-surface px-3.5 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div><div className="text-[15px] font-bold">{r.pc_products?.product_name}</div><div className="text-[13px] text-mute">{r.pc_products?.console_name} · number {r.pc_products?.card_number ?? "none"} · {REASONS[r.review_reason ?? ""] ?? "Other"}</div></div>
        <div className="flex flex-wrap gap-2">
          <form action={linkPcRow.bind(null, r.pc_id)} className="flex gap-2"><input name="productId" required placeholder="product id" className="min-h-10 rounded-lg border border-line bg-surface px-2.5 text-[14px]" /><button className="min-h-10 rounded-lg bg-ink px-3 text-[14px] font-bold text-ground">Link</button></form>
          <form action={rejectPcRow.bind(null, r.pc_id)}><button className="min-h-10 rounded-lg border border-line px-3 text-[14px] font-bold text-ink-2">Reject</button></form>
        </div>
      </li>))}</ul>
  </>);
}
```

- [ ] **Step 3: Add the chip to the review page**

In `apps/web/app/admin/review/page.tsx`, after the `fx` query, add:

```ts
const { count: pcCount } = await db.from("pc_product_links").select("pc_id", { count: "exact", head: true }).eq("state", "needs_review");
```

Then inside the chips `div`, after the `chips.map(...)`, add:

```tsx
{(pcCount ?? 0) > 0 && <ChipLink href="/admin/review/pricecharting" className="shrink-0 gap-[7px]">PriceCharting links <b className="font-extrabold text-mute">{pcCount}</b></ChipLink>}
```

- [ ] **Step 4: Update the health page**

In `apps/web/app/admin/health/page.tsx`:

```ts
const SWITCHES = [["The Card API", "CONNECTOR_THECARDAPI"], ["Yahoo! Auctions", "CONNECTOR_YAHOO_AUC"], ["SoldComps", "CONNECTOR_SOLDCOMPS"], ["PriceCharting", "CONNECTOR_PRICECHARTING"]] as const;
```

Add `db.from("pc_imports").select("fetched_at,status").eq("status", "ok").order("fetched_at", { ascending: false }).limit(1)` as a fifth entry in the `Promise.all`, destructured as `{ data: pcImp }`. Then add this row at the top of the Connectors `<tbody>`:

```tsx
<tr><td className={`${kv} font-medium text-ink-2`}>PriceCharting CSV</td><td className={`${kv} text-right text-[13px] text-mute`}>{pcImp?.[0] ? relativeTime(pcImp[0].fetched_at, now) : "never imported"}</td></tr>
```

The `pricecharting:csv`, `pricecharting:link` and `estimates` runs appear in the job tiles automatically, because they come from `ingest_runs`.

- [ ] **Step 5: Typecheck and check manually**

Run: `pnpm --filter @pcg/web typecheck`
Expected: no errors.

Then, with `pnpm web` running, signed in as admin:
- Open `/admin/review/pricecharting`. It shows the needs-review rows from Task 10's import, or an empty list before then.
- Link one row to a real product ID. It disappears from the list and `pc_product_links.is_override` is true.
- Linking to a non-existent ID shows an error.
- `/admin/health` shows the PriceCharting switch and the import age.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/admin/review/pricecharting apps/web/app/admin/review/page.tsx apps/web/app/admin/health/page.tsx
git commit -m "feat(admin): PriceCharting link review and health status"
```

---

### Task 10: Apply the migration, verify access, and run end to end

**Files:** none new. Operational verification against the linked Supabase project.

**This step needs the user:** the live run in Step 3 needs `PRICECHARTING_TOKEN` in `.env`, from the Legendary subscription. Steps 1–2 don't. If there's no token yet, run Steps 1–2, skip to Step 4 using the fixture-import fallback, and report Step 3 as pending.

- [ ] **Step 1: Apply the migration and the seed**

Run, from the repo root:
```bash
supabase db query --linked -f packages/db/migrations/0005_psa_estimates.sql
supabase db query --linked "select id,name_en from sets where name_en ilike '%151%'"
supabase db query --linked -f packages/db/seed/pc-set-map.sql
```
Expected: the migration applies without errors, and the set map has one row. If the `151` set id differs from `sv03.5`, fix the seed and re-run it.

- [ ] **Step 2: Verify anon access through Postgres roles**

```bash
supabase db query --linked "begin; set local role anon; select count(*) from public_price_estimates; rollback;"
supabase db query --linked "begin; set local role anon; select count(*) from price_estimates; rollback;"
supabase db query --linked "begin; set local role anon; select count(*) from pc_products; rollback;"
supabase db query --linked "begin; set local role anon; select replace_price_estimates('[]'::jsonb); rollback;"
```
Expected:
- The first succeeds with a count of 0.
- The other three return **0 rows or a permission error**, never data. RLS with no policy returns 0 rows; the RPC fails with `permission denied for function`.
- Also check that `select column_name from information_schema.columns where table_name='public_price_estimates'` has no `pct`.

- [ ] **Step 3: Live import (needs the token)**

```bash
pnpm ingest pricecharting:csv
```
Expected:
- `imported N PriceCharting rows`.
- A per-set link line such as `sv03.5: linked X/Y`.
- A list of the largest unmapped console names.

If the download fails with an HTTP error, get the real CSV URL from PriceCharting's Subscriptions page → "API/Download". Set `PRICECHARTING_CSV_URL` in `.env` and update `PRICECHARTING.csvUrl` in `schema.ts`.

Record the real CSV header line in `docs/research/2026-10-psa-price-sources.md`. If any column in the `PRICECHARTING.gradeColumns` mapping is absent, stop and report it.

**Fallback without a token:** run a one-off import from the test fixture to exercise the pipeline, then clean up afterwards with `delete from pc_products; delete from pc_imports;`. Use this command:

```bash
pnpm exec tsx -e 'import "dotenv/config"; import { readFileSync } from "node:fs"; import { pricechartingCsvJob } from "./apps/ingest/src/jobs/pricecharting-csv"; import { runJob } from "./apps/ingest/src/run"; process.env.PRICECHARTING_TOKEN ??= "fixture"; await runJob("pricecharting:csv", pricechartingCsvJob({ download: async () => readFileSync("packages/connectors/test/fixtures/pricecharting-sample.csv", "utf8") }));'
```

- [ ] **Step 4: Compute and inspect the estimates**

```bash
pnpm ingest prices && pnpm ingest estimates
supabase db query --linked "select e.product_id, e.grade_value, e.estimate_usd, e.pct, e.era, (p.prices_usd->>(case when e.grade_value in (8.5) then '8' when e.grade_value in (7.5) then '7' else e.grade_value::text end))::numeric as psa from price_estimates e join pc_product_links l on l.product_id=e.product_id and l.state='linked' join pc_products p on p.pc_id=l.pc_id order by e.estimate_usd desc limit 15"
supabase db query --linked "select count(*) from price_estimates e join price_points pp on pp.product_id=e.product_id and pp.grade_value=e.grade_value"
```
Expected:
- The `estimates` log shows a count per era.
- In the first query, every row satisfies `estimate_usd ≤ psa` and `0.6 ≤ pct ≤ 0.9`.
- The second query returns **0**: no estimate exists for any graded pair.

- [ ] **Step 5: Check the card page and run the full suite**

Run: `pnpm test && pnpm typecheck`
Expected: every workspace passes.

Then, with `pnpm web`:
- Open an estimated card from Step 4. You should see "~$…", "Est." and the footnote, with no PSA price anywhere in the page source (view-source and search for the PSA price value).
- Open a card with PCG sales. It should be unchanged.

Run `pnpm --filter @pcg/web shots` and review the screenshots.

- [ ] **Step 6: Update the handoff note and commit**

Append a "PSA estimates" section to `docs/superpowers/2026-09-22-data-pipeline-and-ebay-accuracy.md` covering:
- The new jobs and their run order: `pricecharting:csv` → `prices` → `estimates`.
- That `pc_set_map` is the list of sets.
- Where to review links.
- That nothing is scheduled in GitHub Actions.
- The licence reminder (spec §11).

```bash
git add docs/superpowers/2026-09-22-data-pipeline-and-ebay-accuracy.md docs/research/2026-10-psa-price-sources.md
git commit -m "docs: PSA estimates runbook and live CSV findings"
```
