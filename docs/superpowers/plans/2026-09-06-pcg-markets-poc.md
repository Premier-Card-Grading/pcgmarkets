# PCG Markets POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a PWA where anyone can search a Pokémon card by number and see what PCG-graded copies actually sold for, per grade, backed by linked real sales from eBay and Yahoo! Auctions Japan.

**Architecture:** pnpm monorepo. `packages/domain` holds every parsing/matching/pricing rule as pure, fixture-tested TypeScript. `packages/connectors` fetch and normalise external data into `RawListing`s. `apps/ingest` is a Node CLI that GitHub Actions runs on cron: it writes immutable raw listings to Supabase Postgres, runs the matcher (derived layer, rebuildable), and materialises `price_points`. `apps/web` (Next.js on Vercel) reads those tables to render search, the card page, and an admin review queue where humans resolve anything the matcher couldn't.

**Tech Stack:** Node 22, pnpm 9, TypeScript 5, vitest, Next.js 15 (App Router), Tailwind, @supabase/supabase-js + @supabase/ssr, cheerio, recharts, @serwist/next, GitHub Actions, Supabase (Postgres 15 + Auth), Vercel.

**Spec:** `docs/superpowers/specs/2026-09-06-pcg-markets-design.md` (audited; see `2026-09-06-spec-audit.md`). Research in `docs/research/`.

## Global Constraints

- Free tiers only: Supabase free, Vercel Hobby, GitHub Actions free, The Card API free (5k records/day, 3-day lookback). No paid services.
- Sources in POC: **The Card API** (eBay sold) and **Yahoo! Auctions closedsearch** only. No Yahoo!フリマ, no Mercari, no eBay Browse.
- Yahoo scraping: only `/closedsearch/closedsearch?p=<keyword>` plus the page's own next-page link; ≤1 req/s; real User-Agent containing `CONTACT_EMAIL`; 6h pause on 429/403.
- Never name-match a listing to a card. Matching uses eBay structured metadata, or JP set code / number+denominator, plus a grade token. Anything else → `needs_review`.
- Never discard a listing. `raw_listings` is write-once except `kind`, `sold_at`, `ended_at`, `fetched_at`.
- Seller identifiers (username, id, feedback, contact) are stripped before `raw` is stored. Only `seller_country` is kept.
- Grade key is `(grade_value, grade_label)`. Label is only meaningful at 10 (`Flawless` / `Pristine` / `Gem Mint`); `price_points.grade_label` uses `'any'` for pooled.
- Median, not mean. Even count → mean of the two middle values. Best-offer-with-unknown-price and `price <= 0` excluded.
- English UI only. Pokémon JA + EN only. TCGdex is the sole catalog.
- All prices displayed in USD converted at the ECB rate on or before the sale date; native amount shown alongside.
- Every scheduled job writes an `ingest_runs` row and honours `CONNECTOR_<NAME>=off`.

---

## File structure

```
pcgmarkets/
├── package.json                         pnpm workspaces, root scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── .github/workflows/ingest.yml         cron matrix → `pnpm ingest <job>`
├── packages/
│   ├── domain/                          pure logic, zero I/O
│   │   ├── src/index.ts                 re-exports
│   │   ├── src/types.ts                 RawListing, MatchResult, EbayMetadata, CertRecord…
│   │   ├── src/card-number.ts           parseCardNumber, classifySearch, numberFromCatalog
│   │   ├── src/grade.ts                 parseGradeFromText, parseTierLabel, normalizeGradeValue
│   │   ├── src/jp-extract.ts            detectLanguage, findCardNumber, findSetCode, isLot, noise checks
│   │   ├── src/catalog-index.ts         CatalogIndex interface + InMemoryCatalog
│   │   ├── src/match-jp.ts              matchJp
│   │   ├── src/match-ebay.ts            matchEbay
│   │   ├── src/matcher.ts               matchListing dispatch + MATCHER_VERSION
│   │   ├── src/pricing.ts               median, confidence, computePricePoints
│   │   └── test/                        vitest specs + fixtures/titles.json
│   ├── db/                              Supabase schema + typed repos
│   │   ├── migrations/0001_init.sql
│   │   ├── migrations/0002_search.sql
│   │   ├── migrations/0003_public_views.sql
│   │   ├── src/client.ts                createServiceClient / createAnonClient
│   │   ├── src/strip-seller.ts          stripSellerFields
│   │   └── src/repo/{catalog,listings,matches,prices,runs,state,fx}.ts
│   └── connectors/                      one folder per source, fixture-tested
│       ├── src/types.ts                 Connector, Page, FetchContext
│       ├── src/http.ts                  politeFetch
│       ├── src/tcgdex/index.ts
│       ├── src/yahoo-auctions/{parse,index}.ts
│       ├── src/thecardapi/{schema,index}.ts
│       ├── src/pcg/index.ts             lookupCert
│       ├── src/fx/index.ts              fetchRates
│       └── test/fixtures/               recorded HTML/JSON
├── apps/
│   ├── ingest/
│   │   ├── src/cli.ts                   `ingest <job>`
│   │   ├── src/run.ts                   wraps a job: kill switch, ingest_runs, error isolation
│   │   └── src/jobs/{catalog-tcgdex,ebay-sold,yahoo-auctions,fx-daily,match,prices}.ts
│   └── web/                             Next.js
│       ├── app/page.tsx                 search
│       ├── app/card/[id]/page.tsx       card page
│       ├── app/admin/layout.tsx         auth gate
│       ├── app/admin/review/page.tsx
│       ├── app/admin/health/page.tsx
│       ├── app/api/search/route.ts
│       ├── lib/{supabase-server,search,format}.ts
│       └── components/{PriceGrid,SoldList,PriceChart,SearchBox,ReviewRow}.tsx
├── spikes/                              throwaway scripts (Phase 1)
│   ├── record-yahoo.ts
│   ├── record-thecardapi.ts
│   └── count-coverage.ts
└── docs/
```

**Phases:** 1 Scaffold → 2 Domain (pure) → 3 DB → 4 Connectors + fixtures → 5 Spike/coverage gate → 6 Ingest jobs + cron → 7 Web → 8 Smoke.

---

## Phase 1 — Scaffold

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.env.example`, `.nvmrc`
- Create: `packages/domain/package.json`, `packages/domain/tsconfig.json`, `packages/domain/vitest.config.ts`, `packages/domain/src/index.ts`
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`
- Create: `packages/connectors/package.json`, `packages/connectors/tsconfig.json`, `packages/connectors/vitest.config.ts`
- Create: `apps/ingest/package.json`, `apps/ingest/tsconfig.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: workspace packages `@pcg/domain`, `@pcg/db`, `@pcg/connectors`, `@pcg/ingest`; root scripts `pnpm test`, `pnpm typecheck`, `pnpm ingest <job>`.

- [ ] **Step 1: Root files**

`package.json`:
```json
{
  "name": "pcgmarkets",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "pnpm -r --if-present test",
    "typecheck": "pnpm -r --if-present typecheck",
    "ingest": "pnpm --filter @pcg/ingest start --",
    "web": "pnpm --filter @pcg/web dev"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "tsx": "^4.19.0",
    "@types/node": "^22.7.0"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "noUncheckedIndexedAccess": true
  }
}
```

`.nvmrc`: `22`

`.env.example`:
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
THECARDAPI_KEY=
CONTACT_EMAIL=
CONNECTOR_THECARDAPI=on
CONNECTOR_YAHOO_AUC=on
```

Append to `.gitignore`:
```
coverage/
*.tsbuildinfo
spikes/out/
```

- [ ] **Step 2: Package manifests**

`packages/domain/package.json`:
```json
{
  "name": "@pcg/domain",
  "version": "0.0.1",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" }
}
```
`packages/domain/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```
`packages/domain/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
```
`packages/domain/src/index.ts`:
```ts
export {};
```

`packages/db/package.json`:
```json
{
  "name": "@pcg/db",
  "version": "0.0.1",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "@supabase/supabase-js": "^2.45.0", "@pcg/domain": "workspace:*" }
}
```
`packages/db/tsconfig.json`: same as domain.

`packages/connectors/package.json`:
```json
{
  "name": "@pcg/connectors",
  "version": "0.0.1",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": { "cheerio": "^1.0.0", "@pcg/domain": "workspace:*" }
}
```
`packages/connectors/tsconfig.json` and `vitest.config.ts`: same as domain.

`apps/ingest/package.json`:
```json
{
  "name": "@pcg/ingest",
  "version": "0.0.1",
  "type": "module",
  "scripts": { "start": "tsx src/cli.ts", "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@pcg/domain": "workspace:*",
    "@pcg/db": "workspace:*",
    "@pcg/connectors": "workspace:*",
    "dotenv": "^16.4.0"
  }
}
```
`apps/ingest/tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "include": ["src"] }`

- [ ] **Step 3: Install and verify**

Run: `pnpm install && pnpm typecheck`
Expected: install succeeds; typecheck passes with no errors (empty packages).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: pnpm monorepo scaffold (domain, db, connectors, ingest)"
```

---

## Phase 2 — Domain (pure logic)

### Task 2: Shared types and card-number parsing

**Files:**
- Create: `packages/domain/src/types.ts`, `packages/domain/src/card-number.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/card-number.test.ts`

**Interfaces:**
- Produces:
  - `type Language = 'ja' | 'en'`; `type Source = 'thecardapi' | 'yahoo_auc'`
  - `interface RawListing` (see code)
  - `interface ParsedNumber { num: number; denom: number | null; suffix: string | null; printed: string }`
  - `parseCardNumber(input: string): ParsedNumber | null`
  - `classifySearch(q: string): SearchShape`
  - `numberFromCatalog(localId: string, set: { id: string; cardCountOfficial: number | null }): ParsedNumber | null`

- [ ] **Step 1: Write types**

`packages/domain/src/types.ts`:
```ts
export type Language = "ja" | "en";
export type Source = "thecardapi" | "yahoo_auc";
export type ListingKind = "sold" | "ended";

/** Structured fields an eBay-derived source can provide. All optional; absent = seller left it blank. */
export interface EbayMetadata {
  grader?: string;        // "Premier Card Grading (PCG)" | "PSA" | "Other" | ...
  grade?: string;         // "10" | "9.5" | "Authentic"
  certNumber?: string;
  set?: string;           // "Obsidian Flames", "SV1a Triplet Beat"
  cardNumber?: string;    // "201/165" | "201"
  language?: string;      // "Japanese" | "English"
}

export interface RawListing {
  source: Source;
  sourceItemId: string;
  url: string;
  title: string;
  description: string | null;
  price: number;
  currency: string;               // ISO 4217
  kind: ListingKind;
  soldAt: string | null;          // ISO timestamp
  endedAt: string | null;
  isBestOffer: boolean;
  sellerCountry: string | null;
  externalItemId: string | null;  // eBay item id when source is an aggregator
  imageUrls: string[];
  metadata: EbayMetadata | Record<string, never>;
  raw: unknown;                   // full payload, seller fields already stripped
}

/** What the PCG cert API returns, reduced to what matching needs. */
export interface CertRecord {
  gradedId: string;       // 9 digits
  setName: string;
  cardNumber: string;
  language: string;       // "Japanese" | "English"
  finalGrade: number | null;
  grade: string;          // "Gem Mint" | "Pristine" | "Flawless" | "Mint" ...
}

export type TierLabel = "Flawless" | "Pristine" | "Gem Mint";
export type MatchState = "matched" | "needs_review" | "rejected";
export type MatchMethod = "ebay_metadata" | "cert" | "jp_set_code" | "jp_number_denom" | "admin";
export type ReviewReason =
  | "no_card_number" | "no_set_code" | "ambiguous_set" | "no_grade" | "no_metadata"
  | "grader_missing" | "possible_pcg_set_code" | "possible_pcgs" | "lot" | "grader_not_pcg" | "other";

export interface MatchResult {
  state: MatchState;
  productId: string | null;
  gradeValue: number | null;      // null = Authentication or unknown
  gradeLabel: TierLabel | "Authentic" | null;
  certId: string | null;
  matchMethod: MatchMethod | null;
  reviewReason: ReviewReason | null;
  extracted: Record<string, unknown>;
}
```

- [ ] **Step 2: Write the failing tests**

`packages/domain/test/card-number.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseCardNumber, classifySearch, numberFromCatalog } from "../src/card-number";

describe("parseCardNumber", () => {
  it("parses zero-padded with denominator", () => {
    expect(parseCardNumber("080/090")).toEqual({ num: 80, denom: 90, suffix: null, printed: "080/090" });
  });
  it("normalises spaces and missing zeros to the same key", () => {
    const a = parseCardNumber("80/90")!, b = parseCardNumber("080 / 090")!;
    expect([a.num, a.denom]).toEqual([b.num, b.denom]);
  });
  it("parses numerator only", () => {
    expect(parseCardNumber("080")).toEqual({ num: 80, denom: null, suffix: null, printed: "080" });
  });
  it("parses promo suffix", () => {
    expect(parseCardNumber("001/SV-P")).toEqual({ num: 1, denom: null, suffix: "SV-P", printed: "001/SV-P" });
    expect(parseCardNumber("84/pcg-p")!.suffix).toBe("PCG-P");
  });
  it("rejects non-numbers", () => {
    expect(parseCardNumber("Charizard")).toBeNull();
    expect(parseCardNumber("1234/5")).toBeNull();
  });
});

describe("classifySearch", () => {
  it("routes 9 digits to cert", () => {
    expect(classifySearch("000343136")).toEqual({ kind: "cert", cert: "000343136" });
  });
  it("routes number-shaped to number", () => {
    expect(classifySearch(" 201/165 ")).toMatchObject({ kind: "number", number: { num: 201, denom: 165 } });
  });
  it("routes everything else to name", () => {
    expect(classifySearch("Charizard ex")).toEqual({ kind: "name", q: "Charizard ex" });
  });
});

