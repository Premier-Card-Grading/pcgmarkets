# Sets Browse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Collectr-style Sets section (`/sets` and `/sets/[id]`) that lists every English and Japanese set and every card in a set. Japanese sets and cards get English names, every card gets an image wherever a licensed source has one, and each card shows a PCG 10 price, an estimate, or "No comps yet".

**Architecture:**
- **Japanese 2010 onwards:** a new Limitless connector reads two list pages per set (Japanese and English-translated). It merges set names, card lists, English names, rarity and image URLs into the catalogue.
- **Pre-2010 Japanese and all English:** the existing TCGdex import, which also gains series, logos and English names for vintage Japanese.
- **Images:**
  - Japanese images missing from TCGdex are copied from Limitless as small WebP files into Supabase storage.
  - Missing English images are linked from pokemontcg.io.
- **Pages:** the web app reads one new view, `public_set_cards`.

**Tech Stack:**
- pnpm monorepo: `packages/domain`, `packages/connectors`, `packages/db`, `apps/ingest`, `apps/web` (Next.js 15, React 19, Tailwind 4).
- vitest; Playwright for screenshots.
- Supabase (Postgres, storage, supabase-js).
- cheerio for HTML parsing; sharp for WebP conversion.

**Spec:** `docs/superpowers/specs/2026-10-21-sets-browse-design.md`

## Global Constraints

- English and Japanese only. **No Chinese**, in data, types or UI.
- Never machine-translate names. A name we can't translate correctly stays null, and the UI falls back to the Japanese.
- At most 1 request per second to `limitlesstcg.com`, and 2 concurrent requests to the Limitless image CDN. Every request uses the existing `politeFetch` user agent `PCGMarketsBot/0.1`. A 403 or 429 throws `PausedError`, exactly as other connectors do.
- Copy Limitless images into our storage; never hotlink `limitlesstcg.nyc3.cdn.digitaloceanspaces.com` or `s3.limitlesstcg.com` from the web app. TCGdex (`assets.tcgdex.net`) and pokemontcg.io (`images.pokemontcg.io`) images are linked directly.
- Free plan storage budget: Limitless card images are stored as the **small** (`_SM.png`) image converted to WebP at quality 80.
- The public view never exposes `pct`, `era`, PSA prices, `import_id` or `pc_*` columns.
- Migrations are wrapped in `begin; … commit;` and applied by hand with `npx supabase db query --linked -f <file>`.
- supabase-js selects stop at 1000 rows, so page every multi-row read with `selectAll` and a unique order.
- Never `git checkout`, `git stash` or `git reset` uncommitted work.
- Every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GruY6B7gQp9Vpbk4oLvriD
  ```
- Nothing goes into GitHub Actions. Don't push.
- UI uses existing tokens and components (Chip, SectionHead, Price, AppHeader, SiteFooter) and must work in light and dark themes and at a 390px phone width.

## Review Focus

1. **The TCGdex and Limitless imports run in either order and nothing gets lost.** A later `catalog:tcgdex` run must not null out `name_en`, `rarity` or `image_url` that Limitless filled in. Task 6 tests this.
2. **Numbers that don't parse:** non-numeric Limitless numbers (e.g. `TG01`) and TCGdex `localId`s like `Charizard` must not crash the merge, and must not merge into the wrong card. Task 7 tests this.
3. **Search like a collector types it:** `069/187`, `69/187`, `69`, `069`, `#69`, an English name in any case, a Japanese name, and promo numbers like `001/SV-P`. Task 2 tests this.
4. **A set with 0 products, or more than 1000:** shows the empty state rather than an error, and isn't cut off at 1000 cards (the `MC` set has 774 cards today). Task 11 tests this.
5. **An image download that's missing (404), forbidden (403), or not an image:** the card keeps a null image, the job finishes and logs, and the next run retries. Task 8 tests this.

---

### Task 1: Migration 0006 (columns, view, buckets)

**Files:**
- Create: `packages/db/migrations/0006_sets_browse.sql`
- Create: `packages/db/test/migration-0006.test.ts`
- Modify: `packages/db/src/repo/catalog.ts` (adds optional fields to the `SetRow` and `ProductRow` types)

**Interfaces:**
- Produces:
  - **New columns:** `sets.logo_url`, `sets.series`, `sets.source ('tcgdex'|'limitless')`, `sets.limitless_code`, `products.image_source ('tcgdex'|'limitless'|'pokemontcg')`.
  - **View** `public_set_cards(set_id, id, number_printed, number_num, number_denom, number_suffix, name_en, name_ja, rarity, image_url, pcg10_median_usd, pcg10_n_sales, est10_usd, est10_as_of, sale_count)`.
  - **Buckets** `set-logos` and `card-images`.
  - **TS types:**
    ```ts
    SetRow.logo_url?: string | null; SetRow.series?: string | null; SetRow.source?: "tcgdex" | "limitless"; SetRow.limitless_code?: string | null
    ProductRow.image_source?: "tcgdex" | "limitless" | "pokemontcg" | null
    ```

- [ ] **Step 1: Write the failing test**