describe("numberFromCatalog", () => {
  it("builds printed number from TCGdex localId + official count", () => {
    expect(numberFromCatalog("073", { id: "SV1a", cardCountOfficial: 73 }))
      .toEqual({ num: 73, denom: 73, suffix: null, printed: "073/073" });
  });
  it("handles secret rares above the denominator", () => {
    expect(numberFromCatalog("201", { id: "sv03", cardCountOfficial: 165 })!.printed).toBe("201/165");
  });
  it("treats -P sets as promos with suffix", () => {
    expect(numberFromCatalog("001", { id: "SV-P", cardCountOfficial: null }))
      .toEqual({ num: 1, denom: null, suffix: "SV-P", printed: "001/SV-P" });
  });
  it("returns null for non-numeric localIds (vintage JP)", () => {
    expect(numberFromCatalog("Charizard", { id: "base1", cardCountOfficial: 102 })).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @pcg/domain test`
Expected: FAIL — cannot resolve `../src/card-number`.

- [ ] **Step 4: Implement**

`packages/domain/src/card-number.ts`:
```ts
export interface ParsedNumber {
  num: number;
  denom: number | null;
  suffix: string | null;
  printed: string;
}

const NUM_RE = /^\s*(\d{1,3})\s*(?:\/\s*(\d{1,3}|[A-Za-z]{1,4}-[Pp]))?\s*$/;

export function parseCardNumber(input: string): ParsedNumber | null {
  const m = NUM_RE.exec(input);
  if (!m) return null;
  const numStr = m[1]!;
  const num = parseInt(numStr, 10);
  const d = m[2];
  if (d === undefined) return { num, denom: null, suffix: null, printed: numStr };
  if (/^\d+$/.test(d)) return { num, denom: parseInt(d, 10), suffix: null, printed: `${numStr}/${d}` };
  const suffix = d.toUpperCase();
  return { num, denom: null, suffix, printed: `${numStr}/${suffix}` };
}

export type SearchShape =
  | { kind: "cert"; cert: string }
  | { kind: "number"; number: ParsedNumber }
  | { kind: "name"; q: string };

export function classifySearch(q: string): SearchShape {
  const t = q.trim();
  if (/^\d{9}$/.test(t)) return { kind: "cert", cert: t };
  const n = parseCardNumber(t);
  if (n) return { kind: "number", number: n };
  return { kind: "name", q: t };
}

const PROMO_SET_RE = /-P$/i;

export function numberFromCatalog(
  localId: string,
  set: { id: string; cardCountOfficial: number | null },
): ParsedNumber | null {
  if (!/^\d{1,3}$/.test(localId)) return null;
  const num = parseInt(localId, 10);
  if (PROMO_SET_RE.test(set.id)) {
    const suffix = set.id.toUpperCase();
    return { num, denom: null, suffix, printed: `${localId}/${suffix}` };
  }
  if (set.cardCountOfficial == null) return { num, denom: null, suffix: null, printed: localId };
  const denom = set.cardCountOfficial;
  return { num, denom, suffix: null, printed: `${localId}/${String(denom).padStart(localId.length, "0")}` };
}
```

`packages/domain/src/index.ts`:
```ts
export * from "./types";
export * from "./card-number";
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @pcg/domain test`
Expected: PASS (12 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): types and card-number parsing"
```

---

### Task 3: Grade parsing

**Files:**
- Create: `packages/domain/src/grade.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/grade.test.ts`

**Interfaces:**
- Produces:
  - `parseTierLabel(text: string): TierLabel | null`
  - `parseGradeFromText(text: string): { value: number; tierHint: "10+" | null } | null` (JP/title grade token per spec §8)
  - `normalizeGradeValue(s: string | undefined): number | null | "authentic"`
  - `GRADE_VALUES`

- [ ] **Step 1: Write the failing tests**

`packages/domain/test/grade.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseGradeFromText, parseTierLabel, normalizeGradeValue } from "../src/grade";

describe("parseGradeFromText (spec §8 JP rule 3)", () => {
  const cases: [string, number | null][] = [
    ["PCG10", 10],
    ["PCG 9.5", 9.5],
    ["PCG鑑定 10", 10],
    ["ヒバニー AR 745/742 PCG鑑定品 Gem Mint 10", 10],
    ["[PCG10/Flawless]【AR】M2a 212/193", 10],
    ["PCG Mint 9", 9],
    ["pcg graded 8.5", 8.5],
    ["084/PCG-P プロモ", null],
    ["PCGS MS65", null],
    ["PSA 10 リザードン", null],
    ["PCG 100 cards lot", null],
  ];
  for (const [t, v] of cases) it(`${t} -> ${v}`, () => expect(parseGradeFromText(t)?.value ?? null).toBe(v));

  it("records 10+ as a hint, value 10", () => {
    expect(parseGradeFromText("PCG 10+ Charizard")).toEqual({ value: 10, tierHint: "10+" });
  });
});

describe("parseTierLabel", () => {
  it("maps English, katakana and renamed labels", () => {
    expect(parseTierLabel("PCG 10 GEM MINT")).toBe("Gem Mint");
    expect(parseTierLabel("PCG PRISTINE 10")).toBe("Pristine");
    expect(parseTierLabel("Flawless 10")).toBe("Flawless");
    expect(parseTierLabel("Gold Pristine 10")).toBe("Flawless");
    expect(parseTierLabel("PCG10 フローレス")).toBe("Flawless");
    expect(parseTierLabel("ジェムミント")).toBe("Gem Mint");
    expect(parseTierLabel("PCG 9 Mint")).toBeNull();
  });
});

describe("normalizeGradeValue (eBay Grade aspect)", () => {
  it("parses numeric strings", () => {
    expect(normalizeGradeValue("10")).toBe(10);
    expect(normalizeGradeValue("9.5")).toBe(9.5);
  });
  it("maps Authentic", () => expect(normalizeGradeValue("Authentic")).toBe("authentic"));
  it("rejects junk", () => {
    expect(normalizeGradeValue("11")).toBeNull();
    expect(normalizeGradeValue(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pcg/domain test -- grade`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/domain/src/grade.ts`:
```ts
import type { TierLabel } from "./types";

export const GRADE_VALUES = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6, 5, 4, 3, 2, 1] as const;

/** Order matters: "Gold Pristine" must resolve to Flawless before "Pristine" matches. */
const TIER_PATTERNS: Array<[RegExp, TierLabel]> = [
  [/flawless|gold\s*pristine|quad\s*10|フローレス/i, "Flawless"],
  [/pristine|プリスティン/i, "Pristine"],
  [/gem\s*mint|ジェムミント/i, "Gem Mint"],
];

export function parseTierLabel(text: string): TierLabel | null {
  for (const [re, label] of TIER_PATTERNS) if (re.test(text)) return label;
  return null;
}

const GRADE_RE =
  /(?<![A-Za-z])PCG\s*(?:鑑定品?|graded)?\s*(?:gem\s*mint|pristine|flawless|mint|ジェムミント|プリスティン|フローレス)?\s*(10|9\.5|9|8\.5|8|7\.5|7|6|5|4|3|2|1)(\+)?(?![\d.])/i;

export function parseGradeFromText(text: string): { value: number; tierHint: "10+" | null } | null {
  const m = GRADE_RE.exec(text);
  if (!m) return null;
  const value = parseFloat(m[1]!);
  const tierHint = value === 10 && m[2] === "+" ? "10+" : null;
  return { value, tierHint };
}

export function normalizeGradeValue(s: string | undefined): number | null | "authentic" {
  if (!s) return null;
  const t = s.trim();
  if (/^authentic/i.test(t)) return "authentic";
  const v = parseFloat(t);
  return (GRADE_VALUES as readonly number[]).includes(v) ? v : null;
}
```

Add `export * from "./grade";` to `packages/domain/src/index.ts`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @pcg/domain test`
Expected: PASS. If `PCG 100 cards lot` fails, the `(?![\d.])` guard is missing — the regex must refuse `10` followed by `0`.

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): grade and tier parsing with PCG rename table"
```

---

### Task 4: Japanese title extraction

**Files:**
- Create: `packages/domain/src/jp-extract.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/jp-extract.test.ts`

**Interfaces:**
- Produces:
  - `detectLanguage(text: string): Language` (default `ja`)
  - `findCardNumber(text: string): ParsedNumber | null`
  - `findSetCode(text: string, codes: string[]): string | null` (returns the catalog's code string, longest match wins)
  - `isLot(text: string): boolean`
  - `hasPcgSetCodeNoise(text: string): boolean`, `hasPcgsNoise(text: string): boolean`

- [ ] **Step 1: Write the failing tests**

`packages/domain/test/jp-extract.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { detectLanguage, findCardNumber, findSetCode, isLot, hasPcgSetCodeNoise, hasPcgsNoise } from "../src/jp-extract";

describe("detectLanguage", () => {
  it("defaults to ja", () => expect(detectLanguage("リザードン ex SAR PCG10")).toBe("ja"));
  it("flips on overseas tokens", () => {
    expect(detectLanguage("ナンジャモ 海外 プロモ PCG鑑定")).toBe("en");
    expect(detectLanguage("英語版 Charizard PCG 10")).toBe("en");
    expect(detectLanguage("Pikachu EN版 PCG9.5")).toBe("en");
  });
});

describe("findCardNumber", () => {
  it("finds NNN/NNN anywhere", () => {
    expect(findCardNumber("ヒバニー AR 745/742 PCG鑑定品")).toMatchObject({ num: 745, denom: 742 });
  });
  it("finds promo suffix", () => {
    expect(findCardNumber("ピカチュウ 001/SV-P PCG10")).toMatchObject({ num: 1, suffix: "SV-P" });
    expect(findCardNumber("084/PCG-P 2005")).toMatchObject({ num: 84, suffix: "PCG-P" });
    expect(findCardNumber("ミュウ 012/DPt-P")).toMatchObject({ suffix: "DPT-P" });
  });
  it("ignores dates and fractions inside longer digit runs", () => {
    expect(findCardNumber("2023/10/05 発売 PCG10")).toBeNull();
    expect(findCardNumber("1500/3000円")).toBeNull();
  });
});

describe("findSetCode", () => {
  const codes = ["SV1a", "SV1", "S12a", "M2a", "SV-P", "OBF", "PAF"];
  it("matches whole tokens case-insensitively", () => {
    expect(findSetCode("【ポケカ デカヌチャン sv1a S PCG10】", codes)).toBe("SV1a");
    expect(findSetCode("M2a 212/193", codes)).toBe("M2a");
  });
  it("prefers the longer code when one is a prefix of another", () => {
    expect(findSetCode("sv1a 073/073", codes)).toBe("SV1a");
    expect(findSetCode("SV1 073/078", codes)).toBe("SV1");
  });
  it("does not match inside words", () => {
    expect(findSetCode("OBFUSCATED", codes)).toBeNull();
    expect(findSetCode("パフェ", codes)).toBeNull();
  });
});

describe("isLot", () => {
  it.each(["PCG10 ×3", "PCG 10 x 2", "3枚セット", "まとめ売り", "lot of 5", "bundle"])("%s", (t) =>
    expect(isLot(t)).toBe(true));
  it("does not flag bare セット", () => expect(isLot("拡張パック セット PCG10")).toBe(false));
});

describe("noise", () => {
  it("flags PCG-P and PCGS", () => {
    expect(hasPcgSetCodeNoise("084/PCG-P")).toBe(true);
    expect(hasPcgsNoise("PCGS MS65 coin")).toBe(true);
    expect(hasPcgSetCodeNoise("PCG10 鑑定品")).toBe(false);
    expect(hasPcgsNoise("PCG鑑定品")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pcg/domain test -- jp-extract`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/domain/src/jp-extract.ts`:
```ts
import type { Language } from "./types";
import type { ParsedNumber } from "./card-number";

const EN_TOKENS = /海外|英語|English|EN版/i;

export function detectLanguage(text: string): Language {
  return EN_TOKENS.test(text) ? "en" : "ja";
}

const CARD_NUMBER_RE = /(?<![\d/])(\d{1,3})\s*\/\s*(\d{1,3}|[A-Za-z]{1,4}-[Pp])(?![\d/])/;

export function findCardNumber(text: string): ParsedNumber | null {
  const m = CARD_NUMBER_RE.exec(text);
  if (!m) return null;
  const numStr = m[1]!, d = m[2]!;
  const num = parseInt(numStr, 10);
  if (/^\d+$/.test(d)) return { num, denom: parseInt(d, 10), suffix: null, printed: `${numStr}/${d}` };
  const suffix = d.toUpperCase();
  return { num, denom: null, suffix, printed: `${numStr}/${suffix}` };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-token, case-insensitive; longest code wins so "SV1a" beats "SV1". */
export function findSetCode(text: string, codes: string[]): string | null {
  const sorted = [...codes].sort((a, b) => b.length - a.length);
  for (const code of sorted) {
    const re = new RegExp(`(?<![A-Za-z0-9])${escapeRe(code)}(?![A-Za-z0-9])`, "i");
    if (re.test(text)) return code;
  }
  return null;
}

const LOT_RES = [/[x×]\s*\d/i, /\d\s*枚/, /まとめ/, /\blot\b/i, /\bbundle\b/i, /\d\s*セット/, /枚セット/];

export function isLot(text: string): boolean {
  return LOT_RES.some((re) => re.test(text));
}

export function hasPcgSetCodeNoise(text: string): boolean {
  return /PCG-P/i.test(text);
}

export function hasPcgsNoise(text: string): boolean {
  return /PCGS/i.test(text);
}
```

Add `export * from "./jp-extract";` to `index.ts`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @pcg/domain test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): Japanese title extraction (language, number, set code, lot, noise)"
```

### Task 5: Catalog index and JP matcher

**Files:**
- Create: `packages/domain/src/catalog-index.ts`, `packages/domain/src/match-jp.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/match-jp.test.ts`

**Interfaces:**
- Produces:
  - `interface SetRef { id: string; printedCode: string | null; language: Language; cardCount: number | null; nameEn: string | null; nameJa: string | null; aliases: string[] }`
  - `interface ProductRef { id: string; setId: string; numberNum: number | null; numberDenom: number | null; numberSuffix: string | null; language: Language }`
  - `interface CatalogIndex` with methods below; `class InMemoryCatalog implements CatalogIndex` (constructor `(sets: SetRef[], products: ProductRef[])`)
  - `matchJp(input: { title: string; description: string | null }, catalog: CatalogIndex): MatchResult`

- [ ] **Step 1: Write the failing tests**

`packages/domain/test/match-jp.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { InMemoryCatalog, type SetRef, type ProductRef } from "../src/catalog-index";
import { matchJp } from "../src/match-jp";

const sets: SetRef[] = [
  { id: "SV1a", printedCode: "SV1a", language: "ja", cardCount: 73, nameEn: null, nameJa: "トリプレットビート", aliases: [] },
  { id: "M2a", printedCode: "M2a", language: "ja", cardCount: 193, nameEn: null, nameJa: "MEGA Dream ex", aliases: [] },
  { id: "S12a", printedCode: "S12a", language: "ja", cardCount: 172, nameEn: null, nameJa: "VSTARユニバース", aliases: [] },
  { id: "SV-P", printedCode: "SV-P", language: "ja", cardCount: null, nameEn: null, nameJa: "SVプロモ", aliases: [] },
  { id: "sv03", printedCode: "OBF", language: "en", cardCount: 197, nameEn: "Obsidian Flames", nameJa: null, aliases: ["OBF"] },
  { id: "dupA", printedCode: "DUPA", language: "ja", cardCount: 999, nameEn: null, nameJa: "dupA", aliases: [] },
  { id: "dupB", printedCode: "DUPB", language: "ja", cardCount: 999, nameEn: null, nameJa: "dupB", aliases: [] },
];
const products: ProductRef[] = [
  { id: "SV1a-073", setId: "SV1a", numberNum: 73, numberDenom: 73, numberSuffix: null, language: "ja" },
  { id: "M2a-212", setId: "M2a", numberNum: 212, numberDenom: 193, numberSuffix: null, language: "ja" },
  { id: "S12a-201", setId: "S12a", numberNum: 201, numberDenom: 172, numberSuffix: null, language: "ja" },
  { id: "SV-P-001", setId: "SV-P", numberNum: 1, numberDenom: null, numberSuffix: "SV-P", language: "ja" },
  { id: "sv03-201", setId: "sv03", numberNum: 201, numberDenom: 197, numberSuffix: null, language: "en" },
  { id: "dupA-005", setId: "dupA", numberNum: 5, numberDenom: 999, numberSuffix: null, language: "ja" },
  { id: "dupB-005", setId: "dupB", numberNum: 5, numberDenom: 999, numberSuffix: null, language: "ja" },
];
const catalog = new InMemoryCatalog(sets, products);
const m = (title: string, description: string | null = null) => matchJp({ title, description }, catalog);

describe("matchJp — set code path", () => {
  it("matches set code + number + grade", () => {
    expect(m("《鑑定済み》[PCG10]【AR】M2a 212/193")).toMatchObject({
      state: "matched", productId: "M2a-212", gradeValue: 10, gradeLabel: null, matchMethod: "jp_set_code",
    });
  });
  it("carries the tier label on a 10", () => {
    expect(m("[PCG10/Flawless]【AR】M2a 212/193").gradeLabel).toBe("Flawless");
  });
  it("drops the tier label below 10", () => {
    expect(m("PCG 9.5 Gem Mint M2a 212/193")).toMatchObject({ gradeValue: 9.5, gradeLabel: null });
  });
  it("promo suffix satisfies the set code", () => {
    expect(m("ピカチュウ 001/SV-P PCG10")).toMatchObject({ state: "matched", productId: "SV-P-001" });
  });
});

describe("matchJp — number + denominator path", () => {
  it("resolves via unique card count", () => {
    expect(m("リザードン ex SAR 201/172 PCG鑑定 10")).toMatchObject({
      state: "matched", productId: "S12a-201", matchMethod: "jp_number_denom",
    });
  });
  it("routes shared card counts to review", () => {
    expect(m("005/999 PCG10")).toMatchObject({ state: "needs_review", reviewReason: "ambiguous_set" });
  });
  it("uses language to pick the EN set", () => {
    expect(m("海外版 Charizard 201/197 PCG 10")).toMatchObject({ state: "matched", productId: "sv03-201" });
  });
});

describe("matchJp — review routing", () => {
  it("no number", () => {
    expect(m("【ポケカ デカヌチャン sv1a S PCG10 鑑定品】")).toMatchObject({ state: "needs_review", reviewReason: "no_card_number" });
  });
  it("no grade", () => {
    expect(m("M2a 212/193 美品")).toMatchObject({ state: "needs_review", reviewReason: "no_grade" });
  });
  it("no set and no unique denominator", () => {
    expect(m("ヒバニー AR 745/742 PCG鑑定品 Gem Mint 10")).toMatchObject({ state: "needs_review", reviewReason: "no_set_code" });
  });
  it("PCG-P without a grade token", () => {
    expect(m("084/PCG-P 2005 プロモ")).toMatchObject({ state: "needs_review", reviewReason: "possible_pcg_set_code" });
  });
  it("PCG-P with a grade token is legitimate", () => {
    expect(m("084/PCG-P PCG10")).toMatchObject({ state: "needs_review", reviewReason: "no_set_code" }); // PCG-P set not in fixture catalog
    expect(m("084/PCG-P PCG10").reviewReason).not.toBe("possible_pcg_set_code");
  });
  it("PCGS noise", () => {
    expect(m("PCGS MS65 記念硬貨")).toMatchObject({ state: "needs_review", reviewReason: "possible_pcgs" });
  });
  it("lots", () => {
    expect(m("M2a 212/193 PCG10 ×3")).toMatchObject({ state: "needs_review", reviewReason: "lot" });
  });
  it("falls back to description for the number", () => {
    expect(m("デカヌチャン PCG10", "型番 SV1a 073/073")).toMatchObject({ state: "matched", productId: "SV1a-073" });
  });
  it("extracted always shows what was found", () => {
    const r = m("M2a 美品");
    expect(r.extracted).toMatchObject({ setCode: "M2a", cardNumber: null, grade: null, language: "ja" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pcg/domain test -- match-jp`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the catalog index**

`packages/domain/src/catalog-index.ts`:
```ts
import type { Language } from "./types";

export interface SetRef {
  id: string;
  printedCode: string | null;
  language: Language;
  cardCount: number | null;
  nameEn: string | null;
  nameJa: string | null;
  aliases: string[];
}

export interface ProductRef {
  id: string;
  setId: string;
  numberNum: number | null;
  numberDenom: number | null;
  numberSuffix: string | null;
  language: Language;
}

export interface CatalogIndex {
  setCodes(language: Language): string[];
  setsByCode(code: string, language: Language): SetRef[];
  setsByCardCount(count: number, language: Language): SetRef[];
  setsByNameOrAlias(name: string): SetRef[];
  productsBySetAndNumber(setId: string, num: number): ProductRef[];
  productsBySuffixAndNumber(suffix: string, num: number, language: Language): ProductRef[];
}

const norm = (s: string) => s.trim().toLowerCase();

export class InMemoryCatalog implements CatalogIndex {
  private byCode = new Map<string, SetRef[]>();
  private byCount = new Map<string, SetRef[]>();
  private byName = new Map<string, SetRef[]>();
  private bySetNum = new Map<string, ProductRef[]>();
  private bySuffixNum = new Map<string, ProductRef[]>();
  private codes: Record<Language, string[]> = { ja: [], en: [] };

  constructor(sets: SetRef[], products: ProductRef[]) {
    const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => m.set(k, [...(m.get(k) ?? []), v]);
    for (const s of sets) {
      if (s.printedCode) {
        push(this.byCode, `${s.language}:${norm(s.printedCode)}`, s);
        this.codes[s.language].push(s.printedCode);
      }
      if (s.cardCount != null) push(this.byCount, `${s.language}:${s.cardCount}`, s);
      for (const n of [s.nameEn, s.nameJa, ...s.aliases]) if (n) push(this.byName, norm(n), s);
    }
    for (const p of products) {
      if (p.numberNum == null) continue;
      push(this.bySetNum, `${p.setId}:${p.numberNum}`, p);
      if (p.numberSuffix) push(this.bySuffixNum, `${p.language}:${norm(p.numberSuffix)}:${p.numberNum}`, p);
    }
  }
  setCodes(language: Language) { return this.codes[language]; }
  setsByCode(code: string, language: Language) { return this.byCode.get(`${language}:${norm(code)}`) ?? []; }
  setsByCardCount(count: number, language: Language) { return this.byCount.get(`${language}:${count}`) ?? []; }
  setsByNameOrAlias(name: string) { return this.byName.get(norm(name)) ?? []; }
  productsBySetAndNumber(setId: string, num: number) { return this.bySetNum.get(`${setId}:${num}`) ?? []; }
  productsBySuffixAndNumber(suffix: string, num: number, language: Language) {
    return this.bySuffixNum.get(`${language}:${norm(suffix)}:${num}`) ?? [];
  }
}
```

- [ ] **Step 4: Implement matchJp**

`packages/domain/src/match-jp.ts`:
```ts
import type { MatchResult, ReviewReason } from "./types";
import type { CatalogIndex, ProductRef } from "./catalog-index";
import { detectLanguage, findCardNumber, findSetCode, isLot, hasPcgSetCodeNoise, hasPcgsNoise } from "./jp-extract";
import { parseGradeFromText, parseTierLabel } from "./grade";

const review = (reviewReason: ReviewReason, extracted: Record<string, unknown>): MatchResult => ({
  state: "needs_review", productId: null, gradeValue: null, gradeLabel: null, certId: null,
  matchMethod: null, reviewReason, extracted,
});

export function matchJp(input: { title: string; description: string | null }, catalog: CatalogIndex): MatchResult {
  const text = input.description ? `${input.title}\n${input.description}` : input.title;
  const language = detectLanguage(text);
  const grade = parseGradeFromText(input.title) ?? parseGradeFromText(text);
  const cardNumber = findCardNumber(input.title) ?? findCardNumber(text);
  const setCode = findSetCode(input.title, catalog.setCodes(language)) ?? findSetCode(text, catalog.setCodes(language));

  const extracted: Record<string, unknown> = {
    language, setCode, cardNumber: cardNumber?.printed ?? null,
    grade: grade?.value ?? null, tierHint: grade?.tierHint ?? null,
  };

  if (!grade) {
    if (hasPcgSetCodeNoise(text)) return review("possible_pcg_set_code", extracted);
    if (hasPcgsNoise(text)) return review("possible_pcgs", extracted);
    return review("no_grade", extracted);
  }
  if (isLot(text)) return review("lot", extracted);
  if (!cardNumber) return review("no_card_number", extracted);

  const gradeLabel = grade.value === 10 ? parseTierLabel(text) : null;
  const done = (p: ProductRef, matchMethod: "jp_set_code" | "jp_number_denom"): MatchResult => ({
    state: "matched", productId: p.id, gradeValue: grade.value, gradeLabel, certId: null,
    matchMethod, reviewReason: null, extracted,
  });

  // Path 1: promo suffix or explicit set code
  if (cardNumber.suffix) {
    const ps = catalog.productsBySuffixAndNumber(cardNumber.suffix, cardNumber.num, language);
    if (ps.length === 1) return done(ps[0]!, "jp_set_code");
    return review(ps.length === 0 ? "no_set_code" : "ambiguous_set", extracted);
  }
  if (setCode) {
    const sets = catalog.setsByCode(setCode, language);
    const ps = sets.flatMap((s) => catalog.productsBySetAndNumber(s.id, cardNumber.num));
    if (ps.length === 1) return done(ps[0]!, "jp_set_code");
    return review(ps.length === 0 ? "no_card_number" : "ambiguous_set", extracted);
  }

  // Path 2: number + denominator (denominator = set card count)
  if (cardNumber.denom != null) {
    const sets = catalog.setsByCardCount(cardNumber.denom, language);
    const ps = sets.flatMap((s) => catalog.productsBySetAndNumber(s.id, cardNumber.num));
    if (ps.length === 1) return done(ps[0]!, "jp_number_denom");
    if (ps.length > 1) return review("ambiguous_set", extracted);
  }
  return review("no_set_code", extracted);
}
```

Add to `index.ts`: `export * from "./catalog-index"; export * from "./match-jp";`

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @pcg/domain test`
Expected: PASS. Note the `"no_set_code"` expectation for `084/PCG-P PCG10`: the fixture catalog has no `PCG-P` set, so the suffix path yields zero products.

- [ ] **Step 6: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): catalog index and Japanese matcher (set code + number/denominator paths)"
```

---

### Task 6: eBay metadata matcher and dispatch

**Files:**
- Create: `packages/domain/src/match-ebay.ts`, `packages/domain/src/matcher.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/match-ebay.test.ts`

**Interfaces:**
- Produces:
  - `matchEbay(input: { title: string; metadata: EbayMetadata; cert: CertRecord | null }, catalog: CatalogIndex): MatchResult`
  - `MATCHER_VERSION = "1"`
  - `matchListing(input: { source: Source; title: string; description: string | null; metadata: EbayMetadata | Record<string, never>; cert: CertRecord | null }, catalog: CatalogIndex): MatchResult`

- [ ] **Step 1: Write the failing tests**

`packages/domain/test/match-ebay.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { InMemoryCatalog, type SetRef, type ProductRef } from "../src/catalog-index";
import { matchEbay } from "../src/match-ebay";
import { matchListing, MATCHER_VERSION } from "../src/matcher";

const sets: SetRef[] = [
  { id: "sv03", printedCode: "OBF", language: "en", cardCount: 197, nameEn: "Obsidian Flames", nameJa: null, aliases: ["OBF"] },
  { id: "SV1a", printedCode: "SV1a", language: "ja", cardCount: 73, nameEn: null, nameJa: "トリプレットビート", aliases: ["Triplet Beat"] },
  { id: "sv3pt5", printedCode: "MEW", language: "en", cardCount: 165, nameEn: "151", nameJa: null, aliases: [] },
  { id: "SV2a", printedCode: "SV2a", language: "ja", cardCount: 165, nameEn: null, nameJa: "ポケモンカード151", aliases: ["151"] },
];
const products: ProductRef[] = [
  { id: "sv03-201", setId: "sv03", numberNum: 201, numberDenom: 197, numberSuffix: null, language: "en" },
  { id: "SV1a-073", setId: "SV1a", numberNum: 73, numberDenom: 73, numberSuffix: null, language: "ja" },
  { id: "sv3pt5-006", setId: "sv3pt5", numberNum: 6, numberDenom: 165, numberSuffix: null, language: "en" },
  { id: "SV2a-006", setId: "SV2a", numberNum: 6, numberDenom: 165, numberSuffix: null, language: "ja" },
];
const catalog = new InMemoryCatalog(sets, products);
const PCG = "Premier Card Grading (PCG)";

describe("matchEbay", () => {
  it("matches on grader + set + number", () => {
    const r = matchEbay({ title: "Charizard ex 201/197 PCG 10 GEM MINT", metadata: { grader: PCG, grade: "10", set: "Obsidian Flames", cardNumber: "201/197" }, cert: null }, catalog);
    expect(r).toMatchObject({ state: "matched", productId: "sv03-201", gradeValue: 10, gradeLabel: "Gem Mint", matchMethod: "ebay_metadata" });
  });
  it("accepts numerator-only card number once set resolves", () => {
    const r = matchEbay({ title: "x", metadata: { grader: PCG, grade: "9", set: "OBF", cardNumber: "201" }, cert: null }, catalog);
    expect(r).toMatchObject({ state: "matched", productId: "sv03-201", gradeValue: 9, gradeLabel: null });
  });
  it("uses Language to split an alias present in both languages", () => {
    const en = matchEbay({ title: "x", metadata: { grader: PCG, grade: "10", set: "151", cardNumber: "6", language: "English" }, cert: null }, catalog);
    const ja = matchEbay({ title: "x", metadata: { grader: PCG, grade: "10", set: "151", cardNumber: "6", language: "Japanese" }, cert: null }, catalog);
    expect(en.productId).toBe("sv3pt5-006");
    expect(ja.productId).toBe("SV2a-006");
  });
  it("routes alias collision without Language to ambiguous_set", () => {
    expect(matchEbay({ title: "x", metadata: { grader: PCG, grade: "10", set: "151", cardNumber: "6" }, cert: null }, catalog))
      .toMatchObject({ state: "needs_review", reviewReason: "ambiguous_set" });
  });
  it("rejects a named other grader", () => {
    expect(matchEbay({ title: "PCG 10 (NOT PSA)", metadata: { grader: "PSA", grade: "10" }, cert: null }, catalog))
      .toMatchObject({ state: "rejected", reviewReason: "grader_not_pcg" });
  });
  it("queues Other / missing grader", () => {
    expect(matchEbay({ title: "PCG 10", metadata: { grader: "Other", grade: "10", set: "OBF", cardNumber: "201" }, cert: null }, catalog))
      .toMatchObject({ state: "needs_review", reviewReason: "grader_missing" });
    expect(matchEbay({ title: "PCG 10", metadata: { grade: "10" }, cert: null }, catalog).reviewReason).toBe("grader_missing");
  });
  it("handles Authentic", () => {
    expect(matchEbay({ title: "x", metadata: { grader: PCG, grade: "Authentic", set: "OBF", cardNumber: "201" }, cert: null }, catalog))
      .toMatchObject({ state: "matched", gradeValue: null, gradeLabel: "Authentic" });
  });
  it("records 10+ hint without setting a label", () => {
    const r = matchEbay({ title: "Charizard PCG 10+", metadata: { grader: PCG, grade: "10", set: "OBF", cardNumber: "201" }, cert: null }, catalog);
    expect(r.gradeLabel).toBeNull();
    expect(r.extracted.tierHint).toBe("10+");
  });
  it("cert record overrides grade, label, number and set", () => {
    const cert = { gradedId: "000009973", setName: "Triplet Beat", cardNumber: "073/073", language: "Japanese", finalGrade: 10, grade: "Pristine" };
    const r = matchEbay({ title: "x", metadata: { grader: PCG, grade: "9", certNumber: "9973" }, cert }, catalog);
    expect(r).toMatchObject({ state: "matched", productId: "SV1a-073", gradeValue: 10, gradeLabel: "Pristine", certId: "000009973", matchMethod: "cert" });
  });
  it("missing metadata → no_metadata", () => {
    expect(matchEbay({ title: "PCG 10 Charizard", metadata: {}, cert: null }, catalog)).toMatchObject({ state: "needs_review", reviewReason: "no_metadata" });
  });
});

describe("matchListing dispatch", () => {
  it("routes by source", () => {
    expect(MATCHER_VERSION).toBe("1");
    const jp = matchListing({ source: "yahoo_auc", title: "SV1a 073/073 PCG10", description: null, metadata: {}, cert: null }, catalog);
    expect(jp.matchMethod).toBe("jp_set_code");
    const eb = matchListing({ source: "thecardapi", title: "x", description: null, metadata: { grader: PCG, grade: "10", set: "OBF", cardNumber: "201" }, cert: null }, catalog);
    expect(eb.matchMethod).toBe("ebay_metadata");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pcg/domain test -- match-ebay`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`packages/domain/src/match-ebay.ts`:
```ts
import type { CertRecord, EbayMetadata, Language, MatchResult, ReviewReason, TierLabel } from "./types";
import type { CatalogIndex, SetRef } from "./catalog-index";
import { parseCardNumber } from "./card-number";
import { normalizeGradeValue, parseTierLabel } from "./grade";

export const PCG_GRADER = "Premier Card Grading (PCG)";
const NAMED_OTHER_GRADERS = /^(psa|bgs|beckett|cgc|sgc|tag|ace|ags|hga|gma|ksa|mnt|arS|bvg|csg|rcg|isa)\b/i;

const review = (reviewReason: ReviewReason, extracted: Record<string, unknown>, state: "needs_review" | "rejected" = "needs_review"): MatchResult => ({
  state, productId: null, gradeValue: null, gradeLabel: null, certId: null, matchMethod: null, reviewReason, extracted,
});

function langFromAspect(s: string | undefined): Language | null {
  if (!s) return null;
  if (/japanese|日本/i.test(s)) return "ja";
  if (/english/i.test(s)) return "en";
  return null;
}

function resolveSet(catalog: CatalogIndex, setName: string, language: Language | null): SetRef[] {
  let sets = catalog.setsByNameOrAlias(setName);
  if (sets.length === 0) for (const lang of ["ja", "en"] as const) sets = sets.concat(catalog.setsByCode(setName, lang));
  if (sets.length > 1 && language) sets = sets.filter((s) => s.language === language);
  return sets;
}

export function matchEbay(
  input: { title: string; metadata: EbayMetadata; cert: CertRecord | null },
  catalog: CatalogIndex,
): MatchResult {
  const md = input.metadata;
  const tierHint = /\b10\+/.test(input.title) ? "10+" : null;
  const extracted: Record<string, unknown> = { ...md, tierHint, certRaw: md.certNumber ?? null };

  if (Object.keys(md).length === 0) return review("no_metadata", extracted);

  const grader = md.grader?.trim() ?? "";
  if (grader !== PCG_GRADER) {
    if (grader && NAMED_OTHER_GRADERS.test(grader)) return review("grader_not_pcg", extracted, "rejected");
    return review("grader_missing", extracted);
  }

  // Cert path
  if (input.cert) {
    const c = input.cert;
    const lang = langFromAspect(c.language);
    const sets = resolveSet(catalog, c.setName, lang);
    const num = parseCardNumber(c.cardNumber);
    if (sets.length === 1 && num) {
      const ps = catalog.productsBySetAndNumber(sets[0]!.id, num.num);
      if (ps.length === 1) {
        const gradeValue = c.finalGrade;
        const label = gradeValue === 10 ? (parseTierLabel(c.grade) as TierLabel | null) : null;
        return { state: "matched", productId: ps[0]!.id, gradeValue, gradeLabel: gradeValue == null ? "Authentic" : label, certId: c.gradedId, matchMethod: "cert", reviewReason: null, extracted: { ...extracted, cert: c } };
      }
    }
    return review("ambiguous_set", { ...extracted, cert: c });
  }

  const g = normalizeGradeValue(md.grade);
  if (g === null) return review("no_grade", extracted);
  if (!md.set) return review("ambiguous_set", extracted);
  if (!md.cardNumber) return review("no_card_number", extracted);

  const sets = resolveSet(catalog, md.set, langFromAspect(md.language));
  if (sets.length !== 1) return review("ambiguous_set", extracted);
  const num = parseCardNumber(md.cardNumber);
  if (!num) return review("no_card_number", extracted);
  const ps = catalog.productsBySetAndNumber(sets[0]!.id, num.num);
  if (ps.length !== 1) return review(ps.length === 0 ? "no_card_number" : "ambiguous_set", extracted);

  const gradeValue = g === "authentic" ? null : g;
  const gradeLabel = g === "authentic" ? "Authentic" : gradeValue === 10 ? parseTierLabel(input.title) : null;
  return { state: "matched", productId: ps[0]!.id, gradeValue, gradeLabel, certId: null, matchMethod: "ebay_metadata", reviewReason: null, extracted };
}
```

`packages/domain/src/matcher.ts`:
```ts
import type { CertRecord, EbayMetadata, MatchResult, Source } from "./types";
import type { CatalogIndex } from "./catalog-index";
import { matchEbay } from "./match-ebay";
import { matchJp } from "./match-jp";

/** Bump when any rule changes; the match job re-runs every non-override row on a bump. */
export const MATCHER_VERSION = "1";

export function matchListing(
  input: { source: Source; title: string; description: string | null; metadata: EbayMetadata | Record<string, never>; cert: CertRecord | null },
  catalog: CatalogIndex,
): MatchResult {
  if (input.source === "thecardapi") return matchEbay({ title: input.title, metadata: input.metadata as EbayMetadata, cert: input.cert }, catalog);
  return matchJp({ title: input.title, description: input.description }, catalog);
}
```

Add to `index.ts`: `export * from "./match-ebay"; export * from "./matcher";`

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @pcg/domain test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): eBay metadata matcher, cert override, source dispatch"
```

---

### Task 7: Pricing

**Files:**
- Create: `packages/domain/src/pricing.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/pricing.test.ts`

**Interfaces:**
- Produces:
  - `type Window = "30d" | "90d" | "180d" | "all"`; `WINDOW_DAYS: Record<Window, number | null>`
  - `interface Sale { productId: string; gradeValue: number; gradeLabel: TierLabel | null; priceUsd: number; soldAt: Date }`
  - `interface PricePoint { productId: string; gradeValue: number; gradeLabel: TierLabel | "any"; window: Window; nSales: number; medianUsd: number; minUsd: number; maxUsd: number; lastSoldAt: Date; confidence: "high" | "med" | "low" }`
  - `median(xs: number[]): number`; `confidence(n: number, min: number, max: number)`; `computePricePoints(sales: Sale[], now: Date): PricePoint[]`

- [ ] **Step 1: Write the failing tests**

`packages/domain/test/pricing.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { median, confidence, computePricePoints, type Sale } from "../src/pricing";

const now = new Date("2026-09-06T00:00:00Z");
const d = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000);
const s = (p: Partial<Sale> & { priceUsd: number; daysAgo: number }): Sale => ({
  productId: "P", gradeValue: 10, gradeLabel: null, soldAt: d(p.daysAgo), ...p,
});

describe("median", () => {
  it("odd", () => expect(median([3, 1, 2])).toBe(2));
  it("even → mean of middle two", () => expect(median([1, 2, 3, 10])).toBe(2.5));
});

describe("confidence", () => {
  it("high needs ≥5 and spread <2", () => expect(confidence(5, 100, 199)).toBe("high"));
  it("≥5 with spread ≥2 is med", () => expect(confidence(5, 100, 200)).toBe("med"));
  it("2–4 is med", () => expect(confidence(2, 1, 1000)).toBe("med"));
  it("1 is low", () => expect(confidence(1, 50, 50)).toBe("low"));
});

describe("computePricePoints", () => {
  it("pools all 10s into 'any' and slices tiers", () => {
    const sales = [
      s({ priceUsd: 100, daysAgo: 1, gradeLabel: "Gem Mint" }),
      s({ priceUsd: 120, daysAgo: 2, gradeLabel: "Gem Mint" }),
      s({ priceUsd: 300, daysAgo: 3, gradeLabel: "Pristine" }),
      s({ priceUsd: 110, daysAgo: 4, gradeLabel: null }),
    ];
    const pts = computePricePoints(sales, now);
    const any90 = pts.find((p) => p.gradeLabel === "any" && p.window === "90d")!;
    expect(any90).toMatchObject({ nSales: 4, medianUsd: 115, minUsd: 100, maxUsd: 300, confidence: "med" });
    const gem90 = pts.find((p) => p.gradeLabel === "Gem Mint" && p.window === "90d")!;
    expect(gem90).toMatchObject({ nSales: 2, medianUsd: 110 });
    const pristine90 = pts.find((p) => p.gradeLabel === "Pristine" && p.window === "90d")!;
    expect(pristine90.nSales).toBe(1); // tier row exists; the UI hides tiers under 2 sales
  });
  it("only grade 10 gets tier rows", () => {
    const pts = computePricePoints([s({ priceUsd: 50, daysAgo: 1, gradeValue: 9.5, gradeLabel: null })], now);
    expect(pts.every((p) => p.gradeLabel === "any")).toBe(true);
    expect(pts.map((p) => p.window).sort()).toEqual(["180d", "30d", "90d", "all"]);
  });
  it("respects windows", () => {
    const pts = computePricePoints([s({ priceUsd: 10, daysAgo: 45 }), s({ priceUsd: 20, daysAgo: 5 })], now);
    expect(pts.find((p) => p.window === "30d")!.nSales).toBe(1);
    expect(pts.find((p) => p.window === "90d")!.nSales).toBe(2);
  });
  it("emits no row for empty buckets", () => {
    expect(computePricePoints([], now)).toEqual([]);
  });
  it("last_sold_at is the newest sale in the bucket", () => {
    const pts = computePricePoints([s({ priceUsd: 10, daysAgo: 9 }), s({ priceUsd: 20, daysAgo: 2 })], now);
    expect(pts.find((p) => p.window === "all")!.lastSoldAt).toEqual(d(2));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pcg/domain test -- pricing`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/domain/src/pricing.ts`:
```ts
import type { TierLabel } from "./types";

export type Window = "30d" | "90d" | "180d" | "all";
export const WINDOW_DAYS: Record<Window, number | null> = { "30d": 30, "90d": 90, "180d": 180, all: null };
export const TIERS: TierLabel[] = ["Flawless", "Pristine", "Gem Mint"];

export interface Sale {
  productId: string;
  gradeValue: number;
  gradeLabel: TierLabel | null;
  priceUsd: number;
  soldAt: Date;
}

export interface PricePoint {
  productId: string;
  gradeValue: number;
  gradeLabel: TierLabel | "any";
  window: Window;
  nSales: number;
  medianUsd: number;
  minUsd: number;
  maxUsd: number;
  lastSoldAt: Date;
  confidence: "high" | "med" | "low";
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function confidence(n: number, min: number, max: number): "high" | "med" | "low" {
  if (n <= 1) return "low";
  if (n >= 5 && max / min < 2) return "high";
  return "med";
}

function point(sales: Sale[], gradeLabel: TierLabel | "any", window: Window): PricePoint | null {
  if (sales.length === 0) return null;
  const prices = sales.map((s) => s.priceUsd);
  const min = Math.min(...prices), max = Math.max(...prices);
  const first = sales[0]!;
  return {
    productId: first.productId, gradeValue: first.gradeValue, gradeLabel, window,
    nSales: sales.length, medianUsd: median(prices), minUsd: min, maxUsd: max,
    lastSoldAt: new Date(Math.max(...sales.map((s) => s.soldAt.getTime()))),
    confidence: confidence(sales.length, min, max),
  };
}

export function computePricePoints(sales: Sale[], now: Date): PricePoint[] {
  const groups = new Map<string, Sale[]>();
  for (const s of sales) {
    const k = `${s.productId}|${s.gradeValue}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const out: PricePoint[] = [];
  for (const group of groups.values()) {
    for (const window of Object.keys(WINDOW_DAYS) as Window[]) {
      const days = WINDOW_DAYS[window];
      const inWin = days == null ? group : group.filter((s) => now.getTime() - s.soldAt.getTime() <= days * 86400000);
      const any = point(inWin, "any", window);
      if (any) out.push(any);
      if (group[0]!.gradeValue === 10) {
        for (const tier of TIERS) {
          const p = point(inWin.filter((s) => s.gradeLabel === tier), tier, window);
          if (p) out.push(p);
        }
      }
    }
  }
  return out;
}
```

Add `export * from "./pricing";` to `index.ts`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @pcg/domain test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): median pricing with pooled/tiered grade-10 points and confidence"
```

---

## Phase 3 — Database

### Task 8: Schema migrations

**Files:**
- Create: `packages/db/migrations/0001_init.sql`, `packages/db/migrations/0002_search.sql`, `packages/db/migrations/0003_public_views.sql`, `packages/db/README.md`

**Interfaces:**
- Produces: tables `sets`, `products`, `raw_listings`, `listing_matches`, `price_points`, `fx_rates`, `connector_state`, `ingest_runs`, `admin_users`; functions `search_products_by_number`, `search_products_by_name`; views `public_sales`, `product_sale_counts`.

- [ ] **Step 1: Write 0001_init.sql**

```sql
create extension if not exists pg_trgm;
create extension if not exists unaccent;

create table sets (
  id            text primary key,
  printed_code  text,
  language      text not null check (language in ('ja','en')),
  name_en       text,
  name_ja       text,
  release_date  date,
  card_count    int,
  aliases       text[] not null default '{}'
);
create index sets_language_card_count_idx on sets (language, card_count);

create table products (
  id             text primary key,
  set_id         text not null references sets(id),
  number_printed text not null,
  number_num     int,
  number_denom   int,
  number_suffix  text,
  name_en        text,
  name_ja        text,
  rarity         text,
  language       text not null check (language in ('ja','en')),
  image_url      text
);
create index products_num_denom_idx on products (number_num, number_denom);
create index products_num_suffix_idx on products (number_num, number_suffix);
create index products_set_num_idx on products (set_id, number_num);
create index products_name_en_trgm on products using gin (name_en gin_trgm_ops);
create index products_name_ja_trgm on products using gin (name_ja gin_trgm_ops);

create table raw_listings (
  id               uuid primary key default gen_random_uuid(),
  source           text not null,
  source_item_id   text not null,
  url              text not null,
  title            text not null,
  description      text,
  price            numeric not null,
  currency         text not null,
  kind             text not null check (kind in ('sold','ended','active')),
  sold_at          timestamptz,
  listed_at        timestamptz,
  ended_at         timestamptz,
  is_best_offer    boolean not null default false,
  seller_country   text,
  external_item_id text,
  image_urls       text[] not null default '{}',
  metadata         jsonb not null default '{}'::jsonb,
  raw              jsonb not null,
  fetched_at       timestamptz not null default now(),
  unique (source, source_item_id)
);
create index raw_listings_kind_sold_at_idx on raw_listings (kind, sold_at desc);

create table listing_matches (
  raw_listing_id  uuid primary key references raw_listings(id) on delete cascade,
  state           text not null check (state in ('matched','needs_review','rejected')),
  product_id      text references products(id),
  grade_value     numeric,
  grade_label     text,
  cert_id         text,
  match_method    text,
  review_reason   text,
  extracted       jsonb not null default '{}'::jsonb,
  is_override     boolean not null default false,
  matcher_version text not null,
  resolved_by     text,
  resolved_at     timestamptz,
  updated_at      timestamptz not null default now()
);
create index listing_matches_state_idx on listing_matches (state);
create index listing_matches_product_grade_idx on listing_matches (product_id, grade_value) where state = 'matched';

create table price_points (
  product_id   text not null references products(id),
  grade_value  numeric not null,
  grade_label  text not null,
  "window"     text not null check ("window" in ('30d','90d','180d','all')),
  n_sales      int not null,
  median_usd   numeric not null,
  min_usd      numeric not null,
  max_usd      numeric not null,
  last_sold_at timestamptz not null,
  confidence   text not null check (confidence in ('high','med','low')),
  computed_at  timestamptz not null default now(),
  primary key (product_id, grade_value, grade_label, "window")
);

create table fx_rates (
  date  date not null,
  base  text not null,
  quote text not null default 'USD',
  rate  numeric not null,
  primary key (date, base, quote)
);

create table connector_state (
  connector  text primary key,
  cursor     jsonb,
  updated_at timestamptz not null default now()
);

create table ingest_runs (
  id            uuid primary key default gen_random_uuid(),
  job           text not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null check (status in ('running','ok','failed','suspect')),
  items_seen    int not null default 0,
  items_new     int not null default 0,
  items_updated int not null default 0,
  errors        jsonb not null default '[]'::jsonb
);
create index ingest_runs_job_started_idx on ingest_runs (job, started_at desc);

create table admin_users (
  email text primary key
);

-- Lock everything down; public read access is granted per-object in 0003.
alter table sets enable row level security;
alter table products enable row level security;
alter table raw_listings enable row level security;
alter table listing_matches enable row level security;
alter table price_points enable row level security;
alter table fx_rates enable row level security;
alter table connector_state enable row level security;
alter table ingest_runs enable row level security;
alter table admin_users enable row level security;
```

- [ ] **Step 2: Write 0002_search.sql**

```sql
-- Sales count per product (matched, sold, priced) for ranking search results.
create view product_sale_counts as
select lm.product_id, count(*)::int as sale_count
from listing_matches lm
join raw_listings rl on rl.id = lm.raw_listing_id
where lm.state = 'matched' and rl.kind = 'sold' and rl.is_best_offer = false and rl.price > 0
group by lm.product_id;

create or replace function search_products_by_number(p_num int, p_denom int, p_suffix text, lim int default 30)
returns table (id text, sale_count int)
language sql stable as $$
  select p.id, coalesce(c.sale_count, 0)
  from products p
  left join product_sale_counts c on c.product_id = p.id
  join sets s on s.id = p.set_id
  where p.number_num = p_num
    and (p_denom is null or p.number_denom = p_denom)
    and (p_suffix is null or upper(p.number_suffix) = upper(p_suffix))
  order by coalesce(c.sale_count, 0) desc, s.release_date desc nulls last
  limit lim;
$$;

create or replace function search_products_by_name(q text, lim int default 30)
returns table (id text, sale_count int, score real)
language sql stable as $$
  select p.id, coalesce(c.sale_count, 0),
         greatest(similarity(unaccent(coalesce(p.name_en, '')), unaccent(q)), similarity(coalesce(p.name_ja, ''), q)) as score
  from products p
  left join product_sale_counts c on c.product_id = p.id
  where unaccent(coalesce(p.name_en, '')) % unaccent(q) or coalesce(p.name_ja, '') % q
  order by score desc, coalesce(c.sale_count, 0) desc
  limit lim;
$$;
```

- [ ] **Step 3: Write 0003_public_views.sql**

```sql
-- Anonymous readers get catalog, price points, and a sales view without description/raw/metadata.
create policy public_read_sets on sets for select to anon, authenticated using (true);
create policy public_read_products on products for select to anon, authenticated using (true);
create policy public_read_price_points on price_points for select to anon, authenticated using (true);
create policy public_read_fx on fx_rates for select to anon, authenticated using (true);

create view public_sales as
select rl.id, lm.product_id, lm.grade_value, lm.grade_label, rl.price, rl.currency, rl.sold_at, rl.source, rl.url, rl.is_best_offer,
       (rl.price * fx.rate)::numeric(12,2) as price_usd
from listing_matches lm
join raw_listings rl on rl.id = lm.raw_listing_id
left join lateral (
  select rate from fx_rates f
  where f.base = rl.currency and f.quote = 'USD' and f.date <= coalesce(rl.sold_at, now())::date
  order by f.date desc limit 1
) fx on true
where lm.state = 'matched' and rl.kind = 'sold';

grant select on public_sales to anon, authenticated;
grant select on product_sale_counts to anon, authenticated;
grant execute on function search_products_by_number(int, int, text, int) to anon, authenticated;
grant execute on function search_products_by_name(text, int) to anon, authenticated;
```

Note: `price_usd` for USD rows relies on a `USD→USD` rate of 1 — Task 14's fx job inserts that identity row daily.

- [ ] **Step 4: README with apply instructions**

`packages/db/README.md`:
```markdown
# @pcg/db

Migrations are plain SQL, applied in order with psql against the Supabase connection string:

    for f in packages/db/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done

`DATABASE_URL` is the Supabase project's direct Postgres URL (Project Settings → Database → Connection string, "URI", with your password).
Migrations are not idempotent; apply each exactly once. Add new files as `NNNN_name.sql`.
```

- [ ] **Step 5: Apply to the dev Supabase project and verify**

Run:
```bash
for f in packages/db/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
psql "$DATABASE_URL" -c "\dt" -c "select proname from pg_proc where proname like 'search_products%';"
```
Expected: 9 tables listed; both functions present.

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat(db): initial schema, search functions, public views and RLS"
```

---

### Task 9: DB client and repositories

**Files:**
- Create: `packages/db/src/index.ts`, `packages/db/src/client.ts`, `packages/db/src/strip-seller.ts`, `packages/db/src/repo/catalog.ts`, `packages/db/src/repo/listings.ts`, `packages/db/src/repo/matches.ts`, `packages/db/src/repo/prices.ts`, `packages/db/src/repo/runs.ts`, `packages/db/src/repo/state.ts`, `packages/db/src/repo/fx.ts`
- Test: `packages/db/test/strip-seller.test.ts` (add `vitest.config.ts` + `"test": "vitest run"` to `packages/db/package.json`)

**Interfaces:**
- Produces (all take a `SupabaseClient` as first arg):
  - `createServiceClient(): SupabaseClient` (env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
  - `stripSellerFields(raw: unknown): unknown`
  - `upsertSets(db, rows: SetRow[])`, `upsertProducts(db, rows: ProductRow[])`, `loadCatalog(db): Promise<InMemoryCatalog>`
  - `upsertRawListings(db, listings: RawListing[]): Promise<{ inserted: number; updated: number }>`
  - `loadListingsToMatch(db, opts: { all: boolean }): Promise<ListingToMatch[]>`, `upsertMatches(db, rows: MatchRow[])`
  - `loadMatchedSales(db): Promise<Sale[]>`, `replacePricePoints(db, points: PricePoint[])`
  - `startRun(db, job): Promise<string>`, `finishRun(db, id, patch)`
  - `getCursor(db, connector)`, `setCursor(db, connector, cursor)`
  - `upsertFxRates(db, rows)`

- [ ] **Step 1: Failing test for seller stripping**

`packages/db/test/strip-seller.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { stripSellerFields } from "../src/strip-seller";

describe("stripSellerFields", () => {
  it("removes seller identity keys at any depth, keeps country", () => {
    const raw = {
      itemId: "1", seller: { username: "bob", feedbackScore: 10, sellerCountry: "US" },
      sellerId: "x", seller_name: "bob", contact: { email: "a@b" }, nested: { sellerUsername: "bob", ok: 1 },
    };
    expect(stripSellerFields(raw)).toEqual({ itemId: "1", seller: { sellerCountry: "US" }, nested: { ok: 1 } });
  });
  it("passes primitives and arrays through", () => {
    expect(stripSellerFields([{ seller_id: 1, a: 2 }])).toEqual([{ a: 2 }]);
    expect(stripSellerFields("x")).toBe("x");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pcg/db test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/db/src/strip-seller.ts`:
```ts
const DROP_KEY = /^(seller(_?id|_?name|_?username|_?user|_?login|_?info|_?feedback|_?rating|_?email|_?phone)?|username|user_?id|feedback(_?score)?|contact(_?email)?|email|phone)$/i;
const KEEP_KEY = /^seller_?country$/i;

export function stripSellerFields(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw.map(stripSellerFields);
  if (raw && typeof raw === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (KEEP_KEY.test(k)) { out[k] = v; continue; }
      if (DROP_KEY.test(k) && (typeof v !== "object" || v === null)) continue;
      if (DROP_KEY.test(k) && typeof v === "object") {
        const inner = stripSellerFields(v) as Record<string, unknown>;
        if (Object.keys(inner).length) out[k] = inner;
        continue;
      }
      out[k] = stripSellerFields(v);
    }
    return out;
  }
  return raw;
}
```

`packages/db/src/client.ts`:
```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Db = SupabaseClient;

export function createServiceClient(): Db {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
```

`packages/db/src/repo/catalog.ts`:
```ts
import type { Db } from "../client";
import { must } from "../client";
import { InMemoryCatalog, type Language, type SetRef, type ProductRef } from "@pcg/domain";

export interface SetRow { id: string; printed_code: string | null; language: Language; name_en: string | null; name_ja: string | null; release_date: string | null; card_count: number | null; aliases: string[] }
export interface ProductRow { id: string; set_id: string; number_printed: string; number_num: number | null; number_denom: number | null; number_suffix: string | null; name_en: string | null; name_ja: string | null; rarity: string | null; language: Language; image_url: string | null }

const CHUNK = 500;
async function chunked<T>(rows: T[], fn: (c: T[]) => Promise<void>) {
  for (let i = 0; i < rows.length; i += CHUNK) await fn(rows.slice(i, i + CHUNK));
}

export async function upsertSets(db: Db, rows: SetRow[]) {
  await chunked(rows, async (c) => { must(await db.from("sets").upsert(c, { onConflict: "id" })); });
}
export async function upsertProducts(db: Db, rows: ProductRow[]) {
  await chunked(rows, async (c) => { must(await db.from("products").upsert(c, { onConflict: "id" })); });
}

export async function loadCatalog(db: Db): Promise<InMemoryCatalog> {
  const sets = must(await db.from("sets").select("*")) as SetRow[];
  const products: ProductRow[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must(await db.from("products").select("id,set_id,number_num,number_denom,number_suffix,language").range(from, from + 999)) as ProductRow[];
    products.push(...page);
    if (page.length < 1000) break;
  }
  const setRefs: SetRef[] = sets.map((s) => ({ id: s.id, printedCode: s.printed_code, language: s.language, cardCount: s.card_count, nameEn: s.name_en, nameJa: s.name_ja, aliases: s.aliases ?? [] }));
  const productRefs: ProductRef[] = products.map((p) => ({ id: p.id, setId: p.set_id, numberNum: p.number_num, numberDenom: p.number_denom, numberSuffix: p.number_suffix, language: p.language }));
  return new InMemoryCatalog(setRefs, productRefs);
}
```

`packages/db/src/repo/listings.ts`:
```ts
import type { Db } from "../client";
import { must } from "../client";
import type { RawListing } from "@pcg/domain";
import { stripSellerFields } from "../strip-seller";

export async function upsertRawListings(db: Db, listings: RawListing[]): Promise<{ inserted: number; updated: number }> {
  if (listings.length === 0) return { inserted: 0, updated: 0 };
  const keys = listings.map((l) => l.sourceItemId);
  const existing = must(await db.from("raw_listings").select("source,source_item_id").eq("source", listings[0]!.source).in("source_item_id", keys)) as { source_item_id: string }[];
  const existingIds = new Set(existing.map((e) => e.source_item_id));
  const rows = listings.map((l) => ({
    source: l.source, source_item_id: l.sourceItemId, url: l.url, title: l.title, description: l.description,
    price: l.price, currency: l.currency, kind: l.kind, sold_at: l.soldAt, ended_at: l.endedAt,
    is_best_offer: l.isBestOffer, seller_country: l.sellerCountry, external_item_id: l.externalItemId,
    image_urls: l.imageUrls, metadata: l.metadata, raw: stripSellerFields(l.raw), fetched_at: new Date().toISOString(),
  }));
  // Existing rows: only kind/sold_at/ended_at/fetched_at may change (spec §5).
  const fresh = rows.filter((r) => !existingIds.has(r.source_item_id));
  const stale = rows.filter((r) => existingIds.has(r.source_item_id));
  if (fresh.length) must(await db.from("raw_listings").insert(fresh));
  for (const r of stale) {
    must(await db.from("raw_listings").update({ kind: r.kind, sold_at: r.sold_at, ended_at: r.ended_at, fetched_at: r.fetched_at })
      .eq("source", r.source).eq("source_item_id", r.source_item_id));
  }
  return { inserted: fresh.length, updated: stale.length };
}
```

`packages/db/src/repo/matches.ts`:
```ts
import type { Db } from "../client";
import { must } from "../client";
import type { EbayMetadata, MatchResult, Source } from "@pcg/domain";

export interface ListingToMatch { id: string; source: Source; title: string; description: string | null; metadata: EbayMetadata | Record<string, never> }
export interface MatchRow extends MatchResult { rawListingId: string; matcherVersion: string }

export async function loadListingsToMatch(db: Db, opts: { all: boolean }): Promise<ListingToMatch[]> {
  const base = db.from("raw_listings").select("id,source,title,description,metadata,listing_matches(state,is_override)");
  const rows = must(await base) as Array<ListingToMatch & { listing_matches: { state: string; is_override: boolean }[] | null }>;
  return rows.filter((r) => {
    const m = r.listing_matches?.[0];
    if (!m) return true;
    if (m.is_override) return false;
    return opts.all ? true : m.state === "needs_review";
  }).map(({ listing_matches: _lm, ...r }) => r);
}

export async function upsertMatches(db: Db, rows: MatchRow[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({
      raw_listing_id: r.rawListingId, state: r.state, product_id: r.productId, grade_value: r.gradeValue,
      grade_label: r.gradeLabel, cert_id: r.certId, match_method: r.matchMethod, review_reason: r.reviewReason,
      extracted: r.extracted, is_override: false, matcher_version: r.matcherVersion, updated_at: new Date().toISOString(),
    }));
    must(await db.from("listing_matches").upsert(chunk, { onConflict: "raw_listing_id" }));
  }
}
```

`packages/db/src/repo/prices.ts`:
```ts
import type { Db } from "../client";
import { must } from "../client";
import type { PricePoint, Sale, TierLabel } from "@pcg/domain";

export async function loadMatchedSales(db: Db): Promise<Sale[]> {
  const rows = must(await db.from("public_sales").select("product_id,grade_value,grade_label,price_usd,sold_at,is_best_offer,price")) as Array<{
    product_id: string; grade_value: number | null; grade_label: string | null; price_usd: number | null; sold_at: string | null; is_best_offer: boolean; price: number;
  }>;
  return rows.filter((r) => r.grade_value != null && r.price_usd != null && r.sold_at && !r.is_best_offer && r.price > 0)
    .map((r) => ({ productId: r.product_id, gradeValue: Number(r.grade_value), gradeLabel: (r.grade_label as TierLabel | null), priceUsd: Number(r.price_usd), soldAt: new Date(r.sold_at!) }));
}

export async function replacePricePoints(db: Db, points: PricePoint[]) {
  must(await db.from("price_points").delete().neq("product_id", ""));
  for (let i = 0; i < points.length; i += 500) {
    const chunk = points.slice(i, i + 500).map((p) => ({
      product_id: p.productId, grade_value: p.gradeValue, grade_label: p.gradeLabel, window: p.window, n_sales: p.nSales,
      median_usd: p.medianUsd, min_usd: p.minUsd, max_usd: p.maxUsd, last_sold_at: p.lastSoldAt.toISOString(), confidence: p.confidence,
      computed_at: new Date().toISOString(),
    }));
    must(await db.from("price_points").insert(chunk));
  }
}
```

`packages/db/src/repo/runs.ts`:
```ts
import type { Db } from "../client";
import { must } from "../client";

export async function startRun(db: Db, job: string): Promise<string> {
  const row = must(await db.from("ingest_runs").insert({ job, status: "running" }).select("id").single()) as { id: string };
  return row.id;
}
export async function finishRun(db: Db, id: string, patch: { status: "ok" | "failed" | "suspect"; items_seen?: number; items_new?: number; items_updated?: number; errors?: unknown[] }) {
  must(await db.from("ingest_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", id));
}
```

`packages/db/src/repo/state.ts`:
```ts
import type { Db } from "../client";
import { must } from "../client";

export async function getCursor<T = unknown>(db: Db, connector: string): Promise<T | null> {
  const r = must(await db.from("connector_state").select("cursor").eq("connector", connector).maybeSingle()) as { cursor: T } | null;
  return r?.cursor ?? null;
}
export async function setCursor(db: Db, connector: string, cursor: unknown) {
  must(await db.from("connector_state").upsert({ connector, cursor, updated_at: new Date().toISOString() }, { onConflict: "connector" }));
}
```

`packages/db/src/repo/fx.ts`:
```ts
import type { Db } from "../client";
import { must } from "../client";

export async function upsertFxRates(db: Db, rows: { date: string; base: string; quote: string; rate: number }[]) {
  if (rows.length) must(await db.from("fx_rates").upsert(rows, { onConflict: "date,base,quote" }));
}
export async function observedCurrencies(db: Db): Promise<string[]> {
  const rows = must(await db.from("raw_listings").select("currency")) as { currency: string }[];
  return [...new Set(rows.map((r) => r.currency))];
}
```

`packages/db/src/index.ts`:
```ts
export * from "./client";
export * from "./strip-seller";
export * from "./repo/catalog";
export * from "./repo/listings";
export * from "./repo/matches";
export * from "./repo/prices";
export * from "./repo/runs";
export * from "./repo/state";
export * from "./repo/fx";
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @pcg/db test && pnpm --filter @pcg/db typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): service client, seller-PII stripping, typed repositories"
```

---

## Phase 4 — Connectors

### Task 10: Polite HTTP and connector contract

**Files:**
- Create: `packages/connectors/src/index.ts`, `packages/connectors/src/types.ts`, `packages/connectors/src/http.ts`
- Test: `packages/connectors/test/http.test.ts`

**Interfaces:**
- Produces:
  - `interface Page { listings: RawListing[]; nextCursor: unknown | null; suspect?: boolean }`
  - `interface Connector { name: Source; fetchSold(cursor: unknown | null): AsyncGenerator<Page> }`
  - `politeFetch(url: string, init?: RequestInit & { minIntervalMs?: number }): Promise<Response>` — per-host min interval (default 1000 ms), UA `PCGMarketsBot/0.1 (+mailto:${CONTACT_EMAIL})`, 3 retries with backoff on 5xx/network, throws `PausedError` on 429/403.

- [ ] **Step 1: Failing test**

`packages/connectors/test/http.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { politeFetch, PausedError, _resetForTests } from "../src/http";

describe("politeFetch", () => {
  it("enforces per-host interval and sets UA", async () => {
    _resetForTests();
    process.env.CONTACT_EMAIL = "ops@example.com";
    const calls: number[] = [];
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
      calls.push(Date.now());
      expect((init!.headers as Record<string, string>)["User-Agent"]).toContain("ops@example.com");
      return new Response("ok", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await politeFetch("https://h.test/a", { minIntervalMs: 120 });
    await politeFetch("https://h.test/b", { minIntervalMs: 120 });
    expect(calls[1]! - calls[0]!).toBeGreaterThanOrEqual(110);
    vi.unstubAllGlobals();
  });
  it("throws PausedError on 429/403", async () => {
    _resetForTests();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    await expect(politeFetch("https://h2.test/x", { minIntervalMs: 0 })).rejects.toBeInstanceOf(PausedError);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pcg/connectors test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/connectors/src/types.ts`:
```ts
import type { RawListing, Source } from "@pcg/domain";

export interface Page {
  listings: RawListing[];
  nextCursor: unknown | null;
  /** HTTP 200 but zero items parsed from a page that should have had items (markup change). */
  suspect?: boolean;
}

export interface Connector {
  name: Source;
  fetchSold(cursor: unknown | null): AsyncGenerator<Page>;
}
```

`packages/connectors/src/http.ts`:
```ts
export class PausedError extends Error {
  constructor(public status: number, url: string) { super(`Paused by ${status} from ${url}`); }
}

const lastCall = new Map<string, number>();
export function _resetForTests() { lastCall.clear(); }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function politeFetch(url: string, init: RequestInit & { minIntervalMs?: number } = {}): Promise<Response> {
  const { minIntervalMs = 1000, ...rest } = init;
  const host = new URL(url).host;
  const wait = (lastCall.get(host) ?? 0) + minIntervalMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall.set(host, Date.now());
  const headers = { "User-Agent": `PCGMarketsBot/0.1 (+mailto:${process.env.CONTACT_EMAIL ?? "unset"})`, ...(rest.headers as Record<string, string> ?? {}) };
  let attempt = 0;
  for (;;) {
    let res: Response;
    try {
      res = await fetch(url, { ...rest, headers });
    } catch (e) {
      if (++attempt > 3) throw e;
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (res.status === 429 || res.status === 403) throw new PausedError(res.status, url);
    if (res.status >= 500 && ++attempt <= 3) { await sleep(500 * 2 ** attempt); continue; }
    return res;
  }
}
```

`packages/connectors/src/index.ts`:
```ts
export * from "./types";
export * from "./http";
```

- [ ] **Step 4: Run to verify pass, commit**

Run: `pnpm --filter @pcg/connectors test`
Expected: PASS.

```bash
git add packages/connectors
git commit -m "feat(connectors): connector contract and polite HTTP client"
```

---

### Task 11: TCGdex catalog connector

**Files:**
- Create: `packages/connectors/src/tcgdex/index.ts`, `packages/connectors/test/fixtures/tcgdex-sets-ja.json`, `packages/connectors/test/fixtures/tcgdex-set-SV1a.json`, `packages/connectors/test/fixtures/tcgdex-set-sv04.5.json`
- Modify: `packages/connectors/src/index.ts`
- Test: `packages/connectors/test/tcgdex.test.ts`

**Interfaces:**
- Produces:
  - `listSets(lang: Language): Promise<TcgdexSetSummary[]>` → `GET https://api.tcgdex.net/v2/{lang}/sets`
  - `getSet(lang: Language, id: string): Promise<TcgdexSet>` → `GET https://api.tcgdex.net/v2/{lang}/sets/{id}`
  - `toSetRow(lang, set: TcgdexSet): SetRow`, `toProductRows(lang, set: TcgdexSet): ProductRow[]`
- Consumes: `numberFromCatalog` (Task 2), `SetRow`/`ProductRow` (Task 9).

Verified API shapes (2026-09-06): set summary `{ id, name, cardCount: { total, official } }`; set detail adds `cards: [{ id, localId, name, image }]`, `releaseDate: "YYYY-MM-DD"`, `serie: { id, name }`, EN sets also `abbreviation: { official: "PAF" }`. JA set ids are printed codes (`SV1a`, `S12a`, `M2a`, `SV-P`, `M-P`). Card image URL = `image + "/high.webp"`.

- [ ] **Step 1: Record fixtures**

Run:
```bash
mkdir -p packages/connectors/test/fixtures
curl -s https://api.tcgdex.net/v2/ja/sets | jq '.[0:5]' > packages/connectors/test/fixtures/tcgdex-sets-ja.json
curl -s https://api.tcgdex.net/v2/ja/sets/SV1a | jq '{id,name,releaseDate,cardCount,serie,cards: .cards[0:3]}' > packages/connectors/test/fixtures/tcgdex-set-SV1a.json
curl -s https://api.tcgdex.net/v2/en/sets/sv04.5 | jq '{id,name,releaseDate,cardCount,serie,abbreviation,cards: .cards[0:3]}' > packages/connectors/test/fixtures/tcgdex-set-sv04.5.json
```
Expected: three small JSON files.

- [ ] **Step 2: Failing tests**

`packages/connectors/test/tcgdex.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { toSetRow, toProductRows, type TcgdexSet } from "../src/tcgdex";
import ja from "./fixtures/tcgdex-set-SV1a.json";
import en from "./fixtures/tcgdex-set-sv04.5.json";

describe("tcgdex mapping", () => {
  it("maps a JA set: id is the printed code, name_ja set, card_count = official", () => {
    const row = toSetRow("ja", ja as TcgdexSet);
    expect(row).toMatchObject({ id: "SV1a", printed_code: "SV1a", language: "ja", name_ja: "トリプレットビート", name_en: null, card_count: 73, release_date: "2023-03-10" });
  });
  it("maps an EN set: printed_code from abbreviation, alias includes it", () => {
    const row = toSetRow("en", en as TcgdexSet);
    expect(row).toMatchObject({ id: "sv04.5", printed_code: "PAF", language: "en", name_en: "Paldean Fates", card_count: 91 });
    expect(row.aliases).toContain("PAF");
  });
  it("maps cards to products with printed numbers and image URLs", () => {
    const rows = toProductRows("ja", ja as TcgdexSet);
    expect(rows[0]).toMatchObject({ id: "SV1a-001", set_id: "SV1a", number_printed: "001/073", number_num: 1, number_denom: 73, name_ja: "トロピウス", language: "ja", image_url: "https://assets.tcgdex.net/ja/SV/SV1a/001/high.webp" });
  });
  it("promo sets carry the suffix", () => {
    const promo: TcgdexSet = { id: "SV-P", name: "SVプロモ", releaseDate: null, cardCount: { total: 10, official: 0 }, cards: [{ id: "SV-P-001", localId: "001", name: "x", image: "https://assets.tcgdex.net/ja/SV/SV-P/001" }] };
    expect(toProductRows("ja", promo)[0]).toMatchObject({ number_printed: "001/SV-P", number_denom: null, number_suffix: "SV-P" });
  });
  it("keeps non-numeric localIds as products with null number_num", () => {
    const vintage: TcgdexSet = { id: "base1", name: "Base", releaseDate: null, cardCount: { total: 1, official: 102 }, cards: [{ id: "base1-x", localId: "Charizard", name: "Charizard", image: null }] };
    expect(toProductRows("en", vintage)[0]).toMatchObject({ number_printed: "Charizard", number_num: null });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @pcg/connectors test -- tcgdex`
Expected: FAIL.

- [ ] **Step 4: Implement**

`packages/connectors/src/tcgdex/index.ts`:
```ts
import type { Language } from "@pcg/domain";
import { numberFromCatalog } from "@pcg/domain";
import type { SetRow, ProductRow } from "@pcg/db";
import { politeFetch } from "../http";

const BASE = "https://api.tcgdex.net/v2";

export interface TcgdexSetSummary { id: string; name: string; cardCount: { total: number; official: number } }
export interface TcgdexCard { id: string; localId: string; name: string; image?: string | null }
export interface TcgdexSet extends TcgdexSetSummary {
  releaseDate: string | null;
  cards: TcgdexCard[];
  abbreviation?: { official?: string };
  serie?: { id: string; name: string };
}

export async function listSets(lang: Language): Promise<TcgdexSetSummary[]> {
  const res = await politeFetch(`${BASE}/${lang}/sets`, { minIntervalMs: 250 });
  if (!res.ok) throw new Error(`tcgdex sets ${lang}: ${res.status}`);
  return (await res.json()) as TcgdexSetSummary[];
}

export async function getSet(lang: Language, id: string): Promise<TcgdexSet> {
  const res = await politeFetch(`${BASE}/${lang}/sets/${encodeURIComponent(id)}`, { minIntervalMs: 250 });
  if (!res.ok) throw new Error(`tcgdex set ${lang}/${id}: ${res.status}`);
  return (await res.json()) as TcgdexSet;
}

const isPromo = (id: string) => /-P$/i.test(id);

export function toSetRow(lang: Language, set: TcgdexSet): SetRow {
  const printed = lang === "ja" ? set.id : (set.abbreviation?.official ?? null);
  const official = set.cardCount?.official && set.cardCount.official > 0 ? set.cardCount.official : null;
  return {
    id: set.id, printed_code: printed, language: lang,
    name_en: lang === "en" ? set.name : null, name_ja: lang === "ja" ? set.name : null,
    release_date: set.releaseDate ?? null, card_count: isPromo(set.id) ? null : official,
    aliases: printed && printed !== set.id ? [printed] : [],
  };
}

export function toProductRows(lang: Language, set: TcgdexSet): ProductRow[] {
  const official = set.cardCount?.official && set.cardCount.official > 0 ? set.cardCount.official : null;
  return set.cards.map((c) => {
    const n = numberFromCatalog(c.localId, { id: set.id, cardCountOfficial: official });
    return {
      id: c.id, set_id: set.id,
      number_printed: n?.printed ?? c.localId, number_num: n?.num ?? null, number_denom: n?.denom ?? null, number_suffix: n?.suffix ?? null,
      name_en: lang === "en" ? c.name : null, name_ja: lang === "ja" ? c.name : null, rarity: null, language: lang,
      image_url: c.image ? `${c.image}/high.webp` : null,
    };
  });
}
```

Add `export * as tcgdex from "./tcgdex";` to `packages/connectors/src/index.ts`. Add `"@pcg/db": "workspace:*"` to `packages/connectors/package.json` dependencies and run `pnpm install`.

- [ ] **Step 5: Run to verify pass, commit**

Run: `pnpm --filter @pcg/connectors test`
Expected: PASS.

```bash
git add packages/connectors
git commit -m "feat(connectors): TCGdex catalog fetch and row mapping"
```

---

### Task 12: Yahoo! Auctions closedsearch connector

**Files:**
- Create: `spikes/record-yahoo.ts`, `packages/connectors/src/yahoo-auctions/parse.ts`, `packages/connectors/src/yahoo-auctions/index.ts`, `packages/connectors/test/fixtures/yahoo-closedsearch-pcg.html`
- Modify: `packages/connectors/src/index.ts`
- Test: `packages/connectors/test/yahoo-auctions.test.ts`

**Interfaces:**
- Produces:
  - `parseClosedSearchPage(html: string, fetchedAt: Date): { items: YahooItem[]; nextPageUrl: string | null }` where `YahooItem = { itemId: string; url: string; title: string; priceJpy: number; bids: number; endedAt: Date | null; imageUrl: string | null }`
  - `parseYahooEndTime(text: string, now: Date): Date | null`
  - `yahooAuctions: Connector` (`name: "yahoo_auc"`), cursor `{ keywordIndex: number; pageUrl: string | null; seenIds: string[] }`
- Consumes: `politeFetch`, `Page`, `Connector` (Task 10), `RawListing` (Task 2).

The parser is written against **anchors and text**, not class names, so it survives Yahoo's BEM class churn: every result contains an `<a href="https://page.auctions.yahoo.co.jp/jp/auction/{id}">`; its enclosing `<li>` holds the price (`N,NNN円`), bid count, and end time.

- [ ] **Step 1: Record a real page as a fixture**

`spikes/record-yahoo.ts`:
```ts
import { writeFileSync, mkdirSync } from "node:fs";
const kw = process.argv[2] ?? "PCG鑑定品";
const url = `https://auctions.yahoo.co.jp/closedsearch/closedsearch?p=${encodeURIComponent(kw)}`;
const res = await fetch(url, { headers: { "User-Agent": `PCGMarketsBot/0.1 (+mailto:${process.env.CONTACT_EMAIL})`, "Accept-Language": "ja" } });
console.log(res.status, url);
mkdirSync("packages/connectors/test/fixtures", { recursive: true });
writeFileSync("packages/connectors/test/fixtures/yahoo-closedsearch-pcg.html", await res.text());
```
Run: `CONTACT_EMAIL=you@example.com pnpm tsx spikes/record-yahoo.ts`
Expected: `200 https://…closedsearch?p=PCG%E9%91%91%E5%AE%9A%E5%93%81` and an HTML file of several hundred KB. Open it and confirm it contains `page.auctions.yahoo.co.jp/jp/auction/` links, `円` prices and a next-page link (text `次へ` or `rel="next"`). Note down two real item ids and their price/bids/end-time text for the test below (replace the placeholders `ITEM_ID_1`, `PRICE_1`, `BIDS_1` with values you read from the fixture — the assertions must be facts from the recorded page).

- [ ] **Step 2: Failing tests**

`packages/connectors/test/yahoo-auctions.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseClosedSearchPage, parseYahooEndTime } from "../src/yahoo-auctions/parse";

const html = readFileSync(new URL("./fixtures/yahoo-closedsearch-pcg.html", import.meta.url), "utf8");
const now = new Date("2026-09-06T12:00:00+09:00");

describe("parseClosedSearchPage", () => {
  const { items, nextPageUrl } = parseClosedSearchPage(html, now);
  it("finds items with ids, titles, JPY prices and bids", () => {
    expect(items.length).toBeGreaterThan(5);
    for (const it of items) {
      expect(it.itemId).toMatch(/^[a-z]\d+$/);
      expect(it.url).toContain(`/jp/auction/${it.itemId}`);
      expect(it.title.length).toBeGreaterThan(3);
      expect(it.priceJpy).toBeGreaterThan(0);
      expect(it.bids).toBeGreaterThanOrEqual(0);
    }
  });
  it("matches a known item from the fixture", () => {
    const known = items.find((i) => i.itemId === "ITEM_ID_1")!;
    expect(known.priceJpy).toBe(PRICE_1);
    expect(known.bids).toBe(BIDS_1);
  });
  it("exposes the next page link", () => {
    expect(nextPageUrl).toMatch(/closedsearch\/closedsearch\?/);
  });
});

describe("parseYahooEndTime", () => {
  it("parses MM/DD HH:mm in JST, same year", () => {
    expect(parseYahooEndTime("09/03 21:15", now)?.toISOString()).toBe("2026-09-03T12:15:00.000Z");
  });
  it("rolls to previous year when month is in the future", () => {
    expect(parseYahooEndTime("12/30 10:00", now)?.getUTCFullYear()).toBe(2025);
  });
  it("parses 月/日 form", () => {
    expect(parseYahooEndTime("9月3日 21時15分", now)?.toISOString()).toBe("2026-09-03T12:15:00.000Z");
  });
  it("returns null for junk", () => expect(parseYahooEndTime("終了", now)).toBeNull());
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @pcg/connectors test -- yahoo`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the parser**

`packages/connectors/src/yahoo-auctions/parse.ts`:
```ts
import * as cheerio from "cheerio";

export interface YahooItem {
  itemId: string; url: string; title: string; priceJpy: number; bids: number; endedAt: Date | null; imageUrl: string | null;
}

const ITEM_URL_RE = /page\.auctions\.yahoo\.co\.jp\/jp\/auction\/([a-z]\d+)/;
const JST_OFFSET_MIN = 9 * 60;

export function parseYahooEndTime(text: string, now: Date): Date | null {
  const t = text.replace(/\s+/g, " ");
  let m = /(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/.exec(t);
  let month: number, day: number, hour = 0, minute = 0;
  if (m) { month = +m[1]!; day = +m[2]!; hour = +m[3]!; minute = +m[4]!; }
  else {
    m = /(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2})時(\d{1,2})分)?/.exec(t);
    if (!m) return null;
    month = +m[1]!; day = +m[2]!; hour = m[3] ? +m[3] : 0; minute = m[4] ? +m[4] : 0;
  }
  const nowJst = new Date(now.getTime() + JST_OFFSET_MIN * 60000);
  let year = nowJst.getUTCFullYear();
  if (month > nowJst.getUTCMonth() + 1 || (month === nowJst.getUTCMonth() + 1 && day > nowJst.getUTCDate() + 1)) year -= 1;
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - JST_OFFSET_MIN * 60000);
}

export function parseClosedSearchPage(html: string, fetchedAt: Date): { items: YahooItem[]; nextPageUrl: string | null } {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: YahooItem[] = [];

  $("a[href*='page.auctions.yahoo.co.jp/jp/auction/']").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const m = ITEM_URL_RE.exec(href);
    if (!m) return;
    const itemId = m[1]!;
    if (seen.has(itemId)) return;
    const container = $(a).closest("li").length ? $(a).closest("li") : $(a).parent().parent();
    const text = container.text().replace(/\s+/g, " ").trim();
    const title = ($(a).attr("title") || $(a).text()).replace(/\s+/g, " ").trim();
    if (!title) return;
    const priceM = /([\d,]+)\s*円/.exec(text);
    if (!priceM) return;
    const bidsM = /入札\s*(\d+)|(\d+)\s*件?\s*入札|(\d+)\s*bids?/i.exec(text);
    const bids = bidsM ? +(bidsM[1] ?? bidsM[2] ?? bidsM[3]!) : 0;
    const img = container.find("img").first();
    seen.add(itemId);
    items.push({
      itemId, url: `https://page.auctions.yahoo.co.jp/jp/auction/${itemId}`, title,
      priceJpy: parseInt(priceM[1]!.replace(/,/g, ""), 10), bids,
      endedAt: parseYahooEndTime(text, fetchedAt),
      imageUrl: img.attr("data-src") ?? img.attr("src") ?? null,
    });
  });

  let nextPageUrl: string | null = $("a[rel='next']").attr("href") ?? null;
  if (!nextPageUrl) {
    $("a").each((_, a) => { if (!nextPageUrl && /次へ|次の/.test($(a).text())) nextPageUrl = $(a).attr("href") ?? null; });
  }
  if (nextPageUrl && nextPageUrl.startsWith("/")) nextPageUrl = `https://auctions.yahoo.co.jp${nextPageUrl}`;
  return { items, nextPageUrl };
}
```

If the fixture's bid count or end time lives in a sibling element rather than the `<li>` text, widen `container` to `$(a).closest("li, .Product, [class*='Product']")` — adjust once, against the fixture, and keep the test green.

- [ ] **Step 5: Implement the connector**

`packages/connectors/src/yahoo-auctions/index.ts`:
```ts
import type { RawListing } from "@pcg/domain";
import type { Connector, Page } from "../types";
import { politeFetch } from "../http";
import { parseClosedSearchPage } from "./parse";

export const YAHOO_KEYWORDS = ["PCG鑑定品", "PCG鑑定", "PCG10", "PCG9.5"];
const SEARCH = (kw: string) => `https://auctions.yahoo.co.jp/closedsearch/closedsearch?p=${encodeURIComponent(kw)}`;

export interface YahooCursor { keywordIndex: number; pageUrl: string | null; seenIds: string[] }

export const yahooAuctions: Connector = {
  name: "yahoo_auc",
  async *fetchSold(cursorIn: unknown | null): AsyncGenerator<Page> {
    const cursor: YahooCursor = (cursorIn as YahooCursor | null) ?? { keywordIndex: 0, pageUrl: null, seenIds: [] };
    const seen = new Set(cursor.seenIds);
    let { keywordIndex, pageUrl } = cursor;
    while (keywordIndex < YAHOO_KEYWORDS.length) {
      const url = pageUrl ?? SEARCH(YAHOO_KEYWORDS[keywordIndex]!);
      const res = await politeFetch(url, { minIntervalMs: 1000, headers: { "Accept-Language": "ja" } });
      if (!res.ok) throw new Error(`yahoo ${res.status} ${url}`);
      const fetchedAt = new Date();
      const { items, nextPageUrl } = parseClosedSearchPage(await res.text(), fetchedAt);
      const fresh = items.filter((i) => !seen.has(i.itemId));
      fresh.forEach((i) => seen.add(i.itemId));
      // Stop paging a keyword once a whole page is already known.
      const exhausted = !nextPageUrl || fresh.length === 0;
      const next: YahooCursor = exhausted
        ? { keywordIndex: keywordIndex + 1, pageUrl: null, seenIds: [...seen].slice(-5000) }
        : { keywordIndex, pageUrl: nextPageUrl, seenIds: [...seen].slice(-5000) };
      yield {
        listings: fresh.map((i): RawListing => ({
          source: "yahoo_auc", sourceItemId: i.itemId, url: i.url, title: i.title, description: null,
          price: i.priceJpy, currency: "JPY", kind: i.bids >= 1 ? "sold" : "ended",
          soldAt: i.bids >= 1 ? i.endedAt?.toISOString() ?? null : null, endedAt: i.endedAt?.toISOString() ?? null,
          isBestOffer: false, sellerCountry: "JP", externalItemId: null,
          imageUrls: i.imageUrl ? [i.imageUrl] : [], metadata: {}, raw: i,
        })),
        nextCursor: next,
        suspect: items.length === 0,
      };
      keywordIndex = next.keywordIndex; pageUrl = next.pageUrl;
    }
    // Completed a full sweep: reset for the next run but keep the seen set.
    yield { listings: [], nextCursor: { keywordIndex: 0, pageUrl: null, seenIds: [...seen].slice(-5000) } };
  },
};
```

Add `export * from "./yahoo-auctions"; export * from "./yahoo-auctions/parse";` to `packages/connectors/src/index.ts`.

- [ ] **Step 6: Run to verify pass, commit**

Run: `pnpm --filter @pcg/connectors test`
Expected: PASS.

```bash
git add packages/connectors spikes/record-yahoo.ts
git commit -m "feat(connectors): Yahoo Auctions closedsearch parser and connector"
```

---

### Task 13: The Card API connector

**Files:**
- Create: `spikes/record-thecardapi.ts`, `packages/connectors/src/thecardapi/schema.ts`, `packages/connectors/src/thecardapi/index.ts`, `packages/connectors/test/fixtures/thecardapi-sample.json`, `docs/research/2026-09-thecardapi-schema.md`
- Modify: `packages/connectors/src/index.ts`
- Test: `packages/connectors/test/thecardapi.test.ts`

**Interfaces:**
- Produces:
  - `THECARDAPI: { baseUrl: string; salesPath: string; queryParams: Record<string,string>; fields: FieldPaths }` in `schema.ts` — the single file that knows The Card API's shape
  - `toRawListing(rec: unknown): RawListing | null`
  - `theCardApi: Connector` (`name: "thecardapi"`), cursor `{ lastSoldAt: string | null }`

The Card API's response shape was not observable in research. This task therefore starts by **recording** a real response and **documenting** the field names; the mapper reads every field through `schema.ts` so the rest of the code never sees vendor names.

- [ ] **Step 1: Get a key and read the docs**

Sign up at https://thecardapi.com (free tier). Put the key in `.env` as `THECARDAPI_KEY`. From their API reference, write down: the sales/sold endpoint URL, how the key is sent (header name or query param), the query params for keyword search + graded filter + date range + pagination, and the response envelope (array vs `{ data: [] }`). Record them in `docs/research/2026-09-thecardapi-schema.md` under headings **Endpoint**, **Auth**, **Params**, **Envelope**, **Record fields** (leave "Record fields" for Step 2).

- [ ] **Step 2: Record a sample**

`spikes/record-thecardapi.ts`:
```ts
import { writeFileSync } from "node:fs";
import { THECARDAPI } from "../packages/connectors/src/thecardapi/schema";
const u = new URL(THECARDAPI.salesPath, THECARDAPI.baseUrl);
for (const [k, v] of Object.entries(THECARDAPI.queryParams)) u.searchParams.set(k, v);
const res = await fetch(u, { headers: THECARDAPI.authHeaders(process.env.THECARDAPI_KEY!) });
console.log(res.status, u.toString());
const body = await res.text();
writeFileSync("packages/connectors/test/fixtures/thecardapi-sample.json", body);
console.log(body.slice(0, 2000));
```
Before running, create `packages/connectors/src/thecardapi/schema.ts` with the values from Step 1:
```ts
/** Everything vendor-specific about The Card API lives here. Filled from docs + the recorded sample. */
export const THECARDAPI = {
  baseUrl: "https://<from docs>",
  salesPath: "/<from docs>",
  queryParams: { /* keyword: '(pcg,"premier card grading")', graded: 'true', ... from docs */ } as Record<string, string>,
  authHeaders: (key: string): Record<string, string> => ({ /* e.g. Authorization: `Bearer ${key}` — from docs */ }),
  /** Path into the response to the array of records, e.g. ["data"] or [] for a bare array. */
  envelope: [] as string[],
  /** Dot-paths inside one record. Fill from the recorded sample. */
  fields: {
    id: "", title: "", price: "", currency: "", soldAt: "", url: "", imageUrls: "", ebayItemId: "",
    bestOffer: "", grader: "", grade: "", certNumber: "", set: "", cardNumber: "", language: "",
  },
  /** Paging: name of the cursor/offset param and how to read the next cursor from the response. */
  paging: { param: "", nextPath: [] as string[] },
};
```
Run: `pnpm tsx spikes/record-thecardapi.ts`
Expected: `200` and a JSON sample. Fill in `fields` and `paging` in `schema.ts` from what you see; complete **Record fields** in the research doc, including which fields are absent (if there is no `grader`/`set`/`cardNumber`, say so — the matcher will route those rows to `no_metadata`).

- [ ] **Step 3: Failing test against the recorded sample**

`packages/connectors/test/thecardapi.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { extractRecords, toRawListing } from "../src/thecardapi";

const body = JSON.parse(readFileSync(new URL("./fixtures/thecardapi-sample.json", import.meta.url), "utf8"));

describe("thecardapi mapping", () => {
  const recs = extractRecords(body);
  it("finds records in the envelope", () => expect(recs.length).toBeGreaterThan(0));
  it("maps every record to a RawListing with the required fields", () => {
    for (const r of recs) {
      const l = toRawListing(r);
      expect(l).not.toBeNull();
      expect(l!.source).toBe("thecardapi");
      expect(l!.sourceItemId.length).toBeGreaterThan(0);
      expect(l!.title.length).toBeGreaterThan(0);
      expect(l!.price).toBeGreaterThan(0);
      expect(l!.currency).toMatch(/^[A-Z]{3}$/);
      expect(l!.kind).toBe("sold");
      expect(l!.soldAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(l!.url).toMatch(/^https?:\/\//);
    }
  });
  it("normalises grader/grade into EbayMetadata when present", () => {
    const withGrader = recs.map(toRawListing).find((l) => l && "grader" in l.metadata);
    if (withGrader) expect(typeof (withGrader.metadata as { grader?: string }).grader).toBe("string");
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm --filter @pcg/connectors test -- thecardapi`
Expected: FAIL — `extractRecords`/`toRawListing` not found.

- [ ] **Step 5: Implement mapper + connector**

`packages/connectors/src/thecardapi/index.ts`:
```ts
import type { EbayMetadata, RawListing } from "@pcg/domain";
import type { Connector, Page } from "../types";
import { politeFetch } from "../http";
import { THECARDAPI } from "./schema";

function get(obj: unknown, path: string | string[]): unknown {
  const parts = Array.isArray(path) ? path : path ? path.split(".") : [];
  return parts.reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}
const str = (v: unknown): string | undefined => (v == null || v === "" ? undefined : String(v));

export function extractRecords(body: unknown): unknown[] {
  const arr = get(body, THECARDAPI.envelope);
  return Array.isArray(arr) ? arr : [];
}

export function toRawListing(rec: unknown): RawListing | null {
  const f = THECARDAPI.fields;
  const id = str(get(rec, f.id)), title = str(get(rec, f.title)), url = str(get(rec, f.url));
  const price = Number(get(rec, f.price)), soldAtRaw = str(get(rec, f.soldAt));
  if (!id || !title || !url || !Number.isFinite(price) || !soldAtRaw) return null;
  const soldAt = new Date(soldAtRaw);
  if (Number.isNaN(soldAt.getTime())) return null;
  const metadata: EbayMetadata = {};
  const md: Array<[keyof EbayMetadata, string]> = [["grader", f.grader], ["grade", f.grade], ["certNumber", f.certNumber], ["set", f.set], ["cardNumber", f.cardNumber], ["language", f.language]];
  for (const [k, path] of md) { const v = str(get(rec, path)); if (v) metadata[k] = v; }
  const imgs = get(rec, f.imageUrls);
  const bestOffer = get(rec, f.bestOffer);
  return {
    source: "thecardapi", sourceItemId: id, url, title, description: null,
    price, currency: (str(get(rec, f.currency)) ?? "USD").toUpperCase(), kind: "sold",
    soldAt: soldAt.toISOString(), endedAt: soldAt.toISOString(),
    isBestOffer: bestOffer === true || bestOffer === "true",
    sellerCountry: null, externalItemId: str(get(rec, f.ebayItemId)) ?? null,
    imageUrls: Array.isArray(imgs) ? imgs.map(String) : typeof imgs === "string" ? [imgs] : [],
    metadata, raw: rec,
  };
}

export interface TheCardApiCursor { lastSoldAt: string | null }

export const theCardApi: Connector = {
  name: "thecardapi",
  async *fetchSold(cursorIn: unknown | null): AsyncGenerator<Page> {
    const key = process.env.THECARDAPI_KEY;
    if (!key) throw new Error("THECARDAPI_KEY is required");
    const cursor = (cursorIn as TheCardApiCursor | null) ?? { lastSoldAt: null };
    let pageToken: string | null = null;
    let newest = cursor.lastSoldAt;
    for (let pages = 0; pages < 50; pages++) {
      const u = new URL(THECARDAPI.salesPath, THECARDAPI.baseUrl);
      for (const [k, v] of Object.entries(THECARDAPI.queryParams)) u.searchParams.set(k, v);
      if (pageToken && THECARDAPI.paging.param) u.searchParams.set(THECARDAPI.paging.param, pageToken);
      const res = await politeFetch(u.toString(), { minIntervalMs: 500, headers: THECARDAPI.authHeaders(key) });
      if (!res.ok) throw new Error(`thecardapi ${res.status}`);
      const body = await res.json();
      const listings = extractRecords(body).map(toRawListing).filter((l): l is RawListing => l !== null);
      for (const l of listings) if (!newest || l.soldAt! > newest) newest = l.soldAt;
      const nextToken = str(get(body, THECARDAPI.paging.nextPath)) ?? null;
      const reachedKnown = cursor.lastSoldAt != null && listings.some((l) => l.soldAt! <= cursor.lastSoldAt!);
      yield { listings, nextCursor: { lastSoldAt: newest }, suspect: false };
      if (!nextToken || reachedKnown) break;
      pageToken = nextToken;
    }
  },
};
```

Add `export * from "./thecardapi"; export { THECARDAPI } from "./thecardapi/schema";` to `packages/connectors/src/index.ts`.

- [ ] **Step 6: Run to verify pass, commit**

Run: `pnpm --filter @pcg/connectors test`
Expected: PASS (if a field is absent in the sample, adjust `schema.ts`, not the test).

```bash
git add packages/connectors spikes/record-thecardapi.ts docs/research/2026-09-thecardapi-schema.md
git commit -m "feat(connectors): The Card API connector with isolated vendor schema"
```

---

### Task 14: FX rates and PCG cert lookup

**Files:**
- Create: `packages/connectors/src/fx/index.ts`, `packages/connectors/src/pcg/index.ts`
- Modify: `packages/connectors/src/index.ts`
- Test: `packages/connectors/test/fx.test.ts`, `packages/connectors/test/pcg.test.ts`

**Interfaces:**
- Produces:
  - `fetchRates(date: string, bases: string[]): Promise<{ date: string; base: string; quote: "USD"; rate: number }[]>` — `GET https://api.frankfurter.dev/v1/{date}?base={B}&symbols=USD` per base; USD→USD emitted as 1.
  - `lookupCert(gradedId: string, opts?: { timeoutMs?: number }): Promise<CertRecord | null>` — `GET https://app.premiercardgrading.com/public/api/v1/gradings?gradedId={id}`

Verified 2026-09-06: `GET https://api.frankfurter.dev/v1/2026-09-04?base=JPY&symbols=USD,GBP,AUD` → `{"amount":1.0,"base":"JPY","date":"2026-09-04","rates":{"AUD":0.00888,"GBP":0.00473,"USD":0.0064}}`. PCG cert response shape is documented in `docs/research/2026-09-05-pcg-company.md` §3 (fields `gradedId, setName, cardNumber, finalGrade, grade, cardInfo.language`).

- [ ] **Step 1: Failing tests**

`packages/connectors/test/fx.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { fetchRates } from "../src/fx";

describe("fetchRates", () => {
  it("maps frankfurter and adds USD identity", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      expect(u).toContain("/v1/2026-09-04?base=JPY&symbols=USD");
      return new Response(JSON.stringify({ amount: 1, base: "JPY", date: "2026-09-04", rates: { USD: 0.0064 } }), { status: 200 });
    }));
    const rows = await fetchRates("2026-09-04", ["JPY", "USD"]);
    expect(rows).toEqual([
      { date: "2026-09-04", base: "USD", quote: "USD", rate: 1 },
      { date: "2026-09-04", base: "JPY", quote: "USD", rate: 0.0064 },
    ]);
    vi.unstubAllGlobals();
  });
});
```

`packages/connectors/test/pcg.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { lookupCert } from "../src/pcg";

const sample = [{ gradedId: "000009973", game: "Pokémon", setName: "S&S: Darkness Ablaze", cardName: "Mew V (69/189)", cardNumber: "69/189",
  finish: "Holo", finalGrade: 9.5, grade: "Gem Mint", cardInfo: { language: "English" } }];

describe("lookupCert", () => {
  it("returns a CertRecord for a hit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(sample), { status: 200 })));
    expect(await lookupCert("9973")).toEqual({ gradedId: "000009973", setName: "S&S: Darkness Ablaze", cardNumber: "69/189", language: "English", finalGrade: 9.5, grade: "Gem Mint" });
    vi.unstubAllGlobals();
  });
  it("returns null on miss, error, or timeout", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    expect(await lookupCert("000000100")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => setTimeout(() => r(new Response("[]")), 200))));
    expect(await lookupCert("000000100", { timeoutMs: 20 })).toBeNull();
    vi.unstubAllGlobals();
  });
  it("rejects non-numeric input without a network call", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect(await lookupCert("abc")).toBeNull();
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pcg/connectors test -- fx pcg`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`packages/connectors/src/fx/index.ts`:
```ts
import { politeFetch } from "../http";

export async function fetchRates(date: string, bases: string[]) {
  const out: { date: string; base: string; quote: "USD"; rate: number }[] = [];
  for (const base of [...new Set(bases)]) {
    if (base === "USD") { out.push({ date, base, quote: "USD", rate: 1 }); continue; }
    const res = await politeFetch(`https://api.frankfurter.dev/v1/${date}?base=${base}&symbols=USD`, { minIntervalMs: 200 });
    if (!res.ok) throw new Error(`frankfurter ${res.status} for ${base}`);
    const body = (await res.json()) as { date: string; rates: { USD?: number } };
    if (body.rates?.USD != null) out.push({ date: body.date, base, quote: "USD", rate: body.rates.USD });
  }
  return out;
}
```

`packages/connectors/src/pcg/index.ts`:
```ts
import type { CertRecord } from "@pcg/domain";

const BASE = "https://app.premiercardgrading.com/public/api/v1/gradings";

export async function lookupCert(input: string, opts: { timeoutMs?: number } = {}): Promise<CertRecord | null> {
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  const gradedId = digits.padStart(9, "0");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 3000);
  try {
    const res = await fetch(`${BASE}?gradedId=${gradedId}`, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    const rec = (Array.isArray(body) ? body[0] : (body as { data?: unknown[] })?.data?.[0]) as Record<string, unknown> | undefined;
    if (!rec || rec.gradedId !== gradedId) return null;
    const info = (rec.cardInfo ?? {}) as Record<string, unknown>;
    return {
      gradedId, setName: String(rec.setName ?? ""), cardNumber: String(rec.cardNumber ?? info.number ?? ""),
      language: String(info.language ?? ""), finalGrade: typeof rec.finalGrade === "number" ? rec.finalGrade : null, grade: String(rec.grade ?? ""),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
```

Add `export * from "./fx"; export * from "./pcg";` to `packages/connectors/src/index.ts`.

- [ ] **Step 4: Run to verify pass, commit**

Run: `pnpm --filter @pcg/connectors test`
Expected: PASS.

```bash
git add packages/connectors
git commit -m "feat(connectors): ECB FX rates and PCG cert lookup"
```

---

## Phase 5 — Coverage gate (spike)

### Task 15: Count PCG Pokémon sales per source

**Files:**
- Create: `spikes/count-coverage.ts`, `docs/research/2026-09-coverage-gate.md`

**Interfaces:**
- Consumes: `yahooAuctions`, `theCardApi` (Tasks 12–13), `parseGradeFromText`, `hasPcgSetCodeNoise` (Tasks 3–4).
- Produces: a decision per source recorded in the research doc; sample titles appended to `packages/domain/test/fixtures/titles.json`.

- [ ] **Step 1: Write the counting script**

`spikes/count-coverage.ts`:
```ts
import "dotenv/config";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { yahooAuctions, theCardApi } from "../packages/connectors/src";
import { parseGradeFromText, hasPcgSetCodeNoise, hasPcgsNoise } from "../packages/domain/src";
import type { RawListing } from "../packages/domain/src";

const which = process.argv[2] ?? "yahoo";
const conn = which === "yahoo" ? yahooAuctions : theCardApi;
const since = new Date(Date.now() - 30 * 86400000);
const outDir = "spikes/out"; mkdirSync(outDir, { recursive: true });
const file = `${outDir}/${which}.json`;
const seen: Record<string, RawListing> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};

for await (const page of conn.fetchSold(null)) {
  for (const l of page.listings) seen[l.sourceItemId] = l;
  if (page.listings.some((l) => l.soldAt && new Date(l.soldAt) < since)) break;
}
writeFileSync(file, JSON.stringify(seen, null, 2));

const all = Object.values(seen);
const inWindow = all.filter((l) => l.kind === "sold" && l.soldAt && new Date(l.soldAt) >= since);
const pcg = inWindow.filter((l) => {
  const t = l.title;
  if (which === "thecardapi") return /premier card grading|\bPCG\b/i.test((l.metadata as { grader?: string }).grader ?? "") || parseGradeFromText(t) != null;
  return parseGradeFromText(t) != null && !(hasPcgSetCodeNoise(t) && parseGradeFromText(t) == null) && !hasPcgsNoise(t);
});
console.log(JSON.stringify({ source: which, fetched: all.length, soldInLast30d: inWindow.length, pcgSoldInLast30d: pcg.length, withGraderAspect: inWindow.filter((l) => "grader" in l.metadata).length }, null, 2));
console.log("sample titles:\n" + pcg.slice(0, 25).map((l) => `- ${l.title}`).join("\n"));
```

- [ ] **Step 2: Run against Yahoo (one shot — 180-day window covers 30 days)**

Run: `pnpm tsx spikes/count-coverage.ts yahoo`
Expected: JSON summary with `pcgSoldInLast30d`. Record the number in `docs/research/2026-09-coverage-gate.md` with the date.

- [ ] **Step 3: Run against The Card API daily for ~10 days**

Run: `pnpm tsx spikes/count-coverage.ts thecardapi` once a day (the script merges into `spikes/out/thecardapi.json`, so counts accumulate). After ≥7 runs, extrapolate: `pcgSoldInLast30d ≈ (accumulated PCG sold across N days) × 30 / N`. Also record `withGraderAspect / soldInLast30d` (the descriptor fill rate) and, from the raw sample, the exact field names present.

- [ ] **Step 4: Decide and record**

`docs/research/2026-09-coverage-gate.md`:
```markdown
# Coverage gate — PCG Pokémon sold listings per source

Threshold (spec §7): ≥20 PCG Pokémon sales / 30 days to schedule a source.

| Source | Measured window | PCG sold (30d, extrapolated where noted) | Grader/metadata fill rate | Decision | Date |
|---|---|---|---|---|---|
| yahoo_auc | 30d direct | <n> | n/a (no metadata) | schedule / hold | 2026-09-xx |
| thecardapi | <N> days × 30/N | <n> | <x>% | schedule / hold | 2026-09-xx |

Notes: PCG-P set-code noise share on Yahoo: <x>%. Titles lacking any card number: <x>%. Sets sharing a card_count per language (from TCGdex): <n> pairs.
```
Copy 20–30 real titles per source into `packages/domain/test/fixtures/titles.json` as `[{ "source": "yahoo_auc", "title": "...", "expect": "matched|needs_review" }]` for use in Task 18's regression test.

- [ ] **Step 5: Commit**

```bash
git add spikes/count-coverage.ts docs/research/2026-09-coverage-gate.md packages/domain/test/fixtures/titles.json
git commit -m "spike: coverage gate counts per source + real title fixtures"
```

---

## Phase 6 — Ingest jobs and cron

### Task 16: Job runner, CLI, catalog and FX jobs

**Files:**
- Create: `apps/ingest/src/run.ts`, `apps/ingest/src/cli.ts`, `apps/ingest/src/jobs/catalog-tcgdex.ts`, `apps/ingest/src/jobs/fx-daily.ts`
- Test: `apps/ingest/test/run.test.ts` (add `vitest.config.ts` and `"test": "vitest run"` to `apps/ingest/package.json`)

**Interfaces:**
- Produces:
  - `type Job = (ctx: JobContext) => Promise<JobStats>`; `JobContext = { db: Db; log: (m: string) => void }`; `JobStats = { items_seen: number; items_new: number; items_updated: number; suspect?: boolean }`
  - `runJob(name: string, job: Job, opts?: { db?: Db; env?: NodeJS.ProcessEnv }): Promise<"ok" | "failed" | "suspect" | "skipped">` — honours `CONNECTOR_<NAME>=off`, writes `ingest_runs`, never throws.
  - CLI: `ingest catalog:tcgdex | ebay:sold | yahoo:auctions | fx:daily | match | prices [--all]`

- [ ] **Step 1: Failing test for the runner**

`apps/ingest/test/run.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { runJob } from "../src/run";

function fakeDb() {
  const runs: Record<string, unknown>[] = [];
  const upd: Record<string, unknown>[] = [];
  return {
    runs, upd,
    from: () => ({
      insert: (r: Record<string, unknown>) => ({ select: () => ({ single: async () => { runs.push(r); return { data: { id: "run-1" }, error: null }; } }) }),
      update: (p: Record<string, unknown>) => ({ eq: async () => { upd.push(p); return { data: null, error: null }; } }),
    }),
  } as unknown as import("@pcg/db").Db & { runs: unknown[]; upd: Record<string, unknown>[] };
}

describe("runJob", () => {
  it("skips when the kill switch is off", async () => {
    const db = fakeDb();
    const job = vi.fn();
    expect(await runJob("yahoo:auctions", job, { db, env: { CONNECTOR_YAHOO_AUC: "off" } })).toBe("skipped");
    expect(job).not.toHaveBeenCalled();
  });
  it("records ok with stats", async () => {
    const db = fakeDb();
    const r = await runJob("fx:daily", async () => ({ items_seen: 3, items_new: 3, items_updated: 0 }), { db, env: {} });
    expect(r).toBe("ok");
    expect(db.upd[0]).toMatchObject({ status: "ok", items_new: 3 });
  });
  it("records failed with the error and does not throw", async () => {
    const db = fakeDb();
    const r = await runJob("ebay:sold", async () => { throw new Error("boom"); }, { db, env: {} });
    expect(r).toBe("failed");
    expect(JSON.stringify(db.upd[0]!.errors)).toContain("boom");
  });
  it("records suspect", async () => {
    const db = fakeDb();
    expect(await runJob("yahoo:auctions", async () => ({ items_seen: 0, items_new: 0, items_updated: 0, suspect: true }), { db, env: {} })).toBe("suspect");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pcg/ingest test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement runner + CLI**

`apps/ingest/src/run.ts`:
```ts
import { createServiceClient, startRun, finishRun, type Db } from "@pcg/db";

export interface JobContext { db: Db; log: (m: string) => void }
export interface JobStats { items_seen: number; items_new: number; items_updated: number; suspect?: boolean }
export type Job = (ctx: JobContext) => Promise<JobStats>;

const KILL_SWITCH: Record<string, string> = { "yahoo:auctions": "CONNECTOR_YAHOO_AUC", "ebay:sold": "CONNECTOR_THECARDAPI" };

export async function runJob(name: string, job: Job, opts: { db?: Db; env?: NodeJS.ProcessEnv } = {}): Promise<"ok" | "failed" | "suspect" | "skipped"> {
  const env = opts.env ?? process.env;
  const sw = KILL_SWITCH[name];
  if (sw && env[sw] === "off") { console.log(`[${name}] skipped: ${sw}=off`); return "skipped"; }
  const db = opts.db ?? createServiceClient();
  const log = (m: string) => console.log(`[${name}] ${m}`);
  const runId = await startRun(db, name);
  try {
    const stats = await job({ db, log });
    const status = stats.suspect ? "suspect" : "ok";
    await finishRun(db, runId, { status, items_seen: stats.items_seen, items_new: stats.items_new, items_updated: stats.items_updated });
    log(`${status}: seen=${stats.items_seen} new=${stats.items_new} updated=${stats.items_updated}`);
    return status;
  } catch (e) {
    const err = e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e) };
    await finishRun(db, runId, { status: "failed", errors: [err] });
    log(`failed: ${err.message}`);
    return "failed";
  }
}
```

`apps/ingest/src/cli.ts`:
```ts
import "dotenv/config";
import { runJob } from "./run";
import { catalogTcgdex } from "./jobs/catalog-tcgdex";
import { fxDaily } from "./jobs/fx-daily";
import { ebaySold } from "./jobs/ebay-sold";
import { yahooAuctionsJob } from "./jobs/yahoo-auctions";
import { matchJob } from "./jobs/match";
import { pricesJob } from "./jobs/prices";

const [name, ...flags] = process.argv.slice(2);
const jobs = {
  "catalog:tcgdex": catalogTcgdex,
  "fx:daily": fxDaily,
  "ebay:sold": ebaySold,
  "yahoo:auctions": yahooAuctionsJob,
  match: matchJob({ all: flags.includes("--all") }),
  prices: pricesJob,
} as const;

const job = jobs[name as keyof typeof jobs];
if (!job) { console.error(`unknown job "${name}". one of: ${Object.keys(jobs).join(", ")}`); process.exit(2); }
const status = await runJob(name!, job);
process.exit(status === "failed" ? 1 : 0);
```
(The `ebay-sold`, `yahoo-auctions`, `match`, `prices` imports are created in Tasks 17–18; until then create each file exporting a job that returns zeros so the CLI compiles.)

- [ ] **Step 4: Catalog and FX jobs**

`apps/ingest/src/jobs/catalog-tcgdex.ts`:
```ts
import type { Job } from "../run";
import { tcgdex } from "@pcg/connectors";
import { upsertSets, upsertProducts } from "@pcg/db";

export const catalogTcgdex: Job = async ({ db, log }) => {
  let sets = 0, products = 0;
  for (const lang of ["ja", "en"] as const) {
    const summaries = await tcgdex.listSets(lang);
    log(`${lang}: ${summaries.length} sets`);
    for (const s of summaries) {
      const full = await tcgdex.getSet(lang, s.id);
      await upsertSets(db, [tcgdex.toSetRow(lang, full)]);
      const rows = tcgdex.toProductRows(lang, full);
      await upsertProducts(db, rows);
      sets += 1; products += rows.length;
    }
  }
  return { items_seen: sets, items_new: products, items_updated: 0 };
};
```

`apps/ingest/src/jobs/fx-daily.ts`:
```ts
import type { Job } from "../run";
import { fetchRates } from "@pcg/connectors";
import { upsertFxRates, observedCurrencies } from "@pcg/db";

export const fxDaily: Job = async ({ db, log }) => {
  const bases = [...new Set(["JPY", "USD", ...(await observedCurrencies(db))])];
  const today = new Date().toISOString().slice(0, 10);
  // Backfill the last 7 days so weekend/holiday gaps and late-arriving sales resolve.
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const rows = await fetchRates(d, bases);
    await upsertFxRates(db, rows);
    n += rows.length;
  }
  log(`rates for ${bases.join(",")} through ${today}`);
  return { items_seen: n, items_new: n, items_updated: 0 };
};
```

- [ ] **Step 5: Run tests, then run the two jobs for real**

Run: `pnpm --filter @pcg/ingest test && pnpm ingest fx:daily && pnpm ingest catalog:tcgdex`
Expected: tests PASS; fx logs rates; catalog runs for several minutes (≈290 JA + ≈170 EN set fetches at 4/s) and ends with `ok: seen=~460 new=~35000`. Verify: `psql "$DATABASE_URL" -c "select language, count(*) from products group by 1;" -c "select count(*) from ingest_runs where status='ok';"`.

- [ ] **Step 6: Commit**

```bash
git add apps/ingest
git commit -m "feat(ingest): job runner with kill switch + ingest_runs, TCGdex catalog and FX jobs"
```

---

### Task 17: Sold-listing jobs (The Card API, Yahoo Auctions)

**Files:**
- Create: `apps/ingest/src/jobs/sold-connector.ts`, `apps/ingest/src/jobs/ebay-sold.ts`, `apps/ingest/src/jobs/yahoo-auctions.ts`
- Test: `apps/ingest/test/sold-connector.test.ts`

**Interfaces:**
- Produces: `soldConnectorJob(connector: Connector): Job` — iterates pages, persists each page then its cursor, stops on `PausedError`, flags `suspect`.
- Consumes: `Connector`/`Page`/`PausedError` (Task 10), `upsertRawListings` (Task 9), `getCursor`/`setCursor` (Task 9).

- [ ] **Step 1: Failing test**

`apps/ingest/test/sold-connector.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { soldConnectorJob } from "../src/jobs/sold-connector";
import { PausedError } from "@pcg/connectors";
import type { RawListing } from "@pcg/domain";

vi.mock("@pcg/db", () => {
  const cursors: Record<string, unknown> = {};
  const saved: RawListing[] = [];
  return {
    getCursor: async (_db: unknown, c: string) => cursors[c] ?? null,
    setCursor: async (_db: unknown, c: string, v: unknown) => { cursors[c] = v; },
    upsertRawListings: async (_db: unknown, ls: RawListing[]) => { saved.push(...ls); return { inserted: ls.length, updated: 0 }; },
    __state: { cursors, saved },
  };
});
const db = await import("@pcg/db") as unknown as { __state: { cursors: Record<string, unknown>; saved: RawListing[] } };

const listing = (id: string): RawListing => ({ source: "yahoo_auc", sourceItemId: id, url: "u", title: "t", description: null, price: 1, currency: "JPY", kind: "sold", soldAt: null, endedAt: null, isBestOffer: false, sellerCountry: "JP", externalItemId: null, imageUrls: [], metadata: {}, raw: {} });

describe("soldConnectorJob", () => {
  it("persists page then cursor, and reports stats", async () => {
    const conn = { name: "yahoo_auc" as const, async *fetchSold() { yield { listings: [listing("a"), listing("b")], nextCursor: { p: 2 } }; yield { listings: [listing("c")], nextCursor: { p: 3 } }; } };
    const stats = await soldConnectorJob(conn)({ db: {} as never, log: () => {} });
    expect(stats).toMatchObject({ items_seen: 3, items_new: 3 });
    expect(db.__state.cursors["yahoo_auc"]).toEqual({ p: 3 });
  });
  it("stops cleanly on PausedError and keeps the last committed cursor", async () => {
    const conn = { name: "yahoo_auc" as const, async *fetchSold() { yield { listings: [listing("d")], nextCursor: { p: 9 } }; throw new PausedError(429, "x"); } };
    const stats = await soldConnectorJob(conn)({ db: {} as never, log: () => {} });
    expect(stats.items_new).toBe(1);
    expect(db.__state.cursors["yahoo_auc"]).toEqual({ p: 9 });
  });
  it("marks suspect when a page reports it", async () => {
    const conn = { name: "yahoo_auc" as const, async *fetchSold() { yield { listings: [], nextCursor: null, suspect: true }; } };
    expect((await soldConnectorJob(conn)({ db: {} as never, log: () => {} })).suspect).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pcg/ingest test -- sold-connector`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/ingest/src/jobs/sold-connector.ts`:
```ts
import type { Job } from "../run";
import { PausedError, type Connector } from "@pcg/connectors";
import { getCursor, setCursor, upsertRawListings } from "@pcg/db";

export function soldConnectorJob(connector: Connector): Job {
  return async ({ db, log }) => {
    const stats = { items_seen: 0, items_new: 0, items_updated: 0, suspect: false };
    const cursor = await getCursor(db, connector.name);
    try {
      for await (const page of connector.fetchSold(cursor)) {
        if (page.suspect) { stats.suspect = true; log("suspect page: 0 items parsed; cursor not advanced"); continue; }
        const r = await upsertRawListings(db, page.listings);
        stats.items_seen += page.listings.length; stats.items_new += r.inserted; stats.items_updated += r.updated;
        if (page.nextCursor !== undefined) await setCursor(db, connector.name, page.nextCursor);
      }
    } catch (e) {
      if (e instanceof PausedError) { log(`paused by ${e.status}; will resume next run`); return stats; }
      throw e;
    }
    return stats;
  };
}
```

`apps/ingest/src/jobs/ebay-sold.ts`:
```ts
import { theCardApi } from "@pcg/connectors";
import { soldConnectorJob } from "./sold-connector";
export const ebaySold = soldConnectorJob(theCardApi);
```

`apps/ingest/src/jobs/yahoo-auctions.ts`:
```ts
import { yahooAuctions } from "@pcg/connectors";
import { soldConnectorJob } from "./sold-connector";
export const yahooAuctionsJob = soldConnectorJob(yahooAuctions);
```

- [ ] **Step 4: Run tests, then one real run each**

Run: `pnpm --filter @pcg/ingest test && pnpm ingest yahoo:auctions && pnpm ingest ebay:sold`
Expected: tests PASS; Yahoo run ends `ok: seen=N new=N` for N > 0; The Card API run likewise (or `skipped` if `CONNECTOR_THECARDAPI=off`). Verify: `psql "$DATABASE_URL" -c "select source, kind, count(*) from raw_listings group by 1,2;"`.

- [ ] **Step 5: Commit**

```bash
git add apps/ingest
git commit -m "feat(ingest): sold-listing jobs with per-page cursor commits and pause handling"
```

---

### Task 18: Match and prices jobs, title regression test

**Files:**
- Create: `apps/ingest/src/jobs/match.ts`, `apps/ingest/src/jobs/prices.ts`, `packages/domain/test/titles-regression.test.ts`

**Interfaces:**
- Produces: `matchJob(opts: { all: boolean }): Job`, `pricesJob: Job`
- Consumes: `loadCatalog`, `loadListingsToMatch`, `upsertMatches`, `loadMatchedSales`, `replacePricePoints` (Task 9); `matchListing`, `MATCHER_VERSION`, `computePricePoints` (Tasks 6–7); `lookupCert` (Task 14).

- [ ] **Step 1: Regression test over real titles**

`packages/domain/test/titles-regression.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { InMemoryCatalog, matchListing, type SetRef, type ProductRef } from "../src";

// Fixture produced by spikes/count-coverage.ts (Task 15). Skipped until it exists.
const path = new URL("./fixtures/titles.json", import.meta.url);
const titles: { source: "yahoo_auc" | "thecardapi"; title: string; expect: "matched" | "needs_review" }[] = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
const catalogPath = new URL("./fixtures/catalog-sample.json", import.meta.url);
const cat: { sets: SetRef[]; products: ProductRef[] } = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, "utf8")) : { sets: [], products: [] };
const catalog = new InMemoryCatalog(cat.sets, cat.products);

describe.skipIf(titles.length === 0)("real titles never produce a wrong match", () => {
  for (const t of titles) {
    it(t.title, () => {
      const r = matchListing({ source: t.source, title: t.title, description: null, metadata: {}, cert: null }, catalog);
      // A title annotated needs_review must never be auto-matched; matched ones may still route to review if the sample catalog lacks the set.
      if (t.expect === "needs_review") expect(r.state).not.toBe("matched");
      else expect(["matched", "needs_review"]).toContain(r.state);
    });
  }
});
```
Create `packages/domain/test/fixtures/catalog-sample.json` by exporting the sets and products the fixture titles refer to:
```bash
psql "$DATABASE_URL" -At -c "select json_build_object('sets',(select json_agg(json_build_object('id',id,'printedCode',printed_code,'language',language,'cardCount',card_count,'nameEn',name_en,'nameJa',name_ja,'aliases',aliases)) from sets),'products',(select json_agg(json_build_object('id',id,'setId',set_id,'numberNum',number_num,'numberDenom',number_denom,'numberSuffix',number_suffix,'language',language)) from products where language='ja' and set_id in (select id from sets where release_date > '2022-01-01')))" > packages/domain/test/fixtures/catalog-sample.json
```

- [ ] **Step 2: Implement the match job**

`apps/ingest/src/jobs/match.ts`:
```ts
import type { Job } from "../run";
import { loadCatalog, loadListingsToMatch, upsertMatches, type MatchRow } from "@pcg/db";
import { matchListing, MATCHER_VERSION, type CertRecord, type EbayMetadata } from "@pcg/domain";
import { lookupCert } from "@pcg/connectors";

export function matchJob(opts: { all: boolean }): Job {
  return async ({ db, log }) => {
    const catalog = await loadCatalog(db);
    const listings = await loadListingsToMatch(db, opts);
    log(`matching ${listings.length} listings (all=${opts.all}) with matcher v${MATCHER_VERSION}`);
    const rows: MatchRow[] = [];
    let matched = 0;
    for (const l of listings) {
      const md = l.metadata as EbayMetadata;
      let cert: CertRecord | null = null;
      if (l.source === "thecardapi" && md.certNumber) cert = await lookupCert(md.certNumber, { timeoutMs: 3000 });
      const r = matchListing({ source: l.source, title: l.title, description: l.description, metadata: l.metadata, cert }, catalog);
      if (r.state === "matched") matched++;
      rows.push({ ...r, rawListingId: l.id, matcherVersion: MATCHER_VERSION });
    }
    await upsertMatches(db, rows);
    log(`matched=${matched} review=${rows.filter((r) => r.state === "needs_review").length} rejected=${rows.filter((r) => r.state === "rejected").length}`);
    return { items_seen: listings.length, items_new: matched, items_updated: rows.length - matched };
  };
}
```

`apps/ingest/src/jobs/prices.ts`:
```ts
import type { Job } from "../run";
import { loadMatchedSales, replacePricePoints } from "@pcg/db";
import { computePricePoints } from "@pcg/domain";

export const pricesJob: Job = async ({ db, log }) => {
  const sales = await loadMatchedSales(db);
  const points = computePricePoints(sales, new Date());
  await replacePricePoints(db, points);
  log(`${sales.length} sales → ${points.length} price points`);
  return { items_seen: sales.length, items_new: points.length, items_updated: 0 };
};
```

- [ ] **Step 3: Run**

Run: `pnpm test && pnpm ingest match && pnpm ingest prices`
Expected: all tests PASS (regression suite runs once the fixture exists); match logs counts; prices logs `N sales → M price points`. Verify: `psql "$DATABASE_URL" -c "select state, review_reason, count(*) from listing_matches group by 1,2 order by 3 desc;" -c "select count(*) from price_points;"`.

- [ ] **Step 4: Commit**

```bash
git add apps/ingest packages/domain
git commit -m "feat(ingest): match and prices jobs; real-title regression suite"
```

---

### Task 19: GitHub Actions cron

**Files:**
- Create: `.github/workflows/ingest.yml`

- [ ] **Step 1: Workflow**

```yaml
name: ingest
on:
  schedule:
    - cron: "5 */6 * * *"     # sold sources, every 6h
    - cron: "35 3 * * *"      # fx daily
    - cron: "50 3 * * 1"      # catalog weekly (Mon)
  workflow_dispatch:
    inputs:
      job:
        description: "job name (catalog:tcgdex | ebay:sold | yahoo:auctions | fx:daily | match | prices)"
        required: true

concurrency:
  group: ingest-${{ github.event.inputs.job || github.event.schedule }}
  cancel-in-progress: false

env:
  SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
  THECARDAPI_KEY: ${{ secrets.THECARDAPI_KEY }}
  CONTACT_EMAIL: ${{ secrets.CONTACT_EMAIL }}
  CONNECTOR_THECARDAPI: ${{ vars.CONNECTOR_THECARDAPI || 'on' }}
  CONNECTOR_YAHOO_AUC: ${{ vars.CONNECTOR_YAHOO_AUC || 'on' }}

jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      jobs: ${{ steps.pick.outputs.jobs }}
    steps:
      - id: pick
        run: |
          if [ -n "${{ github.event.inputs.job }}" ]; then echo 'jobs=["${{ github.event.inputs.job }}"]' >> "$GITHUB_OUTPUT"
          elif [ "${{ github.event.schedule }}" = "35 3 * * *" ]; then echo 'jobs=["fx:daily"]' >> "$GITHUB_OUTPUT"
          elif [ "${{ github.event.schedule }}" = "50 3 * * 1" ]; then echo 'jobs=["catalog:tcgdex"]' >> "$GITHUB_OUTPUT"
          else echo 'jobs=["yahoo:auctions","ebay:sold"]' >> "$GITHUB_OUTPUT"; fi

  run:
    needs: setup
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        job: ${{ fromJson(needs.setup.outputs.jobs) }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm ingest ${{ matrix.job }}

  derive:
    needs: run
    if: always() && needs.run.result != 'skipped' && !contains(fromJson(needs.setup.outputs.jobs), 'match')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm ingest match
      - run: pnpm ingest prices
```

- [ ] **Step 2: Configure secrets and verify**

In the GitHub repo: Settings → Secrets → add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `THECARDAPI_KEY`, `CONTACT_EMAIL`. Push, then Actions → ingest → Run workflow with `job = fx:daily`.
Expected: green run; a new `ingest_runs` row with `job='fx:daily', status='ok'`; the `derive` job then runs `match` and `prices`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ingest.yml
git commit -m "ci: scheduled ingest workflow (6h sold, daily fx, weekly catalog, derive after each)"
```

---

## Phase 7 — Web app

### Task 20: Next.js scaffold, Supabase clients, search library

**Files:**
- Create: `apps/web/` via `create-next-app`, then `apps/web/lib/supabase-server.ts`, `apps/web/lib/search.ts`, `apps/web/lib/format.ts`, `apps/web/app/layout.tsx`
- Test: `apps/web/test/search.test.ts`, `apps/web/test/format.test.ts`

**Interfaces:**
- Produces:
  - `anonClient()` (server, anon key, RLS-scoped) and `serviceClient()` (server only, service role) in `lib/supabase-server.ts`
  - `searchProducts(db, q: string): Promise<SearchResult[]>` where `SearchResult = { id: string; nameEn: string | null; nameJa: string | null; setName: string; numberPrinted: string; language: "ja" | "en"; imageUrl: string | null; pcg10Median: number | null; saleCount: number }`; cert input resolves via `lookupCert` → `/card/{id}` redirect target `{ redirectTo: string }`
  - `fmtUsd(n)`, `fmtNative(amount, currency)`, `fmtDate(iso)`, `gradeLabelText(value, label)`

- [ ] **Step 1: Scaffold**

Run:
```bash
cd apps && pnpm dlx create-next-app@15 web --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-pnpm --no-turbopack && cd ..
```
Then in `apps/web/package.json` set `"name": "@pcg/web"`, add dependencies `"@supabase/supabase-js": "^2.45.0"`, `"@supabase/ssr": "^0.5.0"`, `"@pcg/domain": "workspace:*"`, `"@pcg/connectors": "workspace:*"`, `"recharts": "^2.12.0"`, devDependency `"vitest": "^2.1.0"`, scripts `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`. Add `apps/web/vitest.config.ts` (`include: ["test/**/*.test.ts"]`). Add `transpilePackages: ["@pcg/domain", "@pcg/connectors"]` to `next.config.ts`. Run `pnpm install`.

- [ ] **Step 2: Failing tests**

`apps/web/test/format.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { fmtUsd, fmtNative, gradeLabelText } from "../lib/format";

describe("format", () => {
  it("usd", () => expect(fmtUsd(118.4)).toBe("$118"));
  it("native jpy has no decimals", () => expect(fmtNative(18500, "JPY")).toBe("¥18,500"));
  it("grade text", () => {
    expect(gradeLabelText(10, "any")).toBe("10");
    expect(gradeLabelText(10, "Pristine")).toBe("10 Pristine");
    expect(gradeLabelText(9.5, "any")).toBe("9.5");
    expect(gradeLabelText(null, "Authentic")).toBe("Authentic");
  });
});
```

`apps/web/test/search.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { searchProducts } from "../lib/search";

function db(rpcResult: unknown[], products: unknown[], points: unknown[] = []) {
  return {
    rpc: vi.fn(async () => ({ data: rpcResult, error: null })),
    from: vi.fn((t: string) => ({
      select: () => ({
        in: async () => ({ data: t === "products" ? products : points, error: null }),
        eq: () => ({ eq: () => ({ eq: () => ({ in: async () => ({ data: points, error: null }) }) }) }),
      }),
    })),
  } as never;
}

describe("searchProducts", () => {
  it("number-shaped input calls search_products_by_number and hydrates", async () => {
    const d = db([{ id: "SV1a-073", sale_count: 4 }], [{ id: "SV1a-073", name_en: null, name_ja: "デカヌチャン", number_printed: "073/073", language: "ja", image_url: null, sets: { name_en: null, name_ja: "トリプレットビート" } }], [{ product_id: "SV1a-073", median_usd: 42 }]);
    const r = await searchProducts(d, "080/090".replace("080/090", "073/073"));
    expect(r).toEqual({ results: [{ id: "SV1a-073", nameEn: null, nameJa: "デカヌチャン", setName: "トリプレットビート", numberPrinted: "073/073", language: "ja", imageUrl: null, pcg10Median: 42, saleCount: 4 }] });
    expect((d as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("search_products_by_number", { p_num: 73, p_denom: 73, p_suffix: null, lim: 30 });
  });
  it("name input calls search_products_by_name", async () => {
    const d = db([], []);
    await searchProducts(d, "Charizard");
    expect((d as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("search_products_by_name", { q: "Charizard", lim: 30 });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @pcg/web test`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`apps/web/lib/supabase-server.ts`:
```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function anonClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
}
export function serviceClient(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}
```

`apps/web/lib/format.ts`:
```ts
export const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export function fmtNative(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: currency === "JPY" ? 0 : 2 }).format(amount);
}
export const fmtDate = (iso: string) => iso.slice(0, 10);
export function gradeLabelText(value: number | null, label: string | null) {
  if (value == null) return label ?? "—";
  const v = Number.isInteger(value) ? String(value) : String(value);
  return label && label !== "any" ? `${v} ${label}` : v;
}
```

`apps/web/lib/search.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifySearch } from "@pcg/domain";
import { lookupCert } from "@pcg/connectors";

export interface SearchResult { id: string; nameEn: string | null; nameJa: string | null; setName: string; numberPrinted: string; language: "ja" | "en"; imageUrl: string | null; pcg10Median: number | null; saleCount: number }
export type SearchOutcome = { results: SearchResult[] } | { redirectTo: string };

async function hydrate(db: SupabaseClient, hits: { id: string; sale_count: number }[]): Promise<SearchResult[]> {
  if (hits.length === 0) return [];
  const ids = hits.map((h) => h.id);
  const { data: products } = await db.from("products").select("id,name_en,name_ja,number_printed,language,image_url,sets(name_en,name_ja)").in("id", ids);
  const { data: points } = await db.from("price_points").select("product_id,median_usd").eq("grade_value", 10).eq("grade_label", "any").eq("window", "90d").in("product_id", ids);
  const med = new Map((points ?? []).map((p: { product_id: string; median_usd: number }) => [p.product_id, Number(p.median_usd)]));
  const byId = new Map((products ?? []).map((p: Record<string, unknown>) => [p.id as string, p]));
  return hits.flatMap((h) => {
    const p = byId.get(h.id) as { name_en: string | null; name_ja: string | null; number_printed: string; language: "ja" | "en"; image_url: string | null; sets: { name_en: string | null; name_ja: string | null } } | undefined;
    if (!p) return [];
    return [{ id: h.id, nameEn: p.name_en, nameJa: p.name_ja, setName: p.sets?.name_en ?? p.sets?.name_ja ?? "", numberPrinted: p.number_printed, language: p.language, imageUrl: p.image_url, pcg10Median: med.get(h.id) ?? null, saleCount: h.sale_count }];
  });
}

export async function searchProducts(db: SupabaseClient, q: string): Promise<SearchOutcome> {
  const shape = classifySearch(q);
  if (shape.kind === "cert") {
    const cert = await lookupCert(shape.cert, { timeoutMs: 3000 });
    if (cert) {
      // Resolve set+number the same way the matcher does, via the SQL number search filtered to the cert's number.
      const n = classifySearch(cert.cardNumber);
      if (n.kind === "number") {
        const { data } = await db.rpc("search_products_by_number", { p_num: n.number.num, p_denom: n.number.denom, p_suffix: n.number.suffix, lim: 5 });
        const first = (data as { id: string }[] | null)?.[0];
        if (first) return { redirectTo: `/card/${encodeURIComponent(first.id)}?cert=${cert.gradedId}` };
      }
    }
    // Fall through to the number path (a 9-digit string may be a lot number or typo).
  }
  if (shape.kind === "number" || shape.kind === "cert") {
    const n = shape.kind === "number" ? shape.number : { num: parseInt(shape.cert, 10), denom: null, suffix: null, printed: shape.cert };
    const { data } = await db.rpc("search_products_by_number", { p_num: n.num, p_denom: n.denom, p_suffix: n.suffix, lim: 30 });
    return { results: await hydrate(db, (data as { id: string; sale_count: number }[] | null) ?? []) };
  }
  const { data } = await db.rpc("search_products_by_name", { q: shape.q, lim: 30 });
  return { results: await hydrate(db, (data as { id: string; sale_count: number }[] | null) ?? []) };
}
```

`apps/web/app/layout.tsx`:
```tsx
import "./globals.css";
import Link from "next/link";
export const metadata = { title: "PCG Markets", description: "What PCG-graded Pokémon cards actually sell for", manifest: "/manifest.webmanifest" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b bg-white"><div className="mx-auto max-w-5xl px-4 py-3"><Link href="/" className="font-semibold">PCG Markets</Link></div></header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 py-8 text-xs text-zinc-500">
        Not affiliated with eBay or LY Corporation. Card images © The Pokémon Company / Nintendo / Creatures / GAME FREAK, served from TCGdex. Prices are observed sales, not offers.
      </footer>
    </body></html>
  );
}
```

- [ ] **Step 5: Run tests, commit**

Run: `pnpm --filter @pcg/web test && pnpm --filter @pcg/web typecheck`
Expected: PASS.

```bash
git add apps/web
git commit -m "feat(web): Next.js scaffold, Supabase clients, search library, formatters"
```

---

### Task 21: Search API and home page

**Files:**
- Create: `apps/web/app/api/search/route.ts`, `apps/web/components/SearchBox.tsx`, `apps/web/components/ResultCard.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Produces: `GET /api/search?q=` → `SearchOutcome` JSON; home page with `<SearchBox>` that navigates on redirect and renders `<ResultCard>` rows.

- [ ] **Step 1: API route**

`apps/web/app/api/search/route.ts`:
```ts
import { NextResponse } from "next/server";
import { anonClient } from "@/lib/supabase-server";
import { searchProducts } from "@/lib/search";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });
  return NextResponse.json(await searchProducts(anonClient(), q));
}
```

- [ ] **Step 2: Components and page**

`apps/web/components/ResultCard.tsx`:
```tsx
import Link from "next/link";
import type { SearchResult } from "@/lib/search";
import { fmtUsd } from "@/lib/format";

export function ResultCard({ r }: { r: SearchResult }) {
  return (
    <Link href={`/card/${encodeURIComponent(r.id)}`} className="flex items-center gap-3 rounded-lg border bg-white p-3 hover:border-zinc-400">
      {r.imageUrl ? <img src={r.imageUrl} alt="" className="h-20 w-14 rounded object-cover" /> : <div className="h-20 w-14 rounded bg-zinc-100" />}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{r.nameEn ?? r.nameJa}</div>
        {r.nameEn && r.nameJa && <div className="truncate text-sm text-zinc-500">{r.nameJa}</div>}
        <div className="text-sm text-zinc-600">{r.setName} · {r.numberPrinted} · <span className="rounded bg-zinc-100 px-1 text-xs uppercase">{r.language}</span></div>
      </div>
      <div className="text-right">
        <div className="text-xs text-zinc-500">PCG 10 · 90d</div>
        <div className="font-semibold">{r.pcg10Median != null ? fmtUsd(r.pcg10Median) : "—"}</div>
        <div className="text-xs text-zinc-500">{r.saleCount} sales</div>
      </div>
    </Link>
  );
}
```

`apps/web/components/SearchBox.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchOutcome, SearchResult } from "@/lib/search";
import { ResultCard } from "./ResultCard";

export function SearchBox({ initialQuery = "" }: { initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const out = (await res.json()) as SearchOutcome;
      setBusy(false);
      if ("redirectTo" in out) router.push(out.redirectTo);
      else setResults(out.results);
    }, 250);
    return () => clearTimeout(t);
  }, [q, router]);

  return (
    <div className="space-y-4">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Card number (080/090), name, or 9-digit PCG cert"
        className="w-full rounded-lg border px-4 py-3 text-lg shadow-sm" inputMode="search" />
      {busy && <div className="text-sm text-zinc-500">Searching…</div>}
      <div className="grid gap-2">{results.map((r) => <ResultCard key={r.id} r={r} />)}</div>
      {!busy && q.trim().length >= 2 && results.length === 0 && <div className="text-sm text-zinc-500">No cards found.</div>}
    </div>
  );
}
```

`apps/web/app/page.tsx`:
```tsx
import { SearchBox } from "@/components/SearchBox";
export default function Home() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold">What did PCG slabs actually sell for?</h1>
        <p className="text-zinc-600">Search by card number first — that's the fastest way to the right printing.</p></div>
      <SearchBox />
    </div>
  );
}
```

- [ ] **Step 3: Verify in the browser**

Run: `cp .env.example apps/web/.env.local` (fill the `NEXT_PUBLIC_*` and `SUPABASE_*` values), then `pnpm web`. Open http://localhost:3000, type `073/073`.
Expected: result rows appear with set name, number and a language badge; clicking one navigates to `/card/SV1a-073` (404 until Task 22).

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): search API, search box and result cards"
```

---

### Task 22: Card page — price grid, sold list, chart

**Files:**
- Create: `apps/web/app/card/[id]/page.tsx`, `apps/web/lib/card-data.ts`, `apps/web/components/PriceGrid.tsx`, `apps/web/components/SoldList.tsx`, `apps/web/components/PriceChart.tsx`
- Test: `apps/web/test/card-data.test.ts`

**Interfaces:**
- Produces:
  - `loadCard(db, id): Promise<CardPageData | null>` with `CardPageData = { product: {...}; set: {...}; points: PricePointRow[]; sales: SaleRow[] }`
  - `gridColumns(points: PricePointRow[], window: Window): GridColumn[]` — `'any'` column for every grade; tier columns for 10 only when `n_sales >= 2` (spec §9)

- [ ] **Step 1: Failing test for grid column logic**

`apps/web/test/card-data.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pcg/web test -- card-data`
Expected: FAIL.

- [ ] **Step 3: Implement data loader and grid logic**

`apps/web/lib/card-data.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { TIERS } from "@pcg/domain";
import { gradeLabelText } from "./format";

export interface PricePointRow { product_id: string; grade_value: number; grade_label: string; window: string; n_sales: number; median_usd: number; min_usd: number; max_usd: number; last_sold_at: string; confidence: "high" | "med" | "low" }
export interface SaleRow { id: string; grade_value: number | null; grade_label: string | null; price: number; currency: string; price_usd: number | null; sold_at: string | null; source: string; url: string; is_best_offer: boolean }
export interface CardPageData {
  product: { id: string; name_en: string | null; name_ja: string | null; number_printed: string; language: "ja" | "en"; image_url: string | null };
  set: { id: string; name_en: string | null; name_ja: string | null; printed_code: string | null };
  points: PricePointRow[];
  sales: SaleRow[];
}
export interface GridColumn { title: string; point: PricePointRow }

export async function loadCard(db: SupabaseClient, id: string): Promise<CardPageData | null> {
  const { data: product } = await db.from("products").select("id,name_en,name_ja,number_printed,language,image_url,sets(id,name_en,name_ja,printed_code)").eq("id", id).maybeSingle();
  if (!product) return null;
  const [{ data: points }, { data: sales }] = await Promise.all([
    db.from("price_points").select("*").eq("product_id", id),
    db.from("public_sales").select("id,grade_value,grade_label,price,currency,price_usd,sold_at,source,url,is_best_offer").eq("product_id", id).order("sold_at", { ascending: false }).limit(200),
  ]);
  const { sets, ...p } = product as CardPageData["product"] & { sets: CardPageData["set"] };
  return { product: p, set: sets, points: (points ?? []) as PricePointRow[], sales: (sales ?? []) as SaleRow[] };
}

export function gridColumns(points: PricePointRow[], window: string): GridColumn[] {
  const inWin = points.filter((p) => p.window === window);
  const cols: GridColumn[] = [];
  for (const p of inWin) {
    if (p.grade_label === "any") cols.push({ title: gradeLabelText(Number(p.grade_value), "any"), point: p });
    else if (Number(p.grade_value) === 10 && (TIERS as string[]).includes(p.grade_label) && p.n_sales >= 2) cols.push({ title: gradeLabelText(10, p.grade_label), point: p });
  }
  const tierRank = (l: string) => (l === "any" ? 3 : TIERS.indexOf(l as (typeof TIERS)[number]));
  return cols.sort((a, b) => Number(b.point.grade_value) - Number(a.point.grade_value) || tierRank(a.point.grade_label) - tierRank(b.point.grade_label));
}
```

- [ ] **Step 4: Components and page**

`apps/web/components/PriceGrid.tsx`:
```tsx
import type { GridColumn } from "@/lib/card-data";
import { fmtUsd } from "@/lib/format";
const dot = { high: "bg-green-500", med: "bg-amber-500", low: "bg-zinc-400" } as const;
export function PriceGrid({ columns, window }: { columns: GridColumn[]; window: string }) {
  if (columns.length === 0) return <div className="rounded-lg border bg-white p-6 text-zinc-500">No PCG sales recorded in this window yet.</div>;
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-2">
        {columns.map((c) => (
          <div key={c.title} className="min-w-[8.5rem] rounded-lg border bg-white p-3">
            <div className="text-xs font-medium text-zinc-500">PCG {c.title}</div>
            <div className="text-2xl font-semibold">{fmtUsd(Number(c.point.median_usd))}</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500"><span className={`inline-block h-2 w-2 rounded-full ${dot[c.point.confidence]}`} />{c.point.n_sales} sale{c.point.n_sales === 1 ? "" : "s"} · {c.point.confidence}</div>
          </div>
        ))}
      </div>
      <div className="mt-1 text-xs text-zinc-500">Median of matched sales in the last {window === "all" ? "all time" : window} · USD at ECB rate on sale date</div>
    </div>
  );
}
```

`apps/web/components/SoldList.tsx`:
```tsx
import type { SaleRow } from "@/lib/card-data";
import { fmtDate, fmtNative, fmtUsd, gradeLabelText } from "@/lib/format";
const sourceName: Record<string, string> = { thecardapi: "eBay", yahoo_auc: "Yahoo! Auctions" };
export function SoldList({ sales }: { sales: SaleRow[] }) {
  if (sales.length === 0) return null;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-zinc-500"><tr><th className="py-1">Date</th><th>Grade</th><th>Price</th><th>Source</th><th></th></tr></thead>
      <tbody>
        {sales.map((s) => (
          <tr key={s.id} className="border-t">
            <td className="py-2">{s.sold_at ? fmtDate(s.sold_at) : "—"}</td>
            <td>PCG {gradeLabelText(s.grade_value == null ? null : Number(s.grade_value), s.grade_label)}</td>
            <td>{s.is_best_offer ? "≤ " : ""}{fmtNative(Number(s.price), s.currency)}{s.currency !== "USD" && s.price_usd != null && <span className="text-zinc-500"> ({fmtUsd(Number(s.price_usd))})</span>}</td>
            <td>{sourceName[s.source] ?? s.source}</td>
            <td><a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-blue-600">↗</a></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

`apps/web/components/PriceChart.tsx`:
```tsx
"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { SaleRow } from "@/lib/card-data";
export function PriceChart({ sales }: { sales: SaleRow[] }) {
  const usable = sales.filter((s) => s.sold_at && s.price_usd != null && !s.is_best_offer && s.grade_value != null);
  if (usable.length < 2) return null;
  const grades = [...new Set(usable.map((s) => String(s.grade_value)))].sort((a, b) => Number(b) - Number(a));
  const data = usable.map((s) => ({ date: s.sold_at!.slice(0, 10), [String(s.grade_value)]: Number(s.price_usd) })).sort((a, b) => a.date.localeCompare(b.date));
  const colors = ["#111827", "#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed"];
  return (
    <div className="h-64 rounded-lg border bg-white p-2">
      <ResponsiveContainer><LineChart data={data}>
        <XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `$${v}`} /><Tooltip /><Legend />
        {grades.map((g, i) => <Line key={g} type="monotone" dataKey={g} name={`PCG ${g}`} stroke={colors[i % colors.length]} connectNulls dot />)}
      </LineChart></ResponsiveContainer>
    </div>
  );
}
```

`apps/web/app/card/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { anonClient } from "@/lib/supabase-server";
import { loadCard, gridColumns } from "@/lib/card-data";
import { PriceGrid } from "@/components/PriceGrid";
import { SoldList } from "@/components/SoldList";
import { PriceChart } from "@/components/PriceChart";

export const revalidate = 900;
const WINDOWS = ["30d", "90d", "180d", "all"];

export default async function CardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ w?: string; cert?: string }> }) {
  const { id } = await params; const { w, cert } = await searchParams;
  const window = WINDOWS.includes(w ?? "") ? w! : "90d";
  const data = await loadCard(anonClient(), decodeURIComponent(id));
  if (!data) notFound();
  const { product, set, points, sales } = data;
  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        {product.image_url && <img src={product.image_url} alt="" className="h-48 w-auto rounded-lg shadow" />}
        <div>
          <h1 className="text-2xl font-semibold">{product.name_en ?? product.name_ja}</h1>
          {product.name_en && product.name_ja && <div className="text-zinc-600">{product.name_ja}</div>}
          <div className="mt-1 text-zinc-600">{set.name_en ?? set.name_ja} {set.printed_code && <span className="text-zinc-400">({set.printed_code})</span>} · {product.number_printed} · <span className="rounded bg-zinc-100 px-1 text-xs uppercase">{product.language}</span></div>
          {cert && <div className="mt-2 text-sm text-green-700">Cert {cert} resolved to this card.</div>}
        </div>
      </div>
      <section className="space-y-2">
        <div className="flex items-center justify-between"><h2 className="font-semibold">PCG price</h2>
          <div className="flex gap-1 text-sm">{WINDOWS.map((x) => <Link key={x} href={`?w=${x}`} className={`rounded px-2 py-1 ${x === window ? "bg-zinc-900 text-white" : "bg-white border"}`}>{x}</Link>)}</div></div>
        <PriceGrid columns={gridColumns(points, window)} window={window} />
      </section>
      <section className="space-y-2"><h2 className="font-semibold">Sold</h2><SoldList sales={sales} /></section>
      <section className="space-y-2"><h2 className="font-semibold">Over time</h2><PriceChart sales={sales} /></section>
    </div>
  );
}
```

- [ ] **Step 5: Run tests and verify in browser**

Run: `pnpm --filter @pcg/web test && pnpm web`. Open a card that has sales (find one: `psql "$DATABASE_URL" -c "select product_id, count(*) from public_sales group by 1 order by 2 desc limit 3;"`).
Expected: grid shows one card per grade with `n` and a confidence dot; tier columns only for 10s with ≥2 sales; sold rows link out; chart renders when ≥2 sales.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): card page with grade price grid, sold list and chart"
```

---

### Task 23: Admin auth gate and review queue

**Files:**
- Create: `apps/web/lib/admin.ts`, `apps/web/app/admin/layout.tsx`, `apps/web/app/admin/login/page.tsx`, `apps/web/app/auth/callback/route.ts`, `apps/web/app/admin/review/page.tsx`, `apps/web/app/admin/review/actions.ts`, `apps/web/components/ReviewRow.tsx`, `apps/web/middleware.ts`

**Interfaces:**
- Produces:
  - `requireAdmin(): Promise<{ email: string }>` — throws `redirect("/admin/login")` unless the Supabase session email is in `admin_users`
  - Server actions `resolveListing(rawListingId, { productId, gradeValue, gradeLabel })` and `rejectListing(rawListingId)` — write `listing_matches` with `is_override = true`, `match_method = 'admin'`, `resolved_by`, `resolved_at`.

- [ ] **Step 1: Auth plumbing (Supabase magic link)**

In the Supabase dashboard: Authentication → Providers → Email: enable; Authentication → URL configuration: add `http://localhost:3000/auth/callback` and the Vercel URL. Insert your email: `psql "$DATABASE_URL" -c "insert into admin_users(email) values ('you@example.com');"`.

`apps/web/lib/admin.ts`:
```ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { serviceClient } from "./supabase-server";

export async function sessionClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => store.getAll(), setAll: (all) => { for (const c of all) store.set(c.name, c.value, c.options); } },
  });
}

export async function requireAdmin(): Promise<{ email: string }> {
  const sb = await sessionClient();
  const { data } = await sb.auth.getUser();
  const email = data.user?.email;
  if (!email) redirect("/admin/login");
  const { data: row } = await serviceClient().from("admin_users").select("email").eq("email", email).maybeSingle();
  if (!row) redirect("/admin/login?denied=1");
  return { email };
}
```

`apps/web/app/admin/login/page.tsx`:
```tsx
"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
export default function Login() {
  const [email, setEmail] = useState(""); const [sent, setSent] = useState(false);
  const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return (
    <form className="max-w-sm space-y-3" onSubmit={async (e) => { e.preventDefault(); await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback?next=/admin/review` } }); setSent(true); }}>
      <h1 className="text-xl font-semibold">Admin login</h1>
      <input className="w-full rounded border px-3 py-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" required />
      <button className="rounded bg-zinc-900 px-3 py-2 text-white">Send magic link</button>
      {sent && <div className="text-sm text-green-700">Check your email.</div>}
    </form>
  );
}
```

`apps/web/app/auth/callback/route.ts`:
```ts
import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/admin";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) await (await sessionClient()).auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(url.searchParams.get("next") ?? "/admin/review", url.origin));
}
```

`apps/web/middleware.ts` (refreshes the session cookie on admin routes):
```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: (all) => { for (const c of all) res.cookies.set(c.name, c.value, c.options); } },
  });
  await sb.auth.getUser();
  return res;
}
export const config = { matcher: ["/admin/:path*"] };
```

`apps/web/app/admin/layout.tsx`:
```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireAdmin();
  return (
    <div className="space-y-4">
      <nav className="flex gap-4 text-sm"><Link href="/admin/review">Review queue</Link><Link href="/admin/health">Health</Link><span className="ml-auto text-zinc-500">{email}</span></nav>
      {children}
    </div>
  );
}
```
Note: `/admin/login` lives under `/admin` but must not be gated — move it to `apps/web/app/(public)/admin-login/page.tsx` routed at `/admin-login`, and point `requireAdmin` redirects there. (Keep whichever path you choose consistent in all three files.)

- [ ] **Step 2: Server actions**

`apps/web/app/admin/review/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { serviceClient } from "@/lib/supabase-server";
import { MATCHER_VERSION } from "@pcg/domain";