```ts
// packages/db/test/migration-0006.test.ts
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @pcg/db exec vitest run test/migration-0006.test.ts`
Expected: FAIL with ENOENT (the file doesn't exist yet).

- [ ] **Step 3: Write the migration**

```sql
-- 0006_sets_browse.sql: catalogue fields for the Sets pages, a public per-card view, and image buckets.
begin;

alter table sets add column logo_url text;
alter table sets add column series text;
alter table sets add column source text not null default 'tcgdex' check (source in ('tcgdex','limitless'));
alter table sets add column limitless_code text;
alter table products add column image_source text check (image_source in ('tcgdex','limitless','pokemontcg'));

-- One row per card with the public PCG 10 numbers the card page already shows.
create view public_set_cards as
select p.set_id, p.id, p.number_printed, p.number_num, p.number_denom, p.number_suffix,
       p.name_en, p.name_ja, p.rarity, p.image_url,
       pp.median_usd as pcg10_median_usd, pp.n_sales as pcg10_n_sales,
       e.estimate_usd as est10_usd, e.source_as_of as est10_as_of,
       coalesce(c.sale_count, 0)::int as sale_count
from products p
left join price_points pp on pp.product_id = p.id and pp.grade_value = 10 and pp.grade_label = 'any' and pp."window" = '90d'
left join price_estimates e on e.product_id = p.id and e.grade_value = 10
left join product_sale_counts c on c.product_id = p.id;
-- Owner-privileged view: strip default grants so anon cannot write through it.
revoke all on public_set_cards from public, anon, authenticated;
grant select on public_set_cards to anon, authenticated;

-- Public-read buckets; only the service role (which bypasses RLS) writes.
insert into storage.buckets (id, name, public) values ('set-logos', 'set-logos', true), ('card-images', 'card-images', true)
on conflict (id) do nothing;

commit;
```

- [ ] **Step 4: Add the optional fields to the row types**

In `packages/db/src/repo/catalog.ts`, replace the two interfaces with:

```ts
export interface SetRow { id: string; printed_code: string | null; language: Language; name_en: string | null; name_ja: string | null; release_date: string | null; card_count: number | null; aliases: string[]; logo_url?: string | null; series?: string | null; source?: "tcgdex" | "limitless"; limitless_code?: string | null }
export interface ProductRow { id: string; set_id: string; number_printed: string; number_num: number | null; number_denom: number | null; number_suffix: string | null; name_en: string | null; name_ja: string | null; rarity: string | null; language: Language; image_url: string | null; image_source?: "tcgdex" | "limitless" | "pokemontcg" | null }
```

- [ ] **Step 5: Run the test and typecheck**

Run: `pnpm --filter @pcg/db exec vitest run test/migration-0006.test.ts && pnpm typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/0006_sets_browse.sql packages/db/test/migration-0006.test.ts packages/db/src/repo/catalog.ts
git commit -m "feat(db): sets browse columns, public_set_cards view and image buckets"
```

---

### Task 2: Card search matcher (`parseCardQuery`, `matchesCardQuery`)

**Files:**
- Create: `packages/domain/src/card-query.ts`
- Create: `packages/domain/test/card-query.test.ts`
- Modify: `packages/domain/src/index.ts` (add `export * from "./card-query";`)

**Interfaces:**
- Consumes: `parseCardNumber(input): ParsedNumber | null` from `./card-number`.
- Produces:
  ```ts
  export type CardQuery = { kind: "all" } | { kind: "number"; num: number; denom: number | null; suffix: string | null } | { kind: "text"; text: string };
  export function parseCardQuery(q: string): CardQuery;
  export interface QueryableCard { number_printed: string; number_num: number | null; number_denom: number | null; number_suffix: string | null; name_en: string | null; name_ja: string | null }
  export function matchesCardQuery(card: QueryableCard, q: CardQuery): boolean;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/test/card-query.test.ts
import { describe, it, expect } from "vitest";
import { parseCardQuery, matchesCardQuery, type QueryableCard } from "../src/card-query";

const pika: QueryableCard = { number_printed: "069/187", number_num: 69, number_denom: 187, number_suffix: null, name_en: "Pikachu ex", name_ja: "ピカチュウex" };
const promo: QueryableCard = { number_printed: "001/SV-P", number_num: 1, number_denom: null, number_suffix: "SV-P", name_en: null, name_ja: "ニャオハ" };
const vintage: QueryableCard = { number_printed: "Charizard", number_num: null, number_denom: null, number_suffix: null, name_en: "Charizard", name_ja: null };

describe("parseCardQuery", () => {
  it("is 'all' for blank input", () => { expect(parseCardQuery("  ")).toEqual({ kind: "all" }); });
  it("reads full, short and padded numbers", () => {
    expect(parseCardQuery("069/187")).toEqual({ kind: "number", num: 69, denom: 187, suffix: null });
    expect(parseCardQuery("69/187")).toEqual({ kind: "number", num: 69, denom: 187, suffix: null });
    expect(parseCardQuery("69")).toEqual({ kind: "number", num: 69, denom: null, suffix: null });
    expect(parseCardQuery("069")).toEqual({ kind: "number", num: 69, denom: null, suffix: null });
    expect(parseCardQuery("#69")).toEqual({ kind: "number", num: 69, denom: null, suffix: null });
  });
  it("reads promo numbers", () => { expect(parseCardQuery("001/sv-p")).toEqual({ kind: "number", num: 1, denom: null, suffix: "SV-P" }); });
  it("treats anything else as text", () => { expect(parseCardQuery(" Pikachu ")).toEqual({ kind: "text", text: "pikachu" }); });
});

describe("matchesCardQuery", () => {
  it("matches by number with or without the denominator", () => {
    expect(matchesCardQuery(pika, parseCardQuery("069/187"))).toBe(true);
    expect(matchesCardQuery(pika, parseCardQuery("69"))).toBe(true);
    expect(matchesCardQuery(pika, parseCardQuery("69/188"))).toBe(false);
    expect(matchesCardQuery(pika, parseCardQuery("70"))).toBe(false);
  });
  it("matches promo suffixes", () => {
    expect(matchesCardQuery(promo, parseCardQuery("001/SV-P"))).toBe(true);
    expect(matchesCardQuery(promo, parseCardQuery("1"))).toBe(true);
  });
  it("matches English names ignoring case, and Japanese names", () => {
    expect(matchesCardQuery(pika, parseCardQuery("PIKACHU"))).toBe(true);
    expect(matchesCardQuery(pika, parseCardQuery("ピカチュウ"))).toBe(true);
    expect(matchesCardQuery(pika, parseCardQuery("raichu"))).toBe(false);
  });
  it("falls back to the printed number for non-numeric cards", () => {
    expect(matchesCardQuery(vintage, parseCardQuery("chariz"))).toBe(true);
  });
  it("matches everything for 'all'", () => { expect(matchesCardQuery(vintage, { kind: "all" })).toBe(true); });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @pcg/domain exec vitest run test/card-query.test.ts`
Expected: FAIL, "Cannot find module '../src/card-query'".

- [ ] **Step 3: Implement**

```ts
// packages/domain/src/card-query.ts
import { parseCardNumber } from "./card-number";

export type CardQuery = { kind: "all" } | { kind: "number"; num: number; denom: number | null; suffix: string | null } | { kind: "text"; text: string };
export interface QueryableCard { number_printed: string; number_num: number | null; number_denom: number | null; number_suffix: string | null; name_en: string | null; name_ja: string | null }

/** Set-page search: "069/187", "69/187", "69", "069", "#69", "001/SV-P", or a name. */
export function parseCardQuery(q: string): CardQuery {
  const t = q.trim().replace(/^#/, "");
  if (!t) return { kind: "all" };
  const n = parseCardNumber(t);
  if (n) return { kind: "number", num: n.num, denom: n.denom, suffix: n.suffix };
  return { kind: "text", text: t.toLowerCase() };
}

export function matchesCardQuery(card: QueryableCard, q: CardQuery): boolean {
  if (q.kind === "all") return true;
  if (q.kind === "number") {
    if (card.number_num !== q.num) return false;
    if (q.denom != null && card.number_denom !== q.denom) return false;
    if (q.suffix != null && (card.number_suffix ?? "").toUpperCase() !== q.suffix) return false;
    return true;
  }
  return [card.name_en, card.name_ja, card.number_printed].some((s) => s != null && s.toLowerCase().includes(q.text));
}
```

Add `export * from "./card-query";` to `packages/domain/src/index.ts`.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @pcg/domain exec vitest run test/card-query.test.ts`
Expected: PASS (all 9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/card-query.ts packages/domain/test/card-query.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): set-page card search by number or name"
```

---

### Task 3: English names for pre-2010 Japanese cards (`translateJaCardName`)

**Files:**
- Create: `scripts/gen-species-names.mjs`
- Create: `packages/domain/src/names/species-ja-en.json` (generated, then committed)
- Create: `packages/domain/src/names/card-names-ja-en.ts`
- Create: `packages/domain/src/names/translate.ts`
- Create: `packages/domain/test/translate-names.test.ts`
- Modify: `packages/domain/src/index.ts` (add `export * from "./names/translate";`)

**Interfaces:**
- Produces: `export function translateJaCardName(nameJa: string | null): string | null`

- [ ] **Step 1: Write the generator script and run it once**

```js
// scripts/gen-species-names.mjs
// One-off: builds packages/domain/src/names/species-ja-en.json from PokéAPI's public CSV (no runtime dependency).
import { writeFileSync } from "node:fs";
const URL_CSV = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv";
const csv = await (await fetch(URL_CSV)).text();
const JA = new Set(["1", "11"]); // ja-Hrkt (kana) and ja
const EN = "9";
const byId = new Map();
for (const line of csv.trim().split("\n").slice(1)) {
  const [id, lang, name] = line.split(",");
  const e = byId.get(id) ?? { ja: new Set(), en: null };
  if (JA.has(lang)) e.ja.add(name);
  if (lang === EN) e.en = name;
  byId.set(id, e);
}
const out = {};
for (const { ja, en } of byId.values()) if (en) for (const j of ja) out[j] = en;
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b, "ja")));
writeFileSync(new URL("../packages/domain/src/names/species-ja-en.json", import.meta.url), JSON.stringify(sorted, null, 0) + "\n");
console.log(`wrote ${Object.keys(sorted).length} species names`);
```

Run: `mkdir -p packages/domain/src/names && node scripts/gen-species-names.mjs`
Expected: `wrote N species names`, with N above 1000. Spot-check that the JSON has `"ピカチュウ":"Pikachu"` and `"リザードン":"Charizard"`.

- [ ] **Step 2: Write the curated dictionary**

```ts
// packages/domain/src/names/card-names-ja-en.ts
// Curated, reviewed translations only. Never machine-translated. Add entries as gaps are found.

/** Whole-card names (Trainers, Energy and other non-Pokémon cards). */
export const CARD_NAMES: Record<string, string> = {
  "草エネルギー": "Grass Energy", "炎エネルギー": "Fire Energy", "水エネルギー": "Water Energy",
  "雷エネルギー": "Lightning Energy", "超エネルギー": "Psychic Energy", "闘エネルギー": "Fighting Energy",
  "悪エネルギー": "Darkness Energy", "鋼エネルギー": "Metal Energy",
  "基本草エネルギー": "Basic Grass Energy", "基本炎エネルギー": "Basic Fire Energy", "基本水エネルギー": "Basic Water Energy",
  "基本雷エネルギー": "Basic Lightning Energy", "基本超エネルギー": "Basic Psychic Energy", "基本闘エネルギー": "Basic Fighting Energy",
  "基本悪エネルギー": "Basic Darkness Energy", "基本鋼エネルギー": "Basic Metal Energy",
  "ダブル無色エネルギー": "Double Colorless Energy",
  "オーキド博士": "Professor Oak", "ポケモンいれかえ": "Switch", "きずぐすり": "Potion", "すごいきずぐすり": "Super Potion",
  "げんきのかけら": "Revive", "エネルギーリムーブ": "Energy Removal", "超エネルギーリムーブ": "Super Energy Removal",
  "ふしぎなアメ": "Rare Candy", "ポケモン図鑑": "Pokédex", "パソコン通信": "Computer Search", "ポケモンブリーダー": "Pokémon Breeder",
  "ポケモン交換おじさん": "Pokémon Trader", "マサキ": "Bill", "オーキド博士の新理論": "Professor Oak's New Theory",
  "ウツギ博士": "Professor Elm", "ナナミ": "Lass", "ポケモンキャッチャー": "Pokémon Catcher",
};

/** Prefixes that come before a species name. */
export const PREFIXES: [ja: string, en: string][] = [
  ["ロケット団の", "Rocket's"], ["わるい", "Dark"], ["ひかる", "Shining"],
  ["カスミの", "Misty's"], ["タケシの", "Brock's"], ["マチスの", "Lt. Surge's"], ["エリカの", "Erika's"],
  ["ナツメの", "Sabrina's"], ["キョウの", "Koga's"], ["カツラの", "Blaine's"], ["サカキの", "Giovanni's"],
  ["アローラ", "Alolan"], ["ガラル", "Galarian"], ["ヒスイ", "Hisuian"], ["パルデア", "Paldean"],
];

/** Suffixes after a species name, longest first so "LV.X" wins over "X". */
export const SUFFIXES: [ja: string, en: string][] = [
  ["LV.X", " LV.X"], ["ex", " ex"], ["EX", "-EX"], ["GX", "-GX"], ["☆", " ☆"], ["δ", " δ"],
  ["GL", " GL"], ["FB", " FB"], ["C", " C"], ["G", " G"], ["4", " 4"],
];
```

- [ ] **Step 3: Write the failing test**

```ts
// packages/domain/test/translate-names.test.ts
import { describe, it, expect } from "vitest";
import { translateJaCardName } from "../src/names/translate";

describe("translateJaCardName", () => {
  it("translates plain species", () => { expect(translateJaCardName("ピカチュウ")).toBe("Pikachu"); });
  it("keeps suffixes", () => {
    expect(translateJaCardName("リザードンex")).toBe("Charizard ex");
    expect(translateJaCardName("ディアルガLV.X")).toBe("Dialga LV.X");
    expect(translateJaCardName("ミュウ☆")).toBe("Mew ☆");
  });
  it("handles owner and form prefixes", () => {
    expect(translateJaCardName("ロケット団のミュウツー")).toBe("Rocket's Mewtwo");
    expect(translateJaCardName("わるいリザードン")).toBe("Dark Charizard");
    expect(translateJaCardName("カスミのスターミー")).toBe("Misty's Starmie");
  });
  it("uses the dictionary for Trainers and Energy", () => {
    expect(translateJaCardName("オーキド博士")).toBe("Professor Oak");
    expect(translateJaCardName("基本超エネルギー")).toBe("Basic Psychic Energy");
  });
  it("ignores surrounding whitespace", () => { expect(translateJaCardName(" ピカチュウ ")).toBe("Pikachu"); });
  it("returns null when any part is unknown, never a partial name", () => {
    expect(translateJaCardName("なぞのカード")).toBeNull();
    expect(translateJaCardName("ピカチュウなぞ")).toBeNull();
    expect(translateJaCardName("")).toBeNull();
    expect(translateJaCardName(null)).toBeNull();
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

Run: `pnpm --filter @pcg/domain exec vitest run test/translate-names.test.ts`
Expected: FAIL, "Cannot find module '../src/names/translate'".

- [ ] **Step 5: Implement**

```ts
// packages/domain/src/names/translate.ts
import species from "./species-ja-en.json";
import { CARD_NAMES, PREFIXES, SUFFIXES } from "./card-names-ja-en";

const SPECIES = species as Record<string, string>;

/** Official English name for a Japanese card name, or null unless every part is known. */
export function translateJaCardName(nameJa: string | null): string | null {
  const name = nameJa?.trim();
  if (!name) return null;
  if (CARD_NAMES[name]) return CARD_NAMES[name]!;
  let rest = name, prefix = "";
  for (const [ja, en] of PREFIXES) if (rest.startsWith(ja)) { prefix = `${en} `; rest = rest.slice(ja.length); break; }
  let suffix = "";
  for (const [ja, en] of SUFFIXES) if (rest.endsWith(ja) && SPECIES[rest.slice(0, -ja.length)]) { suffix = en; rest = rest.slice(0, -ja.length); break; }
  const sp = SPECIES[rest];
  return sp ? `${prefix}${sp}${suffix}` : null;
}
```

Add `export * from "./names/translate";` to `packages/domain/src/index.ts`. If `tsc` rejects the JSON import, add `"resolveJsonModule": true` to `packages/domain/tsconfig.json` under `compilerOptions`.

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm --filter @pcg/domain exec vitest run test/translate-names.test.ts && pnpm typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add scripts/gen-species-names.mjs packages/domain/src/names packages/domain/test/translate-names.test.ts packages/domain/src/index.ts packages/domain/tsconfig.json
git commit -m "feat(domain): English names for vintage Japanese cards from PokéAPI species and a curated dictionary"
```

---

### Task 4: Limitless parser and fetchers

**Files:**
- Create: `packages/connectors/src/limitless/parse.ts`
- Create: `packages/connectors/src/limitless/index.ts`
- Create: `packages/connectors/test/limitless.test.ts`
- Fixtures already committed:
  - `packages/connectors/test/fixtures/limitless-sets-jp.html`
  - `packages/connectors/test/fixtures/limitless-set-SV11B-ja.html`
  - `packages/connectors/test/fixtures/limitless-set-SV11B-en.html`
- Modify: `packages/connectors/src/index.ts` (add `export * as limitless from "./limitless";`)

**Interfaces:**
- Produces:
  ```ts
  export interface LimitlessSetSummary { code: string; nameEn: string; releaseDate: string | null; cardCount: number | null; series: string | null }
  export interface LimitlessCard { number: string; nameJa: string | null; nameEn: string | null; type: string | null; rarity: string | null; imageXs: string | null }
  export interface LimitlessSetPage { code: string; nameJa: string | null; nameEn: string | null; releaseDate: string | null; cards: LimitlessCard[] }
  export function parseSetIndex(html: string): LimitlessSetSummary[];
  export function parseSetList(html: string): { nameJa: string | null; nameEn: string | null; releaseDate: string | null; rows: { number: string; name: string; type: string | null; rarity: string | null; imageXs: string | null }[] };
  export function mergeSetPages(code: string, ja: ReturnType<typeof parseSetList>, en: ReturnType<typeof parseSetList>): LimitlessSetPage;
  export function parseLimitlessDate(s: string): string | null; // "16 Sep 26" or "6th June 2025" -> "2026-09-16" / "2025-06-06"
  export const imageUrl: (xs: string, size: "SM" | "LG") => string; // swaps _XS.png for _SM.png / _LG.png
  export async function listSets(): Promise<LimitlessSetSummary[]>;
  export async function getSet(code: string): Promise<LimitlessSetPage>; // two requests: ja list, en list
  export const logoUrl: (code: string) => string; // https://s3.limitlesstcg.com/sets/jp/{code}.png
  ```

- [ ] **Step 1: Write the failing test**

```ts
// packages/connectors/test/limitless.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSetIndex, parseSetList, mergeSetPages, parseLimitlessDate, imageUrl, logoUrl } from "../src/limitless/parse";

const fx = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

describe("limitless set index", () => {
  const sets = parseSetIndex(fx("limitless-sets-jp.html"));
  it("lists every Japanese set with code, English name, date, count and series", () => {
    expect(sets.length).toBeGreaterThan(250);
    expect(sets[0]).toEqual({ code: "M6a", nameEn: "30th Celebration", releaseDate: "2026-09-16", cardCount: 111, series: "Mega" });
    expect(sets.find((s) => s.code === "BKB")).toMatchObject({ nameEn: "Black Kyurem-EX Deck", releaseDate: "2012-10-19", cardCount: 20 });
  });
  it("has unique codes", () => { expect(new Set(sets.map((s) => s.code)).size).toBe(sets.length); });
});

describe("limitless set list", () => {
  const ja = parseSetList(fx("limitless-set-SV11B-ja.html"));
  const en = parseSetList(fx("limitless-set-SV11B-en.html"));
  it("reads the header and every row", () => {
    expect(ja.nameJa).toBe("ブラックボルト");
    expect(ja.releaseDate).toBe("2025-06-06");
    expect(ja.rows).toHaveLength(174);
    expect(ja.rows[0]).toEqual({ number: "1", name: "ツタージャ", type: "G Basic", rarity: "Common", imageXs: "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SV11B/SV11B_1_R_JP_XS.png" });
  });
  it("joins Japanese and English rows by number", () => {
    const page = mergeSetPages("SV11B", ja, en);
    expect(page.cards).toHaveLength(174);
    expect(page.cards[2]).toMatchObject({ number: "3", nameJa: "ジャローダex", nameEn: "Serperior ex", rarity: "Double Rare" });
    expect(page.cards.find((c) => c.number === "173")).toMatchObject({ nameEn: "N's Plot", type: "Supporter" });
  });
  it("keeps a row whose English twin is missing, with nameEn null", () => {
    const page = mergeSetPages("SV11B", ja, { ...en, rows: en.rows.filter((r) => r.number !== "5") });
    expect(page.cards.find((c) => c.number === "5")).toMatchObject({ nameJa: "ヤナッキー", nameEn: null });
  });
});

describe("limitless helpers", () => {
  it("parses both date styles", () => {
    expect(parseLimitlessDate("16 Sep 26")).toBe("2026-09-16");
    expect(parseLimitlessDate("19 Oct 12")).toBe("2012-10-19");
    expect(parseLimitlessDate("6th June 2025")).toBe("2025-06-06");
    expect(parseLimitlessDate("1st March 2011")).toBe("2011-03-01");
    expect(parseLimitlessDate("soon")).toBeNull();
  });
  it("builds image and logo URLs", () => {
    expect(imageUrl("https://x/tpc/SV11B/SV11B_1_R_JP_XS.png", "SM")).toBe("https://x/tpc/SV11B/SV11B_1_R_JP_SM.png");
    expect(logoUrl("SV8a")).toBe("https://s3.limitlesstcg.com/sets/jp/SV8a.png");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @pcg/connectors exec vitest run test/limitless.test.ts`
Expected: FAIL, "Cannot find module '../src/limitless/parse'".

- [ ] **Step 3: Implement the parser**

```ts
// packages/connectors/src/limitless/parse.ts
import * as cheerio from "cheerio";

export interface LimitlessSetSummary { code: string; nameEn: string; releaseDate: string | null; cardCount: number | null; series: string | null }
export interface LimitlessCard { number: string; nameJa: string | null; nameEn: string | null; type: string | null; rarity: string | null; imageXs: string | null }
export interface LimitlessSetPage { code: string; nameJa: string | null; nameEn: string | null; releaseDate: string | null; cards: LimitlessCard[] }
export interface ParsedSetList { nameJa: string | null; nameEn: string | null; releaseDate: string | null; rows: { number: string; name: string; type: string | null; rarity: string | null; imageXs: string | null }[] }

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** "16 Sep 26" (index) or "6th June 2025" (set page) -> ISO date. */
export function parseLimitlessDate(s: string): string | null {
  const m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{2}|\d{4})$/.exec(clean(s));
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase());
  if (month < 0) return null;
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${year}-${String(month + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

export const imageUrl = (xs: string, size: "SM" | "LG") => xs.replace(/_XS\.png$/, `_${size}.png`);
export const logoUrl = (code: string) => `https://s3.limitlesstcg.com/sets/jp/${code}.png`;

export function parseSetIndex(html: string): LimitlessSetSummary[] {
  const $ = cheerio.load(html);
  const out: LimitlessSetSummary[] = [];
  let series: string | null = null;
  $("table.sets-table tr").each((_, tr) => {
    const sub = $(tr).find("th.sub-heading");
    if (sub.length) { series = clean(sub.text()) || null; return; }
    const tds = $(tr).find("td");
    if (tds.length < 2) return;
    const link = tds.eq(0).find("a").first();
    const code = clean(link.find(".code").text());
    if (!code) return;
    const nameEn = clean(link.clone().find(".code").remove().end().text());
    const count = Number.parseInt(clean(tds.eq(2).find("a").first().contents().first().text()), 10);
    out.push({ code, nameEn, releaseDate: parseLimitlessDate(tds.eq(1).text()), cardCount: Number.isFinite(count) ? count : null, series });
  });
  return out;
}

export function parseSetList(html: string): ParsedSetList {
  const $ = cheerio.load(html);
  const heading = clean($(".infobox-heading").first().text());
  const nameEn = heading.replace(/\s*\([^)]*\)\s*$/, "") || null;
  const dateText = clean($(".infobox-line").first().text()).split("•")[0] ?? "";
  const rows: ParsedSetList["rows"] = [];
  let nameJa: string | null = null;
  $("table.card-list tr[data-hover]").each((_, tr) => {
    const tds = $(tr).find("td");
    nameJa ??= $(tr).find(".card-set").attr("data-tooltip") ?? null;
    rows.push({
      number: clean(tds.eq(1).text()),
      name: clean(tds.eq(2).text()),
      type: clean(tds.eq(3).text()) || null,
      rarity: clean(tds.eq(4).text()) || null,
      imageXs: $(tr).attr("data-hover") ?? null,
    });
  });
  return { nameJa, nameEn, releaseDate: parseLimitlessDate(dateText), rows };
}