export async function resolveListing(rawListingId: string, input: { productId: string; gradeValue: number | null; gradeLabel: string | null }) {
  const { email } = await requireAdmin();
  const { error } = await serviceClient().from("listing_matches").upsert({
    raw_listing_id: rawListingId, state: "matched", product_id: input.productId, grade_value: input.gradeValue,
    grade_label: input.gradeValue === 10 || input.gradeValue == null ? input.gradeLabel : null,
    match_method: "admin", review_reason: null, is_override: true, matcher_version: MATCHER_VERSION,
    resolved_by: email, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "raw_listing_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/review");
}

export async function rejectListing(rawListingId: string) {
  const { email } = await requireAdmin();
  const { error } = await serviceClient().from("listing_matches").upsert({
    raw_listing_id: rawListingId, state: "rejected", product_id: null, grade_value: null, grade_label: null,
    match_method: "admin", review_reason: "other", is_override: true, matcher_version: MATCHER_VERSION,
    resolved_by: email, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "raw_listing_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/review");
}
```

- [ ] **Step 3: Queue page and row**

`apps/web/components/ReviewRow.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import { resolveListing, rejectListing } from "@/app/admin/review/actions";
import type { SearchResult } from "@/lib/search";

const GRADES = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6, 5, 4, 3, 2, 1];
export interface ReviewItem { id: string; title: string; description: string | null; price: number; currency: string; url: string; imageUrls: string[]; reason: string | null; extracted: Record<string, unknown> }

export function ReviewRow({ item }: { item: ReviewItem }) {
  const [q, setQ] = useState(""); const [hits, setHits] = useState<SearchResult[]>([]); const [pick, setPick] = useState<SearchResult | null>(null);
  const [grade, setGrade] = useState<string>(String(item.extracted.grade ?? "10")); const [label, setLabel] = useState<string>("");
  const [pending, start] = useTransition();
  async function search(v: string) { setQ(v); if (v.length < 2) return setHits([]); const r = await fetch(`/api/search?q=${encodeURIComponent(v)}`); const o = await r.json(); setHits("results" in o ? o.results : []); }
  return (
    <div className="grid gap-3 rounded-lg border bg-white p-3 md:grid-cols-[6rem_1fr_18rem]">
      {item.imageUrls[0] ? <img src={item.imageUrls[0]} alt="" className="h-24 w-24 rounded object-cover" /> : <div className="h-24 w-24 rounded bg-zinc-100" />}
      <div className="min-w-0 text-sm">
        <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-blue-700">{item.title}</a>
        <div className="text-zinc-600">{item.price} {item.currency} · <span className="rounded bg-amber-50 px-1 text-amber-800">{item.reason}</span></div>
        <div className="mt-1 text-xs text-zinc-500">found: {JSON.stringify(item.extracted)}</div>
        {item.description && <details className="mt-1 text-xs text-zinc-500"><summary>description</summary><pre className="whitespace-pre-wrap">{item.description}</pre></details>}
      </div>
      <div className="space-y-2 text-sm">
        <input className="w-full rounded border px-2 py-1" placeholder="find card: number / name" value={q} onChange={(e) => search(e.target.value)} />
        {hits.length > 0 && !pick && <ul className="max-h-40 overflow-auto rounded border">{hits.map((h) => <li key={h.id}><button className="w-full px-2 py-1 text-left hover:bg-zinc-100" onClick={() => { setPick(h); setHits([]); }}>{h.nameEn ?? h.nameJa} · {h.setName} · {h.numberPrinted} ({h.language})</button></li>)}</ul>}
        {pick && <div className="rounded bg-green-50 px-2 py-1">{pick.nameEn ?? pick.nameJa} · {pick.numberPrinted} <button className="ml-2 text-xs underline" onClick={() => setPick(null)}>change</button></div>}
        <div className="flex gap-2">
          <select className="rounded border px-2 py-1" value={grade} onChange={(e) => setGrade(e.target.value)}>{GRADES.map((g) => <option key={g} value={g}>{g}</option>)}<option value="authentic">Authentic</option></select>
          {grade === "10" && <select className="rounded border px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)}><option value="">tier unknown</option><option>Flawless</option><option>Pristine</option><option>Gem Mint</option></select>}
        </div>
        <div className="flex gap-2">
          <button disabled={!pick || pending} className="rounded bg-zinc-900 px-3 py-1 text-white disabled:opacity-40"
            onClick={() => start(() => resolveListing(item.id, { productId: pick!.id, gradeValue: grade === "authentic" ? null : Number(grade), gradeLabel: grade === "authentic" ? "Authentic" : label || null }))}>Assign</button>
          <button disabled={pending} className="rounded border px-3 py-1" onClick={() => start(() => rejectListing(item.id))}>Reject</button>
        </div>
      </div>
    </div>
  );
}
```

`apps/web/app/admin/review/page.tsx`:
```tsx
import { serviceClient } from "@/lib/supabase-server";
import { ReviewRow, type ReviewItem } from "@/components/ReviewRow";
export const dynamic = "force-dynamic";
export default async function Review() {
  const db = serviceClient();
  const { data: rows } = await db.from("listing_matches").select("raw_listing_id,review_reason,extracted,raw_listings(id,title,description,price,currency,url,image_urls,fetched_at)")
    .eq("state", "needs_review").order("updated_at", { ascending: false }).limit(50);
  const { data: counts } = await db.from("listing_matches").select("review_reason").eq("state", "needs_review");
  const byReason = new Map<string, number>();
  for (const c of counts ?? []) byReason.set(c.review_reason ?? "other", (byReason.get(c.review_reason ?? "other") ?? 0) + 1);
  const items: ReviewItem[] = (rows ?? []).map((r) => { const l = r.raw_listings as unknown as { id: string; title: string; description: string | null; price: number; currency: string; url: string; image_urls: string[] }; return { id: l.id, title: l.title, description: l.description, price: Number(l.price), currency: l.currency, url: l.url, imageUrls: l.image_urls ?? [], reason: r.review_reason, extracted: (r.extracted ?? {}) as Record<string, unknown> }; });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">{[...byReason.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="rounded bg-zinc-100 px-2 py-1">{k}: {v}</span>)}</div>
      {items.map((it) => <ReviewRow key={it.id} item={it} />)}
      {items.length === 0 && <div className="text-zinc-500">Queue is empty.</div>}
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run `pnpm web`, open `/admin/review`, log in via magic link, assign one queued listing to a card, then `pnpm ingest match` and `pnpm ingest prices`.
Expected: after re-running `match`, the override row still has `is_override = true, match_method = 'admin'` (`psql "$DATABASE_URL" -c "select state, match_method, is_override from listing_matches where resolved_by is not null;"`), and the card page shows the sale.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): admin magic-link auth, review queue with overrides"
```

---

### Task 24: Admin health page

**Files:**
- Create: `apps/web/app/admin/health/page.tsx`

- [ ] **Step 1: Page**

```tsx
import { serviceClient } from "@/lib/supabase-server";
export const dynamic = "force-dynamic";
export default async function Health() {
  const db = serviceClient();
  const [{ data: runs }, { data: state }, { data: bySource }, { data: byState }] = await Promise.all([
    db.from("ingest_runs").select("*").order("started_at", { ascending: false }).limit(40),
    db.from("connector_state").select("*"),
    db.from("raw_listings").select("source,kind"),
    db.from("listing_matches").select("state"),
  ]);
  const tally = <T,>(rows: T[] | null, key: (r: T) => string) => { const m = new Map<string, number>(); for (const r of rows ?? []) m.set(key(r), (m.get(key(r)) ?? 0) + 1); return [...m.entries()]; };
  const cls: Record<string, string> = { ok: "text-green-700", failed: "text-red-700", suspect: "bg-amber-100 text-amber-900", running: "text-zinc-500" };
  return (
    <div className="space-y-6 text-sm">
      <section><h2 className="font-semibold">Counts</h2>
        <div className="flex flex-wrap gap-2">{tally(bySource as { source: string; kind: string }[] | null, (r) => `${r.source}/${r.kind}`).map(([k, v]) => <span key={k} className="rounded bg-zinc-100 px-2 py-1">{k}: {v}</span>)}
          {tally(byState as { state: string }[] | null, (r) => r.state).map(([k, v]) => <span key={k} className="rounded bg-blue-50 px-2 py-1">{k}: {v}</span>)}</div></section>
      <section><h2 className="font-semibold">Connector cursors</h2><pre className="overflow-auto rounded bg-zinc-100 p-2 text-xs">{JSON.stringify(state, null, 1)}</pre></section>
      <section><h2 className="font-semibold">Recent runs</h2>
        <table className="w-full"><thead className="text-left text-xs text-zinc-500"><tr><th>job</th><th>status</th><th>started</th><th>seen</th><th>new</th><th>errors</th></tr></thead>
          <tbody>{(runs ?? []).map((r: { id: string; job: string; status: string; started_at: string; items_seen: number; items_new: number; errors: unknown[] }) => (
            <tr key={r.id} className="border-t"><td>{r.job}</td><td className={cls[r.status]}>{r.status}</td><td>{r.started_at.slice(0, 16)}</td><td>{r.items_seen}</td><td>{r.items_new}</td><td className="max-w-md truncate text-xs">{r.errors?.length ? JSON.stringify(r.errors) : ""}</td></tr>))}</tbody></table></section>
    </div>
  );
}
```

- [ ] **Step 2: Verify and commit**

Open `/admin/health`. Expected: counts per source/kind and per match state; cursors; runs with `suspect` rows highlighted amber.

```bash
git add apps/web
git commit -m "feat(web): admin health page (runs, cursors, counts)"
```

---

### Task 25: PWA and Vercel deploy

**Files:**
- Create: `apps/web/app/manifest.ts`, `apps/web/app/sw.ts`, `apps/web/public/icon-192.png`, `apps/web/public/icon-512.png`
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: Manifest + service worker (serwist)**

Add `"@serwist/next": "^9.0.0"` (dependency) and `"serwist": "^9.0.0"` to `apps/web/package.json`; `pnpm install`.

`apps/web/app/manifest.ts`:
```ts
import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "PCG Markets", short_name: "PCG Markets", start_url: "/", display: "standalone", background_color: "#fafafa", theme_color: "#18181b",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }] };
}
```

`apps/web/app/sw.ts`:
```ts
import { defaultCache } from "@serwist/next/worker";
import { Serwist, type PrecacheEntry } from "serwist";
declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: (PrecacheEntry | string)[] | undefined };
const serwist = new Serwist({ precacheEntries: self.__SW_MANIFEST, skipWaiting: true, clientsClaim: true, navigationPreload: true, runtimeCaching: defaultCache });
serwist.addEventListeners();
```

`apps/web/next.config.ts`:
```ts
import withSerwistInit from "@serwist/next";
const withSerwist = withSerwistInit({ swSrc: "app/sw.ts", swDest: "public/sw.js", disable: process.env.NODE_ENV === "development" });
export default withSerwist({ transpilePackages: ["@pcg/domain", "@pcg/connectors"], images: { remotePatterns: [{ hostname: "assets.tcgdex.net" }] } });
```
Generate the two icons (any 192/512 PNG with "PCG" on a dark square is fine for the POC): `pnpm dlx sharp-cli -i <source.svg> -o apps/web/public/icon-512.png resize 512` or export from any image tool.

- [ ] **Step 2: Deploy**

In Vercel: import the repo, root directory `apps/web`, framework Next.js, install command `pnpm install --frozen-lockfile` (run at repo root — set "Root Directory" to `apps/web` and enable "Include source files outside of the Root Directory"). Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CONTACT_EMAIL`. Add the Vercel URL to Supabase Auth redirect URLs.
Expected: production build succeeds; Lighthouse "Installable" passes; a card page loads with real prices.

- [ ] **Step 3: Commit**

```bash
git add apps/web
git commit -m "feat(web): PWA manifest + service worker; Vercel config"
```

---

## Phase 8 — Smoke

### Task 26: End-to-end smoke script

**Files:**
- Create: `apps/ingest/src/smoke.ts`, add script `"smoke": "tsx src/smoke.ts"` to `apps/ingest/package.json`

**Interfaces:**
- Consumes: everything. Seeds 6 listings (JP matched, JP needs_review, eBay matched, eBay Other-grader, best-offer, zero-bid ended) into a **scratch** Supabase project, runs match + prices, asserts the grid values via `public_sales`/`price_points`.

- [ ] **Step 1: Script**

```ts
import "dotenv/config";
import { createServiceClient, upsertRawListings, upsertSets, upsertProducts, upsertFxRates } from "@pcg/db";
import { runJob } from "./run";
import { matchJob } from "./jobs/match";
import { pricesJob } from "./jobs/prices";
import type { RawListing } from "@pcg/domain";

if (!process.env.SUPABASE_URL?.includes("scratch") && process.env.SMOKE_CONFIRM !== "yes") { console.error("Refusing: point SUPABASE_URL at a scratch project or set SMOKE_CONFIRM=yes"); process.exit(2); }
const db = createServiceClient();
const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const base = (o: Partial<RawListing> & Pick<RawListing, "source" | "sourceItemId" | "title" | "price" | "currency">): RawListing => ({
  url: `https://example.test/${o.sourceItemId}`, description: null, kind: "sold", soldAt: day(3), endedAt: day(3), isBestOffer: false, sellerCountry: null, externalItemId: null, imageUrls: [], metadata: {}, raw: {}, ...o,
});