export function mergeSetPages(code: string, ja: ParsedSetList, en: ParsedSetList): LimitlessSetPage {
  const enByNum = new Map(en.rows.map((r) => [r.number, r]));
  return {
    code, nameJa: ja.nameJa, nameEn: ja.nameEn ?? en.nameEn, releaseDate: ja.releaseDate ?? en.releaseDate,
    cards: ja.rows.map((r) => ({ number: r.number, nameJa: r.name || null, nameEn: enByNum.get(r.number)?.name || null, type: r.type, rarity: r.rarity, imageXs: r.imageXs })),
  };
}
```

- [ ] **Step 4: Implement the fetchers**

```ts
// packages/connectors/src/limitless/index.ts
import { politeFetch } from "../http";
import { parseSetIndex, parseSetList, mergeSetPages, type LimitlessSetSummary, type LimitlessSetPage } from "./parse";
export * from "./parse";

const BASE = "https://limitlesstcg.com/cards/jp";
const INTERVAL = 1000;

async function page(url: string): Promise<string> {
  const res = await politeFetch(url, { minIntervalMs: INTERVAL });
  if (!res.ok) throw new Error(`limitless ${url}: ${res.status}`);
  return res.text();
}

export async function listSets(): Promise<LimitlessSetSummary[]> {
  return parseSetIndex(await page(BASE));
}

export async function getSet(code: string): Promise<LimitlessSetPage> {
  const url = `${BASE}/${encodeURIComponent(code)}?display=list&show=all`;
  const ja = parseSetList(await page(url));
  const en = parseSetList(await page(`${url}&translate=en`));
  return mergeSetPages(code, ja, en);
}
```

Add `export * as limitless from "./limitless";` to `packages/connectors/src/index.ts`.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @pcg/connectors exec vitest run test/limitless.test.ts`
Expected: PASS. If the first index row isn't `M6a` with count 111, read the fixture rather than changing the assertion. The fixture is the source of truth, and the expected values were read from it.

- [ ] **Step 6: Commit**

```bash
git add packages/connectors/src/limitless packages/connectors/test/limitless.test.ts packages/connectors/test/fixtures/limitless-*.html packages/connectors/src/index.ts
git commit -m "feat(connectors): Limitless Japanese set index and set list parser"
```

---

### Task 5: Limitless ↔ TCGdex set map (generated, reviewed, committed)

**Files:**
- Create: `scripts/gen-limitless-set-map.ts`
- Create: `packages/connectors/src/limitless/ja-set-map.ts` (generated output, committed)
- Create: `packages/connectors/test/limitless-set-map.test.ts`

**Interfaces:**
- Consumes: `limitless.listSets()` and `limitless.getSet(code)` (Task 4); the DB `sets` table.
- Produces:
  ```ts
  export const LIMITLESS_TO_OURS: Record<string, string> // limitless code -> our set id, only where they differ or need confirming
  export function ourSetIdFor(limitlessCode: string, ourIds: ReadonlySet<string>): string | null
  ```
  `ourSetIdFor` returns the mapped ID, otherwise an exact-case code match, otherwise a case-insensitive code match, otherwise null.

**Matching rule:** a Limitless set maps to one of our Japanese sets when either:
- the codes are equal, ignoring case; or
- the Japanese name from Limitless's `data-tooltip` equals our `name_ja` exactly **and** the release dates are equal.

Anything else counts as "Limitless-only" and becomes a new set in Task 7.

- [ ] **Step 1: Write the generator**

```ts
// scripts/gen-limitless-set-map.ts
// Run: pnpm tsx scripts/gen-limitless-set-map.ts  (reads the DB, ~5 min at 1 req/s)
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { createServiceClient, selectAll } from "@pcg/db";
import { limitless } from "@pcg/connectors";

const db = createServiceClient();
const ours = await selectAll<{ id: string; name_ja: string | null; release_date: string | null }>((f, t) =>
  db.from("sets").select("id,name_ja,release_date").eq("language", "ja").order("id").range(f, t));
const byCode = new Map(ours.map((s) => [s.id.toLowerCase().replace(/^ja-/, ""), s.id]));
const map: Record<string, string> = {};
const unmatchedOurs = new Set(ours.map((s) => s.id));
for (const s of await limitless.listSets()) {
  const direct = byCode.get(s.code.toLowerCase());
  if (direct) { if (direct !== s.code) map[s.code] = direct; unmatchedOurs.delete(direct); continue; }
  const page = await limitless.getSet(s.code);
  const hit = ours.filter((o) => o.name_ja && o.name_ja === page.nameJa && o.release_date === (page.releaseDate ?? s.releaseDate));
  if (hit.length === 1) { map[s.code] = hit[0]!.id; unmatchedOurs.delete(hit[0]!.id); }
  else if (hit.length > 1) console.warn(`AMBIGUOUS ${s.code}: ${hit.map((h) => h.id).join(", ")}`);
}
const body = Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n");
writeFileSync(new URL("../packages/connectors/src/limitless/ja-set-map.ts", import.meta.url), `/**
 * Limitless code -> our set id, where they differ. Generated by scripts/gen-limitless-set-map.ts on ${new Date().toISOString().slice(0, 10)}
 * (exact code match ignoring case, else exact Japanese name AND release date). Reviewed before commit.
 */
export const LIMITLESS_TO_OURS: Record<string, string> = {
${body}
};