await upsertSets(db, [{ id: "SMK1", printed_code: "SMK1", language: "ja", name_en: null, name_ja: "スモーク", release_date: "2026-01-01", card_count: 50, aliases: ["Smoke Set"] }]);
await upsertProducts(db, [{ id: "SMK1-010", set_id: "SMK1", number_printed: "010/050", number_num: 10, number_denom: 50, number_suffix: null, name_en: null, name_ja: "テスト", rarity: null, language: "ja", image_url: null }]);
await upsertFxRates(db, [{ date: day(3).slice(0, 10), base: "JPY", quote: "USD", rate: 0.0064 }, { date: day(3).slice(0, 10), base: "USD", quote: "USD", rate: 1 }]);
await upsertRawListings(db, [
  base({ source: "yahoo_auc", sourceItemId: "smk-a", title: "テスト SMK1 010/050 PCG10 鑑定品", price: 10000, currency: "JPY" }),
  base({ source: "yahoo_auc", sourceItemId: "smk-b", title: "テスト 010/050 PCG鑑定品 Gem Mint 10", price: 12500, currency: "JPY" }),
  base({ source: "yahoo_auc", sourceItemId: "smk-c", title: "テスト PCG10", price: 9000, currency: "JPY" }),
  base({ source: "yahoo_auc", sourceItemId: "smk-d", title: "テスト SMK1 010/050 PCG10", price: 5000, currency: "JPY", kind: "ended", soldAt: null }),
]);
await upsertRawListings(db, [
  base({ source: "thecardapi", sourceItemId: "smk-e", title: "Test PCG 10 Pristine", price: 80, currency: "USD", metadata: { grader: "Premier Card Grading (PCG)", grade: "10", set: "Smoke Set", cardNumber: "10", language: "Japanese" } }),
  base({ source: "thecardapi", sourceItemId: "smk-f", title: "Test PCG 10", price: 999, currency: "USD", isBestOffer: true, metadata: { grader: "Premier Card Grading (PCG)", grade: "10", set: "Smoke Set", cardNumber: "10" } }),
  base({ source: "thecardapi", sourceItemId: "smk-g", title: "Test PCG 10", price: 70, currency: "USD", metadata: { grader: "Other", grade: "10", set: "Smoke Set", cardNumber: "10" } }),
]);
await runJob("match", matchJob({ all: true }), { db });
await runJob("prices", pricesJob, { db });