export function ourSetIdFor(limitlessCode: string, ourIds: ReadonlySet<string>): string | null {
  const mapped = LIMITLESS_TO_OURS[limitlessCode];
  if (mapped) return mapped;
  if (ourIds.has(limitlessCode)) return limitlessCode;
  const lower = limitlessCode.toLowerCase();
  for (const id of ourIds) if (id.toLowerCase() === lower || id.toLowerCase() === \`ja-\${lower}\`) return id;
  return null;
}
`);
console.log(`mapped ${Object.keys(map).length}; our JA sets with no Limitless match: ${[...unmatchedOurs].sort().join(", ")}`);
```

- [ ] **Step 2: Run it against the linked DB**

Run: `pnpm tsx scripts/gen-limitless-set-map.ts 2>&1 | tee /tmp/limitless-map.log`
Expected:
- the run ends with `mapped N; our JA sets with no Limitless match: …`;
- no `AMBIGUOUS` lines. If there are any, resolve each one by hand in the generated file, using the Japanese name, date and card count, and note it in the commit message;
- the unmatched list should be pre-2010 sets plus `SV-P` and `M-P`, which Limitless lists under different promo codes. Record the list for Task 6.

- [ ] **Step 3: Write the test**

```ts
// packages/connectors/test/limitless-set-map.test.ts
import { describe, it, expect } from "vitest";
import { LIMITLESS_TO_OURS, ourSetIdFor } from "../src/limitless/ja-set-map";

describe("limitless set map", () => {
  const ours = new Set(["SV11B", "sm2+", "ja-neo1", ...Object.values(LIMITLESS_TO_OURS)]);
  it("maps every entry to a distinct set of ours", () => {
    const targets = Object.values(LIMITLESS_TO_OURS);
    expect(new Set(targets).size).toBe(targets.length);
  });
  it("prefers the map, then exact code, then case-insensitive code", () => {
    expect(ourSetIdFor("SV11B", ours)).toBe("SV11B");
    expect(ourSetIdFor("SM2+", ours)).toBe("sm2+");
    expect(ourSetIdFor("NEO1", ours)).toBe("ja-neo1");
    expect(ourSetIdFor("ZZZ9", ours)).toBeNull();
  });
});
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @pcg/connectors exec vitest run test/limitless-set-map.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/gen-limitless-set-map.ts packages/connectors/src/limitless/ja-set-map.ts packages/connectors/test/limitless-set-map.test.ts
git commit -m "feat(connectors): Limitless to TCGdex Japanese set map (exact code, or exact name and date)"
```

---

### Task 6: TCGdex import gains series, logos and vintage English names, and respects Limitless-owned sets

**Files:**
- Create: `packages/connectors/src/tcgdex/ja-set-names.ts`
- Modify: `packages/connectors/src/tcgdex/index.ts`
- Modify: `apps/ingest/src/jobs/catalog-tcgdex.ts`
- Modify: `packages/db/src/repo/catalog.ts` (add `loadLimitlessOwnedSetIds`)
- Modify: `packages/connectors/test/tcgdex.test.ts`
- Create: `apps/ingest/test/catalog-tcgdex.test.ts`

**Interfaces:**
- Consumes: `translateJaCardName` (Task 3).
- Produces:
  ```ts
  // tcgdex/index.ts
  export const JA_SERIES: Record<string, string>;
  export function seriesFor(lang: Language, set: TcgdexSet): string | null;
  export function logoFor(set: TcgdexSet): string | null; // set.logo ? `${set.logo}.png` : null
  // toSetRow(lang, set, id) now also sets series, logo_url, and name_en for JA from JA_SET_NAMES
  // toProductRows(lang, set, setId) now sets name_en = translateJaCardName(name) for JA, and image_source = "tcgdex" when there is an image
  export function withoutLimitlessOwned<T extends object>(row: T, kind: "set" | "product"): T; // drops name_en, rarity, image_url, image_source, series, logo_url
  // ja-set-names.ts
  export const JA_SET_NAMES: Record<string, { name_en: string; review: true }>;
  // db
  export async function loadLimitlessOwnedSetIds(db: Db): Promise<Set<string>>;
  ```
  `TcgdexSet` gains `logo?: string`.

- [ ] **Step 1: Write the vintage set names**

These are standard English names for Japanese sets that Limitless doesn't carry. Each entry has `review: true` until the user signs it off. Also add an entry for every other set in Task 5's "no Limitless match" list, using the same naming convention, with `review: true`. If you can't name a set with confidence, leave it out (its `name_en` stays null).

```ts
// packages/connectors/src/tcgdex/ja-set-names.ts
/** English names for Japanese sets Limitless does not carry. review: true until the user signs each off. */
export const JA_SET_NAMES: Record<string, { name_en: string; review: true }> = {
  PMCG1: { name_en: "Expansion Pack (Base Set)", review: true },
  PMCG2: { name_en: "Pokémon Jungle", review: true },
  PMCG3: { name_en: "Mystery of the Fossils", review: true },
  PMCG4: { name_en: "Rocket Gang", review: true },
  PMCG5: { name_en: "Leaders' Stadium", review: true },
  PMCG6: { name_en: "Challenge from the Darkness", review: true },
  "ja-neo1": { name_en: "Gold, Silver, to a New World...", review: true },
  "ja-neo2": { name_en: "Crossing the Ruins...", review: true },
  "ja-neo3": { name_en: "Awakening Legends", review: true },
  "ja-neo4": { name_en: "Darkness, and to Light...", review: true },
  VS1: { name_en: "Pokémon Card ★VS", review: true },
  web1: { name_en: "Pokémon Card ★web", review: true },
  E1: { name_en: "Base Expansion Pack (e-Card)", review: true },
  E2: { name_en: "The Town on No Map", review: true },
  E3: { name_en: "Wind from the Sea", review: true },
  E4: { name_en: "Split Earth", review: true },
  E5: { name_en: "Mysterious Mountains", review: true },
  ADV1: { name_en: "Expansion Pack (ADV)", review: true },
  ADV2: { name_en: "Miracle of the Desert", review: true },
  ADV3: { name_en: "Rulers of the Heavens", review: true },
  ADV4: { name_en: "Magma VS Aqua: Two Ambitions", review: true },
  ADV5: { name_en: "Undone Seal", review: true },
  PCG1: { name_en: "Flight of Legends", review: true },
  PCG2: { name_en: "Clash of the Blue Sky", review: true },
  PCG3: { name_en: "Rocket Gang Strikes Back", review: true },
  PCG4: { name_en: "Golden Sky, Silvery Ocean", review: true },
  PCG5: { name_en: "Mirage Forest", review: true },
  PCG6: { name_en: "Holon Research Tower", review: true },
  PCG7: { name_en: "Holon Phantom", review: true },
  PCG8: { name_en: "Miracle Crystal", review: true },
  PCG9: { name_en: "Offense and Defense of the Furthest Ends", review: true },
  PCG10: { name_en: "World Champions Pack", review: true },
  DP1a: { name_en: "Space-Time Creation: Diamond Collection", review: true },
  DP1b: { name_en: "Space-Time Creation: Pearl Collection", review: true },
  DP2: { name_en: "Secret of the Lakes", review: true },
  DP3: { name_en: "Shining Darkness", review: true },
  DP4a: { name_en: "Moonlit Pursuit", review: true },
  DP4b: { name_en: "Dawn Dash", review: true },
  DP5a: { name_en: "Cry from the Mysterious", review: true },
  DP5b: { name_en: "Temple of Anger", review: true },
  DP6: { name_en: "Intense Fight in the Destroyed Sky", review: true },
  Pt1: { name_en: "Galactic's Conquest", review: true },
  Pt2: { name_en: "Bonds to the End of Time", review: true },
  Pt3: { name_en: "Beat of the Frontier", review: true },
  Pt4: { name_en: "Advent of Arceus", review: true },
  L1a: { name_en: "HeartGold Collection", review: true },
  L1b: { name_en: "SoulSilver Collection", review: true },
  L2: { name_en: "Reviving Legends", review: true },
  LL: { name_en: "Lost Link", review: true },
  L3: { name_en: "Clash at the Summit", review: true },
};
```

- [ ] **Step 2: Write the failing tests**

Add these to `packages/connectors/test/tcgdex.test.ts`. Extend the import line with `seriesFor, logoFor, withoutLimitlessOwned`.

```ts
  it("maps series in English for both languages", () => {
    expect(seriesFor("ja", { ...(ja as TcgdexSet), serie: { id: "SV", name: "スカーレット&バイオレット" } })).toBe("Scarlet & Violet");
    expect(seriesFor("ja", { ...(ja as TcgdexSet), serie: { id: "PMCG", name: "x" } })).toBe("Original era");
    expect(seriesFor("en", { ...(en as TcgdexSet), serie: { id: "sv", name: "Scarlet & Violet" } })).toBe("Scarlet & Violet");
    expect(seriesFor("ja", { ...(ja as TcgdexSet), serie: undefined })).toBeNull();
  });
  it("uses the TCGdex logo as png", () => {
    expect(logoFor({ ...(en as TcgdexSet), logo: "https://assets.tcgdex.net/en/sv/sv04.5/logo" })).toBe("https://assets.tcgdex.net/en/sv/sv04.5/logo.png");
    expect(logoFor({ ...(en as TcgdexSet), logo: undefined })).toBeNull();
  });
  it("names vintage JA sets in English and translates vintage JA cards", () => {
    const pmcg: TcgdexSet = { id: "PMCG1", name: "拡張パック", releaseDate: "1996-10-20", cardCount: { total: 1, official: 102 }, serie: { id: "PMCG", name: "x" }, cards: [{ id: "PMCG1-4", localId: "4", name: "リザードン", image: null }] };
    expect(toSetRow("ja", pmcg)).toMatchObject({ name_en: "Expansion Pack (Base Set)", name_ja: "拡張パック", series: "Original era" });
    expect(toProductRows("ja", pmcg)[0]).toMatchObject({ name_en: "Charizard", name_ja: "リザードン", image_source: null });
  });
  it("tags TCGdex images with their source", () => {
    expect(toProductRows("ja", ja as TcgdexSet)[0]!.image_source).toBe("tcgdex");
  });
  it("strips Limitless-owned fields", () => {
    const row = { id: "x", name_en: "A", rarity: "R", image_url: "u", image_source: "limitless", series: "S", logo_url: "l", name_ja: "ja" };
    expect(withoutLimitlessOwned(row, "product")).toEqual({ id: "x", name_ja: "ja" });
  });
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `pnpm --filter @pcg/connectors exec vitest run test/tcgdex.test.ts`
Expected: FAIL, because `seriesFor` isn't exported.

- [ ] **Step 4: Implement in `packages/connectors/src/tcgdex/index.ts`**

Add these imports:

```ts
import { translateJaCardName } from "@pcg/domain";
import { JA_SET_NAMES } from "./ja-set-names";
```

Add `logo?: string;` to `TcgdexSet`. Then add:

```ts
/** Japanese TCGdex series ids -> English series names. */
export const JA_SERIES: Record<string, string> = {
  PMCG: "Original era", neo: "Neo", VS: "VS", web: "web", e: "e-Card", ADV: "ADV / PCG", PCG: "ADV / PCG",
  DP: "Diamond & Pearl", DPt: "Diamond & Pearl", L: "HeartGold & SoulSilver (LEGEND)", BW: "Black & White",
  XY: "XY", XYb: "XY", SM: "Sun & Moon", S: "Sword & Shield", SV: "Scarlet & Violet", M: "Mega",
};
export function seriesFor(lang: Language, set: TcgdexSet): string | null {
  if (!set.serie) return null;
  return lang === "en" ? set.serie.name : JA_SERIES[set.serie.id] ?? null;
}
export const logoFor = (set: TcgdexSet) => (set.logo ? `${set.logo}.png` : null);

const LIMITLESS_OWNED = ["name_en", "rarity", "image_url", "image_source", "series", "logo_url"] as const;
/** Copy of a row without the fields Limitless owns, so a TCGdex upsert never overwrites them. */
export function withoutLimitlessOwned<T extends object>(row: T, _kind: "set" | "product"): T {
  const out = { ...row } as Record<string, unknown>;
  for (const k of LIMITLESS_OWNED) delete out[k];
  return out as T;
}
```

In `toSetRow`, add these to the returned object:

```ts
    series: seriesFor(lang, set), logo_url: logoFor(set),
```

and change `name_en` to:

```ts
    name_en: lang === "en" ? set.name : JA_SET_NAMES[id]?.name_en ?? null,
```

In `toProductRows`, change the `name_en` and `image_url` lines to:

```ts
      name_en: lang === "en" ? c.name : translateJaCardName(c.name), name_ja: lang === "ja" ? c.name : null, rarity: null, language: lang,
      image_url: c.image ? `${c.image}/high.webp` : null, image_source: c.image ? "tcgdex" : null,
```

The supplement rows (`supplementSetRow`) need `series`: add `series: string` to `JaSupplementSet`, then fill each entry in `ja-supplement.ts`:
- `BW*`, `DS`, `EBB` and `SC` → `"Black & White"`;
- `DP*` → `"Diamond & Pearl"`;
- `Pt*` → `"Diamond & Pearl"`;
- `M6a` and `MF` → `"Mega"`;
- `WCS23` → `"Scarlet & Violet"`;
- `XY` → `"XY"`.

Return `series: s.series, name_en: JA_SET_NAMES[s.id]?.name_en ?? null` from `supplementSetRow`, and update its existing `toEqual` expectation in the tests to include `series: "Diamond & Pearl"`.

- [ ] **Step 5: Add the DB helper**

In `packages/db/src/repo/catalog.ts`:

```ts
export async function loadLimitlessOwnedSetIds(db: Db): Promise<Set<string>> {
  const rows = must(await db.from("sets").select("id").eq("source", "limitless")) as { id: string }[];
  return new Set(rows.map((r) => r.id));
}
```

- [ ] **Step 6: Make the job respect Limitless-owned sets**

In `apps/ingest/src/jobs/catalog-tcgdex.ts`:
- import `loadLimitlessOwnedSetIds`;
- load `const owned = await loadLimitlessOwnedSetIds(db);` before the loop;
- replace the two upserts with:

```ts
      const setRow = tcgdex.toSetRow(lang, full, id);
      await upsertSets(db, [owned.has(id) ? tcgdex.withoutLimitlessOwned(setRow, "set") : setRow]);
      const rows = tcgdex.toProductRows(lang, full, id);
      await upsertProducts(db, owned.has(id) ? rows.map((r) => tcgdex.withoutLimitlessOwned(r, "product")) : rows);
```

Also skip supplement rows whose ID is in `owned`.

Write `apps/ingest/test/catalog-tcgdex.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@pcg/connectors", async (orig) => {
  const real = await orig<typeof import("@pcg/connectors")>();
  const set = { id: "SV11B", name: "ブラックボルト", releaseDate: "2025-06-06", cardCount: { total: 1, official: 86 }, serie: { id: "SV", name: "x" }, cards: [{ id: "SV11B-001", localId: "001", name: "ツタージャ", image: null }] };
  return { ...real, tcgdex: { ...real.tcgdex, listSets: vi.fn(async (l: string) => (l === "ja" ? [set] : [])), getSet: vi.fn(async () => set), JA_SUPPLEMENT_SETS: [] } };
});
const upserts: { table: string; rows: Record<string, unknown>[] }[] = [];
vi.mock("@pcg/db", async (orig) => ({
  ...(await orig<typeof import("@pcg/db")>()),
  loadLimitlessOwnedSetIds: vi.fn(async () => new Set(["SV11B"])),
  upsertSets: vi.fn(async (_db: unknown, rows: Record<string, unknown>[]) => { upserts.push({ table: "sets", rows }); }),
  upsertProducts: vi.fn(async (_db: unknown, rows: Record<string, unknown>[]) => { upserts.push({ table: "products", rows }); }),
}));

describe("catalog:tcgdex on a Limitless-owned set", () => {
  it("never writes the fields Limitless owns", async () => {
    const { catalogTcgdex } = await import("../src/jobs/catalog-tcgdex");
    await catalogTcgdex({ db: {} as never, log: () => {} });
    const product = upserts.find((u) => u.table === "products")!.rows[0]!;
    const set = upserts.find((u) => u.table === "sets" && u.rows[0]?.id === "SV11B")!.rows[0]!;
    for (const k of ["name_en", "rarity", "image_url", "image_source"]) expect(product).not.toHaveProperty(k);
    for (const k of ["name_en", "series", "logo_url"]) expect(set).not.toHaveProperty(k);
    expect(product).toMatchObject({ id: "SV11B-001", name_ja: "ツタージャ" });
  });
});
```

- [ ] **Step 7: Run the tests and typecheck**

Run: `pnpm --filter @pcg/connectors exec vitest run test/tcgdex.test.ts && pnpm --filter @pcg/ingest exec vitest run test/catalog-tcgdex.test.ts && pnpm typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add packages/connectors/src/tcgdex packages/connectors/test/tcgdex.test.ts packages/db/src/repo/catalog.ts apps/ingest/src/jobs/catalog-tcgdex.ts apps/ingest/test/catalog-tcgdex.test.ts
git commit -m "feat(catalog): TCGdex sets get series, logos and vintage English names, and leave Limitless-owned fields alone"
```

---

### Task 7: `catalog:limitless` job (merge into TCGdex sets, add Limitless-only sets)

**Files:**
- Create: `packages/domain/src/limitless-merge.ts`
- Create: `packages/domain/test/limitless-merge.test.ts`
- Create: `apps/ingest/src/jobs/catalog-limitless.ts`
- Modify: `apps/ingest/src/cli.ts` (register `"catalog:limitless"`)
- Modify: `apps/ingest/src/run.ts` (add `"catalog:limitless": "CONNECTOR_LIMITLESS"` to `KILL_SWITCH`)
- Modify: `.env.example` (add `CONNECTOR_LIMITLESS=on`)
- Modify: `packages/db/src/repo/catalog.ts` (add `loadSetProducts`, `loadSetIds`)
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes:
  - `limitless.listSets`, `limitless.getSet`, `limitless.ourSetIdFor` (Tasks 4–5);
  - `numberFromCatalog` from `@pcg/domain`;
  - `upsertSets`, `upsertProducts`.
- Produces:
  ```ts
  // domain
  export interface MergeCard { number: string; nameJa: string | null; nameEn: string | null; rarity: string | null; imageXs: string | null }
  export interface ExistingProduct { id: string; number_num: number | null; number_suffix: string | null; image_url: string | null }
  export interface MergedProductPatch { id: string; name_en: string | null; rarity: string | null; isNew: boolean; number: string; nameJa: string | null; imageXs: string | null; hasImage: boolean }
  export function mergeLimitlessCards(setId: string, existing: ExistingProduct[], cards: MergeCard[]): MergedProductPatch[];
  // db
  export async function loadSetProducts(db: Db, setId: string): Promise<ProductRow[]>; // full rows, so existing cards can be re-upserted whole
  export async function loadSetIds(db: Db, language: Language): Promise<Set<string>>;
  ```
  `limitless_image_xs` isn't stored. Task 8 rebuilds the image URL from the set code and number using Limitless's fixed pattern `tpc/{CODE}/{CODE}_{n}_R_JP_SM.png`, so it needs `limitless_code` on the set. When our set ID differs from the code, the merge saves the code into `sets.limitless_code`.

**Merge rules (spec §4.1):**
- A card matches an existing product when the Limitless number is numeric and equals `number_num`, among existing products with a null `number_suffix`.
- Limitless numbers that aren't numeric only match an existing product whose `number_printed` equals them exactly. If there's no match, they're created as new products.
- A matched product gets `name_en` and `rarity` from Limitless, and keeps its ID and `name_ja`.
- An unmatched card becomes a new product, with ID `{setId}-{number padded to 3 digits if numeric}`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/test/limitless-merge.test.ts
import { describe, it, expect } from "vitest";
import { mergeLimitlessCards } from "../src/limitless-merge";

const existing = [
  { id: "SV11B-001", number_num: 1, number_suffix: null, image_url: null },
  { id: "SV11B-002", number_num: 2, number_suffix: null, image_url: "https://assets.tcgdex.net/x" },
  { id: "SV11B-x", number_num: null, number_suffix: null, image_url: null },
];
const card = (number: string, nameEn: string | null = "N") => ({ number, nameJa: "ジャ", nameEn, rarity: "Common", imageXs: `https://cdn/tpc/SV11B/SV11B_${number}_R_JP_XS.png` });

describe("mergeLimitlessCards", () => {
  it("matches by number and keeps our id", () => {
    const [a] = mergeLimitlessCards("SV11B", existing, [card("1", "Snivy")]);
    expect(a).toMatchObject({ id: "SV11B-001", isNew: false, name_en: "Snivy", rarity: "Common", hasImage: false });
  });
  it("reports an existing image so it is not replaced", () => {
    expect(mergeLimitlessCards("SV11B", existing, [card("2")])[0]).toMatchObject({ id: "SV11B-002", hasImage: true });
  });
  it("adds unmatched cards with a padded id", () => {
    expect(mergeLimitlessCards("SV11B", existing, [card("173", "N's Plot")])[0]).toMatchObject({ id: "SV11B-173", isNew: true, number: "173" });
  });
  it("never merges a non-numeric number into a numeric card", () => {
    expect(mergeLimitlessCards("SV11B", existing, [card("TG01")])[0]).toMatchObject({ id: "SV11B-TG01", isNew: true });
  });
  it("keeps a null English name rather than inventing one", () => {
    expect(mergeLimitlessCards("SV11B", existing, [card("1", null)])[0]!.name_en).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @pcg/domain exec vitest run test/limitless-merge.test.ts`
Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Implement the merge**

```ts
// packages/domain/src/limitless-merge.ts
export interface MergeCard { number: string; nameJa: string | null; nameEn: string | null; rarity: string | null; imageXs: string | null }
export interface ExistingProduct { id: string; number_num: number | null; number_suffix: string | null; image_url: string | null }
export interface MergedProductPatch { id: string; name_en: string | null; rarity: string | null; isNew: boolean; number: string; nameJa: string | null; imageXs: string | null; hasImage: boolean }

export function mergeLimitlessCards(setId: string, existing: ExistingProduct[], cards: MergeCard[]): MergedProductPatch[] {
  const byNum = new Map(existing.filter((p) => p.number_num != null && p.number_suffix == null).map((p) => [p.number_num!, p]));
  return cards.map((c) => {
    const numeric = /^\d{1,3}$/.test(c.number);
    const hit = numeric ? byNum.get(Number.parseInt(c.number, 10)) : undefined;
    const id = hit?.id ?? `${setId}-${numeric ? c.number.padStart(3, "0") : c.number}`;
    return { id, name_en: c.nameEn, rarity: c.rarity, isNew: !hit, number: c.number, nameJa: c.nameJa, imageXs: c.imageXs, hasImage: hit?.image_url != null };
  });
}
```

Add `export * from "./limitless-merge";` to `packages/domain/src/index.ts`.

- [ ] **Step 4: Add the DB helpers**

In `packages/db/src/repo/catalog.ts`, add the import `import { selectAll } from "../paginate";` and:

```ts
export async function loadSetProducts(db: Db, setId: string): Promise<ProductRow[]> {
  return selectAll<ProductRow>((f, t) =>
    db.from("products").select("id,set_id,number_printed,number_num,number_denom,number_suffix,name_en,name_ja,rarity,language,image_url,image_source").eq("set_id", setId).order("id").range(f, t));
}
export async function loadSetIds(db: Db, language: Language): Promise<Set<string>> {
  const rows = await selectAll<{ id: string }>((f, t) => db.from("sets").select("id").eq("language", language).order("id").range(f, t));
  return new Set(rows.map((r) => r.id));
}
```

- [ ] **Step 5: Write the job**

```ts
// apps/ingest/src/jobs/catalog-limitless.ts
import type { Job } from "../run";
import { limitless } from "@pcg/connectors";
import { mergeLimitlessCards, numberFromCatalog } from "@pcg/domain";
import { upsertSets, upsertProducts, loadSetProducts, loadSetIds, type ProductRow } from "@pcg/db";

/** Japanese 2010+: Limitless owns names, rarity and card lists; TCGdex keeps ids and Japanese names. */
export const catalogLimitless: Job = async ({ db, log }) => {
  const ours = await loadSetIds(db, "ja");
  const enIds = await loadSetIds(db, "en");
  let sets = 0, created = 0, updated = 0;
  for (const s of await limitless.listSets()) {
    const page = await limitless.getSet(s.code);
    if (page.cards.length === 0) { log(`skip ${s.code}: no cards listed`); continue; }
    const existingId = limitless.ourSetIdFor(s.code, ours);
    const setId = existingId ?? (enIds.has(s.code) ? `ja-${s.code}` : s.code);
    await upsertSets(db, [{
      id: setId, printed_code: s.code, language: "ja", name_en: s.nameEn, name_ja: page.nameJa,
      release_date: s.releaseDate ?? page.releaseDate, card_count: s.cardCount, aliases: setId === s.code ? [] : [s.code],
      series: s.series, source: "limitless", limitless_code: setId === s.code ? null : s.code,
    }]);
    const existing = existingId ? await loadSetProducts(db, setId) : [];
    const byId = new Map(existing.map((p) => [p.id, p]));
    const patches = mergeLimitlessCards(setId, existing, page.cards);
    // Whole rows only: an upsert with missing NOT NULL columns fails even when the row exists.
    await upsertProducts(db, patches.map((p): ProductRow => {
      const old = byId.get(p.id);
      if (old) return { ...old, name_en: p.name_en, rarity: p.rarity };
      const n = numberFromCatalog(/^\d{1,3}$/.test(p.number) ? p.number.padStart(3, "0") : p.number, { id: setId, cardCountOfficial: null });
      return { id: p.id, set_id: setId, number_printed: n?.printed ?? p.number, number_num: n?.num ?? null, number_denom: null, number_suffix: n?.suffix ?? null,
        name_en: p.name_en, name_ja: p.nameJa, rarity: p.rarity, language: "ja", image_url: null, image_source: null };
    }));
    sets += 1; created += patches.filter((p) => p.isNew).length; updated += patches.filter((p) => !p.isNew).length;
    if (!existingId) ours.add(setId);
  }
  log(`${sets} sets, ${created} new cards, ${updated} cards updated`);
  return { items_seen: sets, items_new: created, items_updated: updated };
};
```

Register `"catalog:limitless": catalogLimitless` in `cli.ts`, add the kill switch to `run.ts`, and add `CONNECTOR_LIMITLESS=on` to `.env.example`.

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm --filter @pcg/domain exec vitest run test/limitless-merge.test.ts && pnpm test && pnpm typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/limitless-merge.ts packages/domain/test/limitless-merge.test.ts packages/domain/src/index.ts apps/ingest/src/jobs/catalog-limitless.ts apps/ingest/src/cli.ts apps/ingest/src/run.ts .env.example packages/db/src/repo/catalog.ts
git commit -m "feat(ingest): catalog:limitless merges Japanese 2010+ names, rarity and card lists"
```

---

### Task 8: `images:ja` job (Limitless logos and card images into storage, small WebP)

**Files:**
- Create: `apps/ingest/src/jobs/images-ja.ts`
- Create: `apps/ingest/test/images-ja.test.ts`
- Modify: `apps/ingest/package.json` (add `sharp`)
- Modify: `packages/db/src/repo/catalog.ts` (add `loadJaImageWork`, `setLogoUrl`, `setCardImage`)
- Create: `packages/db/src/repo/storage.ts` (`uploadPublic`)
- Modify: `packages/db/src/index.ts`
- Modify: `apps/ingest/src/cli.ts` and `run.ts` (register `"images:ja"` under kill switch `CONNECTOR_LIMITLESS`)

**Interfaces:**
- Produces:
  ```ts
  export async function uploadPublic(db: Db, bucket: "set-logos" | "card-images", path: string, body: Buffer, contentType: string): Promise<string>; // returns the public URL
  export async function loadJaImageWork(db: Db, opts: { replaceLimitless: boolean }): Promise<{ sets: { id: string; code: string }[]; cards: { id: string; set_id: string; code: string; number: string }[] }>;
  export async function setLogoUrl(db: Db, setId: string, url: string): Promise<void>;
  export async function setCardImage(db: Db, productId: string, url: string): Promise<void>; // sets image_source = 'limitless'
  export function cardImageUrl(code: string, number: string, size: "SM" | "LG"): string; // in images-ja.ts
  export function imagesJa(opts: { size: "SM" | "LG"; fetchImpl?: typeof fetch; toWebp?: (b: Buffer) => Promise<Buffer> }): Job;
  ```
- `loadJaImageWork` returns:
  - Japanese sets with `logo_url is null`, along with their Limitless code: `limitless_code ?? printed_code ?? id`;
  - Japanese cards in `source='limitless'` sets where `image_url is null`, or where `image_source = 'limitless'` when `replaceLimitless` is true (used for the `--size lg` upgrade).

  The card number is `number_num` as a string, or `number_printed` when that's null.

- [ ] **Step 1: Install sharp**

Run: `pnpm --filter @pcg/ingest add sharp@^0.33.5`
Expected: it installs. On macOS arm64 the prebuilt binary resolves.

- [ ] **Step 2: Write the failing test**

```ts
// apps/ingest/test/images-ja.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const calls = { logo: [] as string[], card: [] as string[], uploads: [] as string[] };
vi.mock("@pcg/db", async (orig) => ({
  ...(await orig<typeof import("@pcg/db")>()),
  loadJaImageWork: vi.fn(async () => ({
    sets: [{ id: "SV11B", code: "SV11B" }, { id: "XX", code: "XX" }],
    cards: [{ id: "SV11B-001", set_id: "SV11B", code: "SV11B", number: "1" }, { id: "SV11B-002", set_id: "SV11B", code: "SV11B", number: "2" }],
  })),
  uploadPublic: vi.fn(async (_db: unknown, bucket: string, path: string) => { calls.uploads.push(`${bucket}/${path}`); return `https://store/${bucket}/${path}`; }),
  setLogoUrl: vi.fn(async (_db: unknown, id: string) => { calls.logo.push(id); }),
  setCardImage: vi.fn(async (_db: unknown, id: string) => { calls.card.push(id); }),
}));
vi.mock("@pcg/connectors", async (orig) => ({ ...(await orig<typeof import("@pcg/connectors")>()), _resetForTests: () => {} }));

const png = new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
beforeEach(() => { calls.logo = []; calls.card = []; calls.uploads = []; });

describe("images:ja", () => {
  it("uploads logos and small WebP card images, skipping 404s and non-images", async () => {
    const { imagesJa, cardImageUrl } = await import("../src/jobs/images-ja");
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/XX.png")) return new Response("nope", { status: 404 });
      if (url.includes("SV11B_2_")) return new Response("<html>", { headers: { "content-type": "text/html" } });
      return png.clone();
    }) as unknown as typeof fetch;
    const stats = await imagesJa({ size: "SM", fetchImpl, toWebp: async (b) => b })({ db: {} as never, log: () => {} });
    expect(cardImageUrl("SV11B", "1", "SM")).toBe("https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SV11B/SV11B_1_R_JP_SM.png");
    expect(calls.logo).toEqual(["SV11B"]);
    expect(calls.card).toEqual(["SV11B-001"]);
    expect(calls.uploads).toEqual(["set-logos/ja/SV11B.png", "card-images/ja/SV11B/SV11B-001.webp"]);
    expect(stats).toMatchObject({ items_seen: 4, items_new: 2 });
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `pnpm --filter @pcg/ingest exec vitest run test/images-ja.test.ts`
Expected: FAIL, "Cannot find module '../src/jobs/images-ja'".

- [ ] **Step 4: Add the storage and DB helpers**

```ts
// packages/db/src/repo/storage.ts
import type { Db } from "../client";

export async function uploadPublic(db: Db, bucket: "set-logos" | "card-images", path: string, body: Buffer, contentType: string): Promise<string> {
  const { error } = await db.storage.from(bucket).upload(path, body, { contentType, upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(`upload ${bucket}/${path}: ${error.message}`);
  return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
```

Export it from `packages/db/src/index.ts` (`export * from "./repo/storage";`). Then add to `catalog.ts`:

```ts
export async function loadJaImageWork(db: Db, opts: { replaceLimitless: boolean }) {
  const sets = await selectAll<{ id: string; printed_code: string | null; limitless_code: string | null; logo_url: string | null; source: string }>((f, t) =>
    db.from("sets").select("id,printed_code,limitless_code,logo_url,source").eq("language", "ja").order("id").range(f, t));
  const code = (s: (typeof sets)[number]) => s.limitless_code ?? s.printed_code ?? s.id;
  const owned = sets.filter((s) => s.source === "limitless");
  const cards: { id: string; set_id: string; code: string; number: string }[] = [];
  for (const s of owned) {
    const rows = await selectAll<{ id: string; number_num: number | null; number_printed: string; image_url: string | null; image_source: string | null }>((f, t) =>
      db.from("products").select("id,number_num,number_printed,image_url,image_source").eq("set_id", s.id).order("id").range(f, t));
    for (const p of rows) if (p.image_url == null || (opts.replaceLimitless && p.image_source === "limitless"))
      cards.push({ id: p.id, set_id: s.id, code: code(s), number: p.number_num != null ? String(p.number_num) : p.number_printed });
  }
  return { sets: sets.filter((s) => s.logo_url == null).map((s) => ({ id: s.id, code: code(s) })), cards };
}
export async function setLogoUrl(db: Db, setId: string, url: string) { must(await db.from("sets").update({ logo_url: url }).eq("id", setId)); }
export async function setCardImage(db: Db, productId: string, url: string) { must(await db.from("products").update({ image_url: url, image_source: "limitless" }).eq("id", productId)); }
```

- [ ] **Step 5: Write the job**

```ts
// apps/ingest/src/jobs/images-ja.ts
import sharp from "sharp";
import type { Job } from "../run";
import { limitless, PausedError } from "@pcg/connectors";
import { loadJaImageWork, uploadPublic, setLogoUrl, setCardImage } from "@pcg/db";

const CDN = "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc";
export const cardImageUrl = (code: string, number: string, size: "SM" | "LG") => `${CDN}/${code}/${code}_${number}_R_JP_${size}.png`;
const UA = { "User-Agent": `PCGMarketsBot/0.1 (+mailto:${process.env.CONTACT_EMAIL ?? "unset"})` };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Copies Limitless JA logos and card images into our storage. Re-runs skip what is already copied. */
export function imagesJa(opts: { size: "SM" | "LG"; fetchImpl?: typeof fetch; toWebp?: (b: Buffer) => Promise<Buffer> }): Job {
  const get = opts.fetchImpl ?? fetch;
  const toWebp = opts.toWebp ?? ((b: Buffer) => sharp(b).webp({ quality: 80 }).toBuffer());
  return async ({ db, log }) => {
    const work = await loadJaImageWork(db, { replaceLimitless: opts.size === "LG" });
    let seen = 0, copied = 0, missing = 0;
    const fetchPng = async (url: string): Promise<Buffer | null> => {
      const res = await get(url, { headers: UA });
      if (res.status === 403 || res.status === 429) throw new PausedError(res.status, url);
      if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
      return Buffer.from(await res.arrayBuffer());
    };
    for (const s of work.sets) {
      seen += 1;
      const png = await fetchPng(limitless.logoUrl(s.code));
      await sleep(1000);
      if (!png) { missing += 1; continue; }
      await setLogoUrl(db, s.id, await uploadPublic(db, "set-logos", `ja/${s.id}.png`, png, "image/png"));
      copied += 1;
    }
    const queue = [...work.cards];
    const worker = async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        seen += 1;
        const png = await fetchPng(cardImageUrl(c.code, c.number, opts.size));
        if (!png) { missing += 1; continue; }
        const url = await uploadPublic(db, "card-images", `ja/${c.set_id}/${c.id}.webp`, await toWebp(png), "image/webp");
        await setCardImage(db, c.id, url);
        copied += 1;
        await sleep(250);
      }
    };
    await Promise.all([worker(), worker()]);
    log(`copied ${copied}, missing ${missing} (logos ${work.sets.length}, cards ${work.cards.length}, size ${opts.size})`);
    return { items_seen: seen, items_new: copied, items_updated: 0 };
  };
}
```

Register it in `cli.ts` as `"images:ja": imagesJa({ size: flags.includes("--size") && flags[flags.indexOf("--size") + 1] === "lg" ? "LG" : "SM" })`. Add `"images:ja": "CONNECTOR_LIMITLESS"` to `KILL_SWITCH`.

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm --filter @pcg/ingest exec vitest run test/images-ja.test.ts && pnpm typecheck`
Expected: PASS. The test's card order is deterministic because the second card is skipped as non-image.

- [ ] **Step 7: Commit**

```bash
git add apps/ingest packages/db/src pnpm-lock.yaml
git commit -m "feat(ingest): images:ja copies Limitless logos and small WebP card images into storage"
```

---

### Task 9: `images:en` job (pokemontcg.io fills missing English images)

**Files:**
- Create: `packages/connectors/src/pokemontcg/index.ts`
- Create: `packages/connectors/src/pokemontcg/set-map.ts`
- Create: `packages/connectors/test/pokemontcg.test.ts`
- Create: `apps/ingest/src/jobs/images-en.ts`
- Modify: `packages/connectors/src/index.ts` (`export * as pokemontcg from "./pokemontcg";`)
- Modify: `packages/db/src/repo/catalog.ts` (add `loadEnMissingImages`, `setCardImageFrom`)
- Modify: `apps/ingest/src/cli.ts` (register `"images:en"`)

**Interfaces:**
- Produces:
  ```ts
  export const PTCG_SET_MAP: Record<string, string>; // our TCGdex EN set id -> pokemontcg.io set id
  export const ptcgSetId: (ourId: string) => string; // mapped id, else the same id
  export interface PtcgCard { number: string; small: string }
  export async function listCards(ptcgSet: string): Promise<PtcgCard[]>; // pages /v2/cards?q=set.id:X&select=number,images&pageSize=250
  export function matchImages(ours: { id: string; number_printed: string; number_num: number | null }[], theirs: PtcgCard[]): { id: string; url: string }[];
  // db
  export async function loadEnMissingImages(db: Db): Promise<Map<string, { id: string; number_printed: string; number_num: number | null }[]>>; // by set id
  export async function setCardImageFrom(db: Db, productId: string, url: string, source: "pokemontcg"): Promise<void>;
  ```
- Matching: a card matches when the pokemontcg.io `number` equals our `number_num` as a string, or equals the part of our `number_printed` before any `/`, ignoring case and leading zeros.

- [ ] **Step 1: Write the failing test**

```ts
// packages/connectors/test/pokemontcg.test.ts
import { describe, it, expect } from "vitest";
import { matchImages, ptcgSetId } from "../src/pokemontcg";

describe("pokemontcg", () => {
  it("maps set ids that differ", () => {
    expect(ptcgSetId("swsh4.5sv")).toBe("swsh45sv");
    expect(ptcgSetId("tk-ex-latia")).toBe("tk1a");
    expect(ptcgSetId("swshp")).toBe("swshp");
  });
  it("matches by number, ignoring leading zeros and case", () => {
    const ours = [
      { id: "swshp-SWSH050", number_printed: "SWSH050", number_num: null },
      { id: "svp-001", number_printed: "001/SVP", number_num: 1 },
      { id: "svp-999", number_printed: "999", number_num: 999 },
    ];
    const theirs = [{ number: "SWSH050", small: "https://images.pokemontcg.io/swshp/SWSH050.png" }, { number: "1", small: "https://images.pokemontcg.io/svp/1.png" }];
    expect(matchImages(ours, theirs)).toEqual([
      { id: "swshp-SWSH050", url: "https://images.pokemontcg.io/swshp/SWSH050.png" },
      { id: "svp-001", url: "https://images.pokemontcg.io/svp/1.png" },
    ]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @pcg/connectors exec vitest run test/pokemontcg.test.ts`
Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Implement**

```ts
// packages/connectors/src/pokemontcg/set-map.ts
/** Our TCGdex EN set id -> pokemontcg.io set id where they differ (checked against /v2/sets on 2026-10-21). */
export const PTCG_SET_MAP: Record<string, string> = {
  "swsh4.5sv": "swsh45sv", "swsh12.5gg": "swsh12pt5gg", "sv03.5": "sv3pt5", "sv08.5": "sv8pt5",
  "tk-ex-latia": "tk1a", "tk-ex-latio": "tk1b", "tk-ex-p": "tk2a", "tk-ex-m": "tk2b",
  cel25cc: "cel25c", "2011bw": "mcd11", "2012bw": "mcd12", "2014xy": "mcd14", "2015xy": "mcd15", "2016xy": "mcd16",
  "2017sm": "mcd17", "2018sm": "mcd18", "2019sm": "mcd19", "2021swsh": "mcd21", "2022swsh": "mcd22",
};
```

```ts
// packages/connectors/src/pokemontcg/index.ts
import { politeFetch } from "../http";
import { PTCG_SET_MAP } from "./set-map";
export { PTCG_SET_MAP } from "./set-map";

export interface PtcgCard { number: string; small: string }
export const ptcgSetId = (ourId: string) => PTCG_SET_MAP[ourId] ?? ourId;
const norm = (s: string) => s.split("/")[0]!.trim().toUpperCase().replace(/^0+(?=\d)/, "");

export async function listCards(ptcgSet: string): Promise<PtcgCard[]> {
  const out: PtcgCard[] = [];
  for (let page = 1; ; page += 1) {
    const url = `https://api.pokemontcg.io/v2/cards?q=set.id:${encodeURIComponent(ptcgSet)}&select=number,images&pageSize=250&page=${page}`;
    const res = await politeFetch(url, { minIntervalMs: 1000, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`pokemontcg ${ptcgSet}: ${res.status}`);
    const body = (await res.json()) as { data: { number: string; images: { small: string } }[]; totalCount: number };
    out.push(...body.data.map((c) => ({ number: c.number, small: c.images.small })));
    if (out.length >= body.totalCount || body.data.length === 0) return out;
  }
}

export function matchImages(ours: { id: string; number_printed: string; number_num: number | null }[], theirs: PtcgCard[]) {
  const byNum = new Map(theirs.map((c) => [norm(c.number), c.small]));
  const out: { id: string; url: string }[] = [];
  for (const p of ours) {
    const url = byNum.get(p.number_num != null ? String(p.number_num) : norm(p.number_printed)) ?? byNum.get(norm(p.number_printed));
    if (url) out.push({ id: p.id, url });
  }
  return out;
}
```

- [ ] **Step 4: Add the DB helpers and the job**

In `catalog.ts`:

```ts
export async function loadEnMissingImages(db: Db) {
  const rows = await selectAll<{ id: string; set_id: string; number_printed: string; number_num: number | null }>((f, t) =>
    db.from("products").select("id,set_id,number_printed,number_num").eq("language", "en").is("image_url", null).order("id").range(f, t));
  const bySet = new Map<string, { id: string; number_printed: string; number_num: number | null }[]>();
  for (const r of rows) bySet.set(r.set_id, [...(bySet.get(r.set_id) ?? []), r]);
  return bySet;
}
export async function setCardImageFrom(db: Db, productId: string, url: string, source: "pokemontcg") {
  must(await db.from("products").update({ image_url: url, image_source: source }).eq("id", productId));
}
```

```ts
// apps/ingest/src/jobs/images-en.ts
import type { Job } from "../run";
import { pokemontcg } from "@pcg/connectors";
import { loadEnMissingImages, setCardImageFrom } from "@pcg/db";

export const imagesEn: Job = async ({ db, log }) => {
  const bySet = await loadEnMissingImages(db);
  let seen = 0, filled = 0;
  for (const [setId, cards] of bySet) {
    seen += cards.length;
    let theirs: pokemontcg.PtcgCard[];
    try { theirs = await pokemontcg.listCards(pokemontcg.ptcgSetId(setId)); }
    catch (e) { log(`skip ${setId}: ${e instanceof Error ? e.message : String(e)}`); continue; }
    for (const m of pokemontcg.matchImages(cards, theirs)) { await setCardImageFrom(db, m.id, m.url, "pokemontcg"); filled += 1; }
  }
  log(`filled ${filled} of ${seen} missing English images`);
  return { items_seen: seen, items_new: filled, items_updated: 0 };
};
```

Register `"images:en": imagesEn` in `cli.ts`, and add `export * as pokemontcg from "./pokemontcg";` to connectors' `index.ts`.

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm --filter @pcg/connectors exec vitest run test/pokemontcg.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/connectors/src/pokemontcg packages/connectors/test/pokemontcg.test.ts packages/connectors/src/index.ts packages/db/src/repo/catalog.ts apps/ingest/src/jobs/images-en.ts apps/ingest/src/cli.ts
git commit -m "feat(ingest): images:en links missing English card images from pokemontcg.io"
```

---

### Task 10: Web data layer for the sets pages

**Files:**
- Create: `apps/web/lib/sets-data.ts`
- Create: `apps/web/test/sets-data.test.ts`
- Modify: `apps/web/next.config.ts` (`remotePatterns`)

**Interfaces:**
- Consumes: `ESTIMATE_MAX_AGE_DAYS` from `@/lib/grades`, `selectAll` patterns, and `parseCardQuery`/`matchesCardQuery` from `@pcg/domain`.
- Produces:
  ```ts
  export type Lang = "en" | "ja";
  export const asLang: (v: string | undefined) => Lang;
  export interface SetTile { id: string; code: string | null; nameEn: string | null; nameJa: string | null; displayName: string; releaseDate: string | null; cardCount: number | null; officialCount: number | null; hasCards: boolean; logoUrl: string | null; series: string | null; saleCount: number; aliases: string[] }
  export interface SeriesGroup { series: string; sets: SetTile[] }
  export function groupBySeries(tiles: SetTile[]): SeriesGroup[];
  export function filterTiles(tiles: SetTile[], q: string): SetTile[];
  export async function loadSetsIndex(db: SupabaseClient, lang: Lang): Promise<{ groups: SeriesGroup[]; counts: Record<Lang, number> }>;
  export interface SetCard { id: string; number_printed: string; number_num: number | null; number_denom: number | null; number_suffix: string | null; name_en: string | null; name_ja: string | null; rarity: string | null; image_url: string | null; pcg10_median_usd: number | null; pcg10_n_sales: number | null; est10_usd: number | null; est10_as_of: string | null; sale_count: number }
  export type TilePrice = { kind: "pcg"; usd: number; nSales: number } | { kind: "estimate"; usd: number } | { kind: "none" };
  export function tilePrice(c: SetCard, now: Date): TilePrice;
  export function sortCards(cards: SetCard[], by: "number" | "price", now: Date): SetCard[];
  export async function loadSetPage(db: SupabaseClient, id: string): Promise<{ set: SetTile & { language: Lang }; cards: SetCard[] } | null>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/sets-data.test.ts
import { describe, it, expect } from "vitest";
import { asLang, groupBySeries, filterTiles, tilePrice, sortCards, type SetTile, type SetCard } from "../lib/sets-data";

const tile = (o: Partial<SetTile>): SetTile => ({ id: "x", code: null, nameEn: null, nameJa: null, displayName: "x", releaseDate: null, cardCount: 0, officialCount: null, hasCards: true, logoUrl: null, series: null, saleCount: 0, aliases: [], ...o });
const card = (o: Partial<SetCard>): SetCard => ({ id: "c", number_printed: "001/100", number_num: 1, number_denom: 100, number_suffix: null, name_en: null, name_ja: null, rarity: null, image_url: null, pcg10_median_usd: null, pcg10_n_sales: null, est10_usd: null, est10_as_of: null, sale_count: 0, ...o });
const now = new Date("2026-10-21T00:00:00Z");

describe("sets-data", () => {
  it("defaults the language to English", () => { expect(asLang("ja")).toBe("ja"); expect(asLang("zh")).toBe("en"); expect(asLang(undefined)).toBe("en"); });
  it("groups by series, newest group first, Other last", () => {
    const g = groupBySeries([
      tile({ id: "a", series: "Sword & Shield", releaseDate: "2022-01-01" }),
      tile({ id: "b", series: "Scarlet & Violet", releaseDate: "2024-01-01" }),
      tile({ id: "c", series: null, releaseDate: "2026-01-01" }),
      tile({ id: "d", series: "Scarlet & Violet", releaseDate: "2025-01-01" }),
    ]);
    expect(g.map((x) => x.series)).toEqual(["Scarlet & Violet", "Sword & Shield", "Other"]);
    expect(g[0]!.sets.map((s) => s.id)).toEqual(["d", "b"]);
  });
  it("filters by English name, Japanese name, code or alias", () => {
    const t = [tile({ id: "1", nameEn: "Black Bolt", nameJa: "ブラックボルト", code: "SV11B" }), tile({ id: "2", nameEn: "White Flare", code: "SV11W", aliases: ["WHT"] })];
    expect(filterTiles(t, "bolt").map((x) => x.id)).toEqual(["1"]);
    expect(filterTiles(t, "ボルト").map((x) => x.id)).toEqual(["1"]);
    expect(filterTiles(t, "sv11w").map((x) => x.id)).toEqual(["2"]);
    expect(filterTiles(t, "wht").map((x) => x.id)).toEqual(["2"]);
    expect(filterTiles(t, " ")).toHaveLength(2);
  });
  it("prices tiles: PCG 10, then a fresh estimate, then none", () => {
    expect(tilePrice(card({ pcg10_median_usd: 120, pcg10_n_sales: 3, est10_usd: 90, est10_as_of: "2026-10-20T00:00:00Z" }), now)).toEqual({ kind: "pcg", usd: 120, nSales: 3 });
    expect(tilePrice(card({ est10_usd: 90, est10_as_of: "2026-10-20T00:00:00Z" }), now)).toEqual({ kind: "estimate", usd: 90 });
    expect(tilePrice(card({ est10_usd: 90, est10_as_of: "2026-09-01T00:00:00Z" }), now)).toEqual({ kind: "none" });
    expect(tilePrice(card({}), now)).toEqual({ kind: "none" });
  });
  it("sorts by number, or by price with no-comps last", () => {
    const cs = [card({ id: "a", number_num: 3 }), card({ id: "b", number_num: 1, est10_usd: 50, est10_as_of: "2026-10-20T00:00:00Z" }), card({ id: "c", number_num: 2, pcg10_median_usd: 80, pcg10_n_sales: 1 })];
    expect(sortCards(cs, "number", now).map((c) => c.id)).toEqual(["b", "c", "a"]);
    expect(sortCards(cs, "price", now).map((c) => c.id)).toEqual(["c", "b", "a"]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @pcg/web exec vitest run test/sets-data.test.ts`
Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/sets-data.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { ESTIMATE_MAX_AGE_DAYS } from "./grades";

export type Lang = "en" | "ja";
export const asLang = (v: string | undefined): Lang => (v === "ja" ? "ja" : "en");

export interface SetTile { id: string; code: string | null; nameEn: string | null; nameJa: string | null; displayName: string; releaseDate: string | null; cardCount: number | null; officialCount: number | null; hasCards: boolean; logoUrl: string | null; series: string | null; saleCount: number; aliases: string[] }
export interface SeriesGroup { series: string; sets: SetTile[] }
export interface SetCard { id: string; number_printed: string; number_num: number | null; number_denom: number | null; number_suffix: string | null; name_en: string | null; name_ja: string | null; rarity: string | null; image_url: string | null; pcg10_median_usd: number | null; pcg10_n_sales: number | null; est10_usd: number | null; est10_as_of: string | null; sale_count: number }
export type TilePrice = { kind: "pcg"; usd: number; nSales: number } | { kind: "estimate"; usd: number } | { kind: "none" };

interface SetDbRow { id: string; printed_code: string | null; name_en: string | null; name_ja: string | null; release_date: string | null; card_count: number | null; logo_url: string | null; series: string | null; aliases: string[] | null; language: Lang; products: { count: number }[] }
const SET_COLS = "id,printed_code,name_en,name_ja,release_date,card_count,logo_url,series,aliases,language,products(count)";

const byDateDesc = (a: string | null, b: string | null) => (b ?? "").localeCompare(a ?? "");

function toTile(r: SetDbRow, sales: Map<string, number>): SetTile {
  const count = r.products?.[0]?.count ?? 0;
  return { id: r.id, code: r.printed_code, nameEn: r.name_en, nameJa: r.name_ja, displayName: r.name_en ?? r.name_ja ?? r.id, releaseDate: r.release_date,
    cardCount: count, officialCount: r.card_count, hasCards: count > 0, logoUrl: r.logo_url, series: r.series, saleCount: sales.get(r.id) ?? 0, aliases: r.aliases ?? [] };
}

export function groupBySeries(tiles: SetTile[]): SeriesGroup[] {
  const map = new Map<string, SetTile[]>();
  for (const t of tiles) map.set(t.series ?? "Other", [...(map.get(t.series ?? "Other") ?? []), t]);
  const groups = [...map].map(([series, sets]) => ({ series, sets: [...sets].sort((a, b) => byDateDesc(a.releaseDate, b.releaseDate)) }));
  return groups.sort((a, b) => (a.series === "Other" ? 1 : b.series === "Other" ? -1 : byDateDesc(a.sets[0]?.releaseDate ?? null, b.sets[0]?.releaseDate ?? null)));
}

export function filterTiles(tiles: SetTile[], q: string): SetTile[] {
  const t = q.trim().toLowerCase();
  if (!t) return tiles;
  return tiles.filter((s) => [s.nameEn, s.nameJa, s.code, s.id, ...s.aliases].some((v) => v?.toLowerCase().includes(t)));
}

export function tilePrice(c: SetCard, now: Date): TilePrice {
  if (c.pcg10_median_usd != null && (c.pcg10_n_sales ?? 0) > 0) return { kind: "pcg", usd: Number(c.pcg10_median_usd), nSales: c.pcg10_n_sales! };
  const fresh = c.est10_as_of != null && now.getTime() - new Date(c.est10_as_of).getTime() <= ESTIMATE_MAX_AGE_DAYS * 86400000;
  if (c.est10_usd != null && fresh) return { kind: "estimate", usd: Number(c.est10_usd) };
  return { kind: "none" };
}

export function sortCards(cards: SetCard[], by: "number" | "price", now: Date): SetCard[] {
  const num = (c: SetCard) => c.number_num ?? Number.MAX_SAFE_INTEGER;
  const byNum = (a: SetCard, b: SetCard) => num(a) - num(b) || a.number_printed.localeCompare(b.number_printed);
  if (by === "number") return [...cards].sort(byNum);
  const usd = (c: SetCard) => { const p = tilePrice(c, now); return p.kind === "none" ? -1 : p.usd; };
  return [...cards].sort((a, b) => usd(b) - usd(a) || byNum(a, b));
}

async function saleCounts(db: SupabaseClient): Promise<Map<string, number>> {
  const { data } = await db.from("set_sale_counts").select("id,sale_count");
  return new Map(((data ?? []) as { id: string; sale_count: number }[]).map((r) => [r.id, r.sale_count]));
}

export async function loadSetsIndex(db: SupabaseClient, lang: Lang) {
  const [sales, rows, en, ja] = await Promise.all([
    saleCounts(db),
    db.from("sets").select(SET_COLS).eq("language", lang).order("release_date", { ascending: false }).order("id").range(0, 999),
    db.from("sets").select("id", { count: "exact", head: true }).eq("language", "en"),
    db.from("sets").select("id", { count: "exact", head: true }).eq("language", "ja"),
  ]);
  if (rows.error) throw new Error(rows.error.message);
  const tiles = ((rows.data ?? []) as unknown as SetDbRow[]).map((r) => toTile(r, sales));
  return { groups: groupBySeries(tiles), counts: { en: en.count ?? 0, ja: ja.count ?? 0 } };
}

export async function loadSetPage(db: SupabaseClient, id: string) {
  const { data: row, error } = await db.from("sets").select(SET_COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const r = row as unknown as SetDbRow;
  const sales = await saleCounts(db);
  const cards: SetCard[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error: e } = await db.from("public_set_cards").select("*").eq("set_id", id).order("number_num", { ascending: true, nullsFirst: false }).order("id").range(from, from + 999);
    if (e) throw new Error(e.message);
    cards.push(...((data ?? []) as SetCard[]));
    if ((data ?? []).length < 1000) break;
  }
  return { set: { ...toTile(r, sales), language: r.language }, cards };
}
```

In `apps/web/next.config.ts`, change `remotePatterns` to:

```ts
    remotePatterns: [
      { hostname: "assets.tcgdex.net" },
      { hostname: "images.pokemontcg.io" },
      { hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co").hostname, pathname: "/storage/v1/object/public/**" },
    ],
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm --filter @pcg/web exec vitest run test/sets-data.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/sets-data.ts apps/web/test/sets-data.test.ts apps/web/next.config.ts
git commit -m "feat(web): sets data layer with series grouping, filters and the PCG/estimate/none tile price"
```

---

### Task 11: Sets index page, header link, and English-first names on existing pages

**Files:**
- Create: `apps/web/app/sets/page.tsx`
- Create: `apps/web/components/SetTileCard.tsx`
- Create: `apps/web/components/SetsBrowser.tsx` (client: filter box plus grouped grid)
- Modify: `apps/web/components/AppHeader.tsx` (public "Sets" link)
- Modify: `apps/web/app/page.tsx` (home set links go to `/sets/[id]`, "All N sets" goes to `/sets`, names are English-first)
- Modify: `apps/web/lib/home-data.ts` (English-first card name)
- Modify: `apps/web/app/card/[id]/page.tsx` (English-first `h1`, Japanese underneath, breadcrumb to `/sets/[id]`)
- Modify: `apps/web/test/home-data.test.ts` (expected name becomes `"Mew ex"`)

**Interfaces:**
- Consumes: `loadSetsIndex`, `filterTiles`, `asLang`, `SetTile`, `SeriesGroup` (Task 10).
- Produces:
  - `SetTileCard({ tile })`;
  - `SetLogoPanel({ tile, size })`, used again by Task 12's header;
  - `AppHeader` gains an optional `current?: "sets"` prop for the public variant.

**English-first rule:** this is a spec-adjacent ruling. The user said readers can't read Japanese, so every place that picked `name_ja` first for Japanese cards now shows `name_en ?? name_ja`, with the other language as the secondary line.

- [ ] **Step 1: Update the home-data test first**

In `apps/web/test/home-data.test.ts`, change the expected `name: "ミュウex"` to `name: "Mew ex"`.
Run: `pnpm --filter @pcg/web exec vitest run test/home-data.test.ts`
Expected: FAIL (the code still picks Japanese first).

- [ ] **Step 2: Make names English-first**

- In `apps/web/lib/home-data.ts`, change the `name:` expression in `toRecentSale` to `(r.name_en ?? r.name_ja) ?? r.product_id`.
- In `apps/web/app/card/[id]/page.tsx`:
  - replace lines 23–24 with:
    ```tsx
    const name = (product.name_en ?? product.name_ja) ?? product.id;
    const alt = product.name_en ? product.name_ja : null; const setName = set.name_en ?? set.name_ja ?? set.id;
    ```
  - change the breadcrumb `href` to `` `/sets/${encodeURIComponent(set.id)}` ``.
- In `apps/web/app/page.tsx`:
  - change `{s.name_ja ?? s.name_en}` to `{s.name_en ?? s.name_ja}`;
  - change the set link `href` to `` `/sets/${encodeURIComponent(s.id)}` ``;
  - change the "All N sets" `href` to `/sets`.

Run: `pnpm --filter @pcg/web exec vitest run test/home-data.test.ts`
Expected: PASS.

- [ ] **Step 3: Header link**

In `apps/web/components/AppHeader.tsx`, add `current?: "sets"` to the props. Render this public nav after the search field when `variant === "public"`:

```tsx
        {variant === "public" && (
          <nav className="ml-auto flex items-center gap-1 text-sm" aria-label="Main">
            <NavLink href="/sets" current={current === "sets"}>Sets</NavLink>
          </nav>)}
```

Update the signature to `export function AppHeader({ variant, search, admin, current }: { variant: "public" | "admin"; search?: { value?: string; show?: boolean }; admin?: Admin; current?: "sets" })`.

- [ ] **Step 4: Tile and logo panel**

```tsx
// apps/web/components/SetTileCard.tsx
import Image from "next/image";
import Link from "next/link";
import type { SetTile } from "@/lib/sets-data";
import { fmtDateLong } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SetLogoPanel({ tile, className }: { tile: SetTile; className?: string }) {
  if (tile.logoUrl) return (
    <div className={cn("relative flex items-center justify-center bg-white p-4", className)}>
      <Image src={tile.logoUrl} alt={`${tile.displayName} logo`} width={220} height={110} className="max-h-full w-auto object-contain" />
    </div>);
  return (
    <div className={cn("flex flex-col items-center justify-center bg-gradient-to-br from-bar to-bar-field text-bar-ink", className)}>
      <span className="text-[28px] font-extrabold tracking-[-0.02em] wdth-104">{tile.code ?? tile.id}</span>
      {tile.series && <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-bar-mute">{tile.series}</span>}
    </div>);
}

export function SetTileCard({ tile }: { tile: SetTile }) {
  const count = tile.hasCards ? `${tile.cardCount} cards` : tile.officialCount ? `${tile.officialCount} cards · card list coming` : "Card list coming";
  return (
    <Link href={`/sets/${encodeURIComponent(tile.id)}`} className="group block overflow-hidden rounded-[14px] border border-line-2 bg-surface no-underline shadow-[0_1px_2px_rgba(0,0,0,.04)] transition-colors hover:border-line focus-visible:outline-2 focus-visible:outline-teal">
      <div className="relative">
        <SetLogoPanel tile={tile} className="h-[120px] border-b border-line-2" />
        {tile.releaseDate && <span className="absolute right-2 top-2 rounded-full bg-ink/75 px-2 py-0.5 text-[11px] font-semibold text-ground">{fmtDateLong(tile.releaseDate)}</span>}
      </div>
      <div className="px-3 pb-3 pt-2.5">
        <div className="text-[15px] font-bold leading-[1.25] text-ink">{tile.displayName}</div>
        {tile.nameEn && tile.nameJa && <div className="mt-0.5 text-[12px] text-mute">{tile.nameJa}</div>}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-mute">
          {tile.code && <span className="font-semibold text-ink-2">{tile.code}</span>}<span>{count}</span>
          {tile.saleCount > 0 && <span className="rounded-full bg-gold-fill px-2 py-px text-[11.5px] font-bold text-gold tnum">{tile.saleCount} PCG sales</span>}
        </div>
      </div>
    </Link>);
}
```

- [ ] **Step 5: Browser component (filter and groups)**

```tsx
// apps/web/components/SetsBrowser.tsx
"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { SeriesGroup } from "@/lib/sets-data";
import { filterTiles } from "@/lib/sets-data";
import { SetTileCard } from "./SetTileCard";

export function SetsBrowser({ groups }: { groups: SeriesGroup[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => groups.map((g) => ({ ...g, sets: filterTiles(g.sets, q) })).filter((g) => g.sets.length > 0), [groups, q]);
  return (<>
    <label className="mb-6 flex w-full max-w-[360px] items-center gap-2 rounded-xl border border-line bg-surface px-3 min-h-11 focus-within:border-teal focus-within:ring-[3px] focus-within:ring-teal-soft">
      <Search size={16} className="text-mute" aria-hidden /><span className="sr-only">Filter sets</span>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by set name or code" className="w-full bg-transparent text-[15px] outline-none placeholder:text-mute" />
    </label>
    {shown.length === 0 && <p className="text-[14px] text-mute">No sets match “{q}”.</p>}
    {shown.map((g) => (
      <section key={g.series} className="mb-9">
        <h2 className="m-0 mb-3 flex items-baseline justify-between text-[19px] font-extrabold tracking-[-0.01em]">{g.series}<span className="text-[13px] font-medium text-mute">{g.sets.length} sets</span></h2>
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{g.sets.map((t) => <li key={t.id}><SetTileCard tile={t} /></li>)}</ul>
      </section>))}
  </>);
}
```

- [ ] **Step 6: The page**

```tsx
// apps/web/app/sets/page.tsx
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SetsBrowser } from "@/components/SetsBrowser";
import { anonClient } from "@/lib/supabase-server";
import { asLang, loadSetsIndex, type Lang } from "@/lib/sets-data";
import { cn } from "@/lib/utils";
export const revalidate = 900;
export const metadata = { title: "Pokémon sets · PCG Markets" };

const TABS: { value: Lang; label: string }[] = [{ value: "en", label: "English" }, { value: "ja", label: "Japanese" }];

export default async function SetsPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = asLang((await searchParams).lang);
  const { groups, counts } = await loadSetsIndex(anonClient(), lang);
  return (<>
    <AppHeader variant="public" current="sets" />
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10">
      <h1 className="m-0 mb-4 text-[clamp(30px,5vw,44px)] font-extrabold leading-none tracking-[-0.03em] wdth-104">Pokémon sets</h1>
      <nav aria-label="Language" className="mb-5 inline-flex gap-0.5 rounded-[10px] bg-sunk p-[3px]">
        {TABS.map((t) => (
          <Link key={t.value} href={`/sets?lang=${t.value}`} aria-current={lang === t.value ? "page" : undefined}
            className={cn("rounded-[7px] px-3.5 py-1.5 text-[14px] font-semibold no-underline min-h-9 inline-flex items-center", lang === t.value ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "text-mute")}>
            {t.label} <span className="ml-1.5 text-[12px] font-medium text-mute tnum">{counts[t.value]}</span>
          </Link>))}
      </nav>
      <SetsBrowser key={lang} groups={groups} />
    </main>
    <SiteFooter />
  </>);
}
```

- [ ] **Step 7: Run tests and typecheck, and check that the page renders**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.
Run: `cd apps/web && (pnpm dev --port 3006 > /tmp/sets-dev.log 2>&1 &) ; sleep 15; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3006/sets?lang=ja"`
Expected: `200`. Stop the server afterwards with `kill $(lsof -tiTCP:3006 -sTCP:LISTEN)`.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): /sets index with English and Japanese tabs, a header link, and English-first names"
```

---

### Task 12: Set page `/sets/[id]` with card grid, search and sort

**Files:**
- Create: `apps/web/app/sets/[id]/page.tsx`
- Create: `apps/web/components/SetCardGrid.tsx` (client)
- Create: `apps/web/components/CardTile.tsx`
- Create: `apps/web/test/card-tile.test.ts`

**Interfaces:**
- Consumes:
  - from Task 10: `loadSetPage`, `tilePrice`, `sortCards`, `SetCard`;
  - from Task 2: `parseCardQuery` and `matchesCardQuery` (`@pcg/domain`);
  - from Task 11: `SetLogoPanel`;
  - `fmtUsd` from `@/lib/format`.
- Produces: `priceLine(p: TilePrice): string` (exported from `CardTile.tsx` for tests).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/card-tile.test.ts
import { describe, it, expect } from "vitest";
import { priceLine } from "../components/CardTile";

describe("priceLine", () => {
  it("shows PCG 10 with the sale count", () => { expect(priceLine({ kind: "pcg", usd: 1480, nSales: 6 })).toBe("$1,480 · PCG 10 · 6 sales"); });
  it("uses the singular for one sale", () => { expect(priceLine({ kind: "pcg", usd: 64, nSales: 1 })).toBe("$64 · PCG 10 · 1 sale"); });
  it("marks estimates", () => { expect(priceLine({ kind: "estimate", usd: 120 })).toBe("~$120 est."); });
  it("says when there are no comps", () => { expect(priceLine({ kind: "none" })).toBe("No comps yet"); });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @pcg/web exec vitest run test/card-tile.test.ts`
Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Card tile**

```tsx
// apps/web/components/CardTile.tsx
import Image from "next/image";
import Link from "next/link";
import type { SetCard, TilePrice } from "@/lib/sets-data";
import { fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

export function priceLine(p: TilePrice): string {
  if (p.kind === "pcg") return `${fmtUsd(p.usd)} · PCG 10 · ${p.nSales} sale${p.nSales === 1 ? "" : "s"}`;
  if (p.kind === "estimate") return `~${fmtUsd(p.usd)} est.`;
  return "No comps yet";
}

export function CardTile({ card, price, setCode }: { card: SetCard; price: TilePrice; setCode: string | null }) {
  const name = card.name_en ?? card.name_ja ?? card.number_printed;
  return (
    <Link href={`/card/${encodeURIComponent(card.id)}`} className="flex h-full flex-col rounded-[14px] border border-line-2 bg-surface p-2 no-underline transition-colors hover:border-line focus-visible:outline-2 focus-visible:outline-teal">
      {card.image_url
        ? <Image src={card.image_url} alt={`${name} card`} width={245} height={342} sizes="(min-width:1024px) 200px, 45vw" className="block aspect-[63/88] w-full rounded-lg object-cover" />
        : (<div className="flex aspect-[63/88] w-full flex-col justify-between rounded-lg bg-gradient-to-br from-bar-field to-bar p-3 text-bar-ink" aria-label={`${name}, no image`}>
            <span className="text-[22px] font-extrabold leading-none tracking-[-0.02em] wdth-104 tnum">{card.number_printed}</span>
            <span><span className="block text-[14px] font-bold leading-tight">{name}</span>{card.name_en && card.name_ja && <span className="mt-1 block text-[11.5px] text-bar-mute">{card.name_ja}</span>}</span>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-bar-mute">{setCode}</span>
          </div>)}
      <div className="mt-2 px-0.5 text-[14px] font-bold leading-tight text-ink">{name}</div>
      <div className="mt-0.5 px-0.5 text-[12px] text-mute">{[card.number_printed, card.rarity, card.name_en ? card.name_ja : null].filter(Boolean).join(" · ")}</div>
      <div className={cn("mt-auto px-0.5 pt-2 text-[13px] tnum", price.kind === "pcg" ? "font-extrabold text-ink" : "font-medium text-mute")}>{priceLine(price)}</div>
    </Link>);
}
```

- [ ] **Step 4: Grid with search, filter and sort**

```tsx
// apps/web/components/SetCardGrid.tsx
"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { matchesCardQuery, parseCardQuery } from "@pcg/domain";
import { sortCards, tilePrice, type SetCard } from "@/lib/sets-data";
import { CardTile } from "./CardTile";
import { cn } from "@/lib/utils";

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (<div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-[10px] bg-sunk p-[3px]">
    {options.map((o) => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className={cn("min-h-9 rounded-[7px] px-3 text-[13.5px] font-semibold", value === o.value ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "text-mute")}>{o.label}</button>)}
  </div>);
}

export function SetCardGrid({ cards, setCode, now }: { cards: SetCard[]; setCode: string | null; now: string }) {
  const [q, setQ] = useState(""); const [only, setOnly] = useState<"all" | "sales">("all"); const [by, setBy] = useState<"number" | "price">("number");
  const nowD = useMemo(() => new Date(now), [now]);
  const withSales = useMemo(() => cards.filter((c) => c.sale_count > 0).length, [cards]);
  const shown = useMemo(() => {
    const query = parseCardQuery(q);
    return sortCards(cards.filter((c) => (only === "all" || c.sale_count > 0) && matchesCardQuery(c, query)), by, nowD);
  }, [cards, q, only, by, nowD]);
  return (<>
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <label className="flex min-h-11 w-full max-w-[420px] flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-teal focus-within:ring-[3px] focus-within:ring-teal-soft">
        <Search size={16} className="text-mute" aria-hidden /><span className="sr-only">Find a card</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Card # (069/187, 69) or name" inputMode="search" className="w-full bg-transparent text-[15px] outline-none placeholder:text-mute" />
      </label>
      <Toggle label="Show" value={only} onChange={setOnly} options={[{ value: "all", label: `All ${cards.length}` }, { value: "sales", label: `With sales ${withSales}` }]} />
      <Toggle label="Sort" value={by} onChange={setBy} options={[{ value: "number", label: "Number" }, { value: "price", label: "Price" }]} />
    </div>
    {shown.length === 0
      ? <p className="text-[14px] text-mute">No cards match “{q}”. <button type="button" onClick={() => { setQ(""); setOnly("all"); }} className="font-semibold text-teal">Clear</button></p>
      : <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{shown.map((c) => <li key={c.id}><CardTile card={c} price={tilePrice(c, nowD)} setCode={setCode} /></li>)}</ul>}
  </>);
}
```

- [ ] **Step 5: The page**

```tsx
// apps/web/app/sets/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Chip } from "@/components/Chip";
import { SetLogoPanel } from "@/components/SetTileCard";
import { SetCardGrid } from "@/components/SetCardGrid";
import { anonClient } from "@/lib/supabase-server";
import { loadSetPage } from "@/lib/sets-data";
import { fmtDateLong } from "@/lib/format";
export const revalidate = 900;

export default async function SetPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const data = await loadSetPage(anonClient(), id);
  if (!data) notFound();
  const { set, cards } = data; const ja = set.language === "ja";
  return (<>
    <AppHeader variant="public" current="sets" />
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13.5px] font-medium text-mute">
        <Link href="/sets" className="font-semibold text-teal no-underline">Sets</Link><span>/</span>
        <Link href={`/sets?lang=${set.language}`} className="font-semibold text-teal no-underline">{ja ? "Japanese" : "English"}</Link>
        {set.series && <><span>/</span><span>{set.series}</span></>}
      </div>
      <header className="mb-6 grid grid-cols-1 items-center gap-4 overflow-hidden rounded-[18px] border border-line-2 bg-surface md:grid-cols-[240px_minmax(0,1fr)]">
        <SetLogoPanel tile={set} className="h-[120px] md:h-full md:min-h-[140px]" />
        <div className="px-5 pb-5 md:py-5 md:pl-0">
          <h1 className="m-0 text-[clamp(28px,4.5vw,40px)] font-extrabold leading-[1.05] tracking-[-0.03em] wdth-104 text-balance">{set.displayName}</h1>
          {set.nameEn && set.nameJa && <p className="m-0 mt-1 text-[15px] font-semibold text-mute">{set.nameJa}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {set.code && <Chip variant="number">{set.code}</Chip>}
            <Chip variant="lang">{ja ? "Japanese" : "English"}</Chip>
            {set.releaseDate && <Chip>Released {fmtDateLong(set.releaseDate)}</Chip>}
            <Chip>{set.hasCards ? `${set.cardCount} cards` : "Card list coming"}</Chip>
            {set.saleCount > 0 && <Chip className="bg-gold-fill text-gold">{set.saleCount} PCG sales</Chip>}
          </div>
        </div>
      </header>
      {cards.length === 0
        ? <p className="rounded-[14px] border border-dashed border-line bg-surface px-5 py-8 text-center text-[15px] text-mute">We don&apos;t have the card list for this set yet.</p>
        : <SetCardGrid cards={cards} setCode={set.code} now={new Date().toISOString()} />}
    </main>
    <SiteFooter />
  </>);
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): /sets/[id] card grid with number and name search, sales filter and price sort"
```

---

### Task 13: Apply, run, smoke-test in a browser, and document

**Files:**
- Modify: `apps/web/e2e/shots.spec.ts` (add the sets pages)
- Modify: `docs/superpowers/2026-09-22-data-pipeline-and-ebay-accuracy.md` (runbook section)
- Modify: `packages/connectors/src/tcgdex/ja-set-names.ts`, only if smoke-testing shows missing names

- [ ] **Step 1: Apply migration 0006 to the linked DB**

Run: `npx supabase db query --linked -f packages/db/migrations/0006_sets_browse.sql`
Then check:
```bash
npx supabase db query --linked "select column_name from information_schema.columns where table_name='sets' and column_name in ('logo_url','series','source','limitless_code'); select id, public from storage.buckets where id in ('set-logos','card-images');"
```
Expected: 4 columns, and both buckets with `public = true`.

- [ ] **Step 2: Check what anon can and can't do**

Run a scratch script (don't commit it) that uses the anon key. It must confirm:
- `select * from public_set_cards limit 1` succeeds, and its columns don't include `pct`, `era` or `import_id`;
- an `insert` into `public_set_cards` fails;
- `storage.from('card-images').upload(...)` with the anon key fails.

- [ ] **Step 3: Run the imports in order**

```bash
pnpm ingest catalog:tcgdex
pnpm ingest catalog:limitless
pnpm ingest catalog:tcgdex      # second run must not undo Limitless fields
pnpm ingest images:ja
pnpm ingest images:en
```
Expected: each one ends with `ok:`.

- [ ] **Step 4: Check the results**

Then check:
```sql
select language, count(*) sets, count(*) filter (where name_en is null) no_en_name, count(*) filter (where logo_url is null) no_logo from sets group by 1;
select language, count(*) cards, count(*) filter (where image_url is null) no_image, count(*) filter (where name_en is null) no_en_name from products group by 1;
select coalesce(image_source,'none'), count(*) from products group by 1;
```
Expected:
- Japanese cards without an image drop from 8,899 to about 2,600 or fewer.
- English cards without an image drop from 1,590 by more than half.
- Japanese sets with no English name are only the ones missing from `ja-set-names.ts`.

Record the numbers in the commit message. Check storage use in the Supabase dashboard (expect under 0.6 GB) and record it too.

- [ ] **Step 5: Browser smoke test**

- Add `["sets-en", "/sets"]`, `["sets-ja", "/sets?lang=ja"]`, `["set-sv11b", "/sets/SV11B"]` and `["set-pmcg1", "/sets/PMCG1"]` to `pages` in `apps/web/e2e/shots.spec.ts`.
- Run `pnpm --filter @pcg/web shots`.
- Open the PNGs and confirm:
  - the logos and code panels render;
  - the Japanese tab shows English names;
  - SV11B shows card art with English names;
  - PMCG1 shows slab tiles with English names where known;
  - typing `3` and `003/086` in the search narrows the grid;
  - dark mode and phone layouts have no horizontal scroll;
  - no console errors appear.

- [ ] **Step 6: Write the runbook**

Append a section titled "Sets catalogue (Limitless + TCGdex + pokemontcg.io)" to `docs/superpowers/2026-09-22-data-pipeline-and-ebay-accuracy.md`. It should cover:
- the run order from Step 3;
- the kill switch `CONNECTOR_LIMITLESS=off`;
- the upgrade command `pnpm ingest images:ja --size lg`, to run once the Supabase subscription starts;
- that Limitless gave permission on 2026-10-21 and asked for polite access, at most 1 request per second;
- the known gaps, from spec §7.

- [ ] **Step 7: Full suite and commit**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

```bash
git add apps/web/e2e/shots.spec.ts docs/superpowers/2026-09-22-data-pipeline-and-ebay-accuracy.md packages/connectors/src/tcgdex/ja-set-names.ts
git commit -m "docs: sets catalogue runbook; e2e shots for the sets pages"
```