const { data: pts } = await db.from("price_points").select("*").eq("product_id", "SMK1-010").eq("window", "90d");
const any = pts!.find((p) => p.grade_label === "any"), pristine = pts!.find((p) => p.grade_label === "Pristine");
const { data: review } = await db.from("listing_matches").select("raw_listing_id,review_reason,raw_listings(source_item_id)").eq("state", "needs_review");
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } console.log("ok:", m); };
assert(any?.n_sales === 3, `any-10 has 3 sales (a, b, e) — got ${any?.n_sales}`);              // c→review, d ended, f best-offer, g Other
assert(Math.abs(Number(any?.median_usd) - 80) < 0.01, `median is $80 (64, 80, 80) — got ${any?.median_usd}`);
assert(pristine?.n_sales === 1, `Pristine tier has 1 sale — got ${pristine?.n_sales}`);
const reasons = (review ?? []).map((r) => `${(r.raw_listings as unknown as { source_item_id: string }).source_item_id}:${r.review_reason}`).sort();
assert(JSON.stringify(reasons) === JSON.stringify(["smk-c:no_card_number", "smk-g:grader_missing"]), `review queue is exactly c and g — got ${reasons}`);
console.log("SMOKE PASSED");
```

- [ ] **Step 2: Run against a scratch project**

Run: `SMOKE_CONFIRM=yes pnpm --filter @pcg/ingest smoke` (with `.env` pointing at a scratch Supabase project that has the migrations applied).
Expected: four `ok:` lines and `SMOKE PASSED`. Then open the scratch card `/card/SMK1-010` in the web app pointed at the same project: grid shows `PCG 10 — $80 — 3 sales`, no Pristine column (only 1 sale), sold list shows `≤ $999` for the best-offer row.

- [ ] **Step 3: Commit**

```bash
git add apps/ingest
git commit -m "test: end-to-end smoke seeding listings through match and prices"
```

---

## Self-review

**Spec coverage** (spec § → task): §4 architecture → 1; §5 sets/products → 8, 11; raw_listings + seller stripping → 8, 9; listing_matches → 8, 9, 18; price_points → 8, 9, 7, 18; fx_rates → 8, 14, 16; connector_state → 8, 9, 17; ingest_runs → 8, 9, 16; admin_users → 8, 23; §6 search (cert / number / name, fall-through, ranking, language badge) → 20, 21; §7 ingestion table (tcgdex weekly, thecardapi 6h, yahoo 6h with bids≥1 rule, fx daily, match routine vs `--all`, prices) → 16, 17, 18, 19; kill switch, zero-result guard, partial pages, concurrency → 16, 17, 19; coverage gate → 15; §8 eBay rules 1–6 → 6; JP rules 1–4 + set-code / number-denom resolution → 4, 5; Common (lots, rename table, 10+, matcher_version) → 3, 4, 5, 6, 18; admin queue → 23; §9 pricing → 7, 22 (tier ≥2 rule in `gridColumns`), 9 (`public_sales` FX on/before date, best-offer + price>0 exclusion in `loadMatchedSales`); §10 routes → 21, 22, 23, 24; PWA → 25; footer → 20; §11 error isolation, UA/rate/pause, robots path, PII, secrets → 10, 12, 16, 17, 19; §12 tests → every task + 18 (real titles) + 26 (smoke); §13 spike → 15.

**Gaps found and fixed during review:** `price > 0` was only in the SQL view's consumer — added to `loadMatchedSales` filter (Task 9). `TIERS` needed exporting from domain for Task 22 — it is exported from `pricing.ts` (Task 7). The admin login route conflicted with the `/admin` layout gate — Task 23 Step 1 now instructs moving it to `/admin-login`.

**Placeholder scan:** The only intentionally unfilled values are in `schema.ts` (Task 13), which the task itself fills from The Card API's docs and a recorded sample before its test can pass; and the `ITEM_ID_1`/`PRICE_1`/`BIDS_1` facts in Task 12's test, which come from the recorded Yahoo fixture. Both are data the plan cannot know in advance and are gated by tests.

**Type consistency:** `RawListing`, `EbayMetadata`, `CertRecord`, `MatchResult`, `ParsedNumber`, `SetRef`/`ProductRef`, `Sale`/`PricePoint`, `Page`/`Connector`, `SetRow`/`ProductRow`, `Job`/`JobStats` are defined once (Tasks 2, 5, 7, 9, 10, 16) and referenced by those names everywhere else. `grade_label` semantics: domain `MatchResult.gradeLabel` is `TierLabel | "Authentic" | null`; `price_points.grade_label` is `TierLabel | "any"` — the conversion happens only in `computePricePoints`.

