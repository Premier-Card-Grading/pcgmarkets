# PSA-based price estimates — design spec

Date: 2026-10-20
Status: approved design, awaiting spec review
Branch: `feat/psa-estimates`
Research: `docs/research/2026-10-psa-price-sources.md`

## 1. Goal

Many cards have grades with no PCG sales at all, so the card page shows nothing for them. For those grades, show a clearly labelled **estimated PCG price** derived from the equivalent PSA-grade market price and how popular the card is.

Rules, as stated by the user:

- An estimate is **60% to 90% of the equivalent PSA price**, scaled by popularity.
- An estimate **never exceeds the PSA price**.
- **Vintage cards** sell rarely but are still popular, so popularity must not punish them for low absolute volume.
- **Real PCG prices always win.** Estimates only fill grades that have never had a PCG sale.

## 2. Decisions (made with the user, 2026-10-14 to 2026-10-20)

| Concern | Decision | Why |
|---|---|---|
| PSA price source | **PriceCharting** (Legendary plan, $49/mo), via its daily **CSV download** | One file covers every card. The user confirmed it is fine to use PriceCharting for every grade. |
| PCG sold comps | **SoldComps stays PCG-only**, unchanged | SoldComps is not used for PSA data. |
| Grades below 10 | Use PriceCharting's grade-N price even though it is **blended across graders** (only its "PSA 10" field is PSA-specific) | The user accepted this. It is simpler, needs no extra quota, and errs toward lower estimates. |
| Popularity measure | PriceCharting `sales-volume` ("yearly units sold"), **ranked as a percentile within the card's language and era** | PriceCharting has no 2-month comp count. Ranking within an era stops vintage cards being compared with modern chase cards. |
| Where estimates appear | **Public card page, clearly labelled**, nowhere else | See §7. |
| Licence | The user's position is that this is internal use: raw PSA prices are never exposed, only the derived estimate | Open risk, see §11. |
| Scheduling | **Manual only** (`pnpm ingest …`). Nothing is added to GitHub Actions until subscriptions are in place. | Project constraint. |
| Rejected sources | PokemonPriceTracker (Pokémon-only, commercial use needs $99/mo), Collectr private API (terms forbid it, CloudFront-blocked), SoldComps PSA comps (user chose PriceCharting) | Details in the research note. |

## 3. Architecture

This follows the existing ingest pattern: a connector writes raw data, then derived jobs compute public tables.

```
pnpm ingest pricecharting:csv   →  pc_imports, pc_products            (private)
                                       │ pc_set_map + card number
                                       ▼
                                   pc_product_links → products         (unmatched/ambiguous → admin review)
pnpm ingest prices              →  price_points                        (unchanged)
pnpm ingest estimates           →  price_estimates                     (public, read by the card page)
```

- `estimates` runs after `prices` because it needs to know which grades already have a real PCG price.
- Units:
  - `packages/connectors/src/pricecharting/`: download and parse the CSV.
  - `packages/domain/src/estimate.ts`: pure estimation logic.
  - `packages/domain/src/pc-link.ts`: pure card-number linking.
  - `packages/db/src/repo/pricecharting.ts` and `repo/estimates.ts`: persistence.
  - `apps/ingest/src/jobs/pricecharting-csv.ts` and `jobs/estimates.ts`: the jobs.

## 4. Data model (migration `0005_psa_estimates.sql`)

All `pc_*` tables have RLS enabled and **no anon or authenticated read policy**. Only the service role reads them. Raw PSA prices must never be readable through the Supabase anon API.

```sql
-- One row per CSV download.
create table pc_imports (
  id           uuid primary key default gen_random_uuid(),
  fetched_at   timestamptz not null default now(),
  row_count    int not null,
  status       text not null check (status in ('ok','suspect')),
  notes        text
);

-- Latest PriceCharting row per product (replaced on each ok import).
create table pc_products (
  pc_id          text primary key,           -- PriceCharting "id"
  console_name   text not null,              -- e.g. "Pokemon Scarlet & Violet 151"
  product_name   text not null,              -- e.g. "Blastoise ex #200"
  card_number    text,                       -- parsed from product_name ("200"), null if absent
  sales_volume   int,                        -- yearly units sold
  prices_usd     jsonb not null,             -- {"10": 123.45, "9.5": ..., "9": ..., "8": ..., ...}
  import_id      uuid not null references pc_imports(id)
);
create index pc_products_console_idx on pc_products (console_name);

-- The user's "list of sets": our set → PriceCharting console-name.
create table pc_set_map (
  set_id         text primary key references sets(id),
  console_name   text not null,
  era_override   text check (era_override in ('vintage','mid','modern'))  -- required when sets.release_date is null
);

-- PriceCharting product ↔ our product.
create table pc_product_links (
  pc_id          text primary key references pc_products(pc_id) on delete cascade,
  state          text not null check (state in ('linked','needs_review','rejected')),
  product_id     text references products(id),
  review_reason  text,                       -- 'no_card_number' | 'variant' | 'no_match' | 'ambiguous'
  is_override    boolean not null default false,
  updated_at     timestamptz not null default now()
);

-- Public. Holds the estimate only, never the PSA price.
create table price_estimates (
  product_id     text not null references products(id),
  grade_value    numeric not null,
  estimate_usd   numeric not null,
  pct            numeric not null check (pct >= 0.60 and pct <= 0.90),
  era            text not null check (era in ('vintage','mid','modern')),
  import_id      uuid not null references pc_imports(id),
  source_as_of   timestamptz not null,       -- pc_imports.fetched_at
  computed_at    timestamptz not null default now(),
  primary key (product_id, grade_value)
);
alter table pc_imports enable row level security;
alter table pc_products enable row level security;
alter table pc_set_map enable row level security;
alter table pc_product_links enable row level security;
alter table price_estimates enable row level security;   -- no public policy on the table itself

-- Public read goes through a view that omits pct and import_id.
create view public_price_estimates as
  select product_id, grade_value, estimate_usd, era, source_as_of from price_estimates;
grant select on public_price_estimates to anon, authenticated;
```

- The `pct` column check also enforces the 60–90% band at the database level.
- `price_estimates` itself has **no** public policy. Only the `public_price_estimates` view is readable by anon, and it leaves out `pct`, so the PSA price can't be recovered as estimate ÷ pct from the public API. The service role and admin can still read `pct` for debugging.

## 5. Ingest: `pricecharting:csv`

- **Download** the Pokémon card CSV using `PRICECHARTING_TOKEN` from `.env`. Gate it behind `CONNECTOR_PRICECHARTING=on`, following the existing connector pattern.
  - PriceCharting regenerates the file every 24 hours, and CSV calls are limited to one every 10 minutes. The job runs at most once a day.
  - The exact download URL and category are confirmed from the Legendary "API/Download" page during implementation and recorded in `pricecharting/schema.ts`. All vendor-specific strings live there, as with SoldComps.
- **Parse.** Prices arrive in USD with two decimals. Map columns to PCG-equivalent grades (`prices_usd` keys):

  | `prices_usd` key | CSV column | PriceCharting meaning (cards) |
  |---|---|---|
  | `10` | `manual-only-price` | Graded 10 by PSA |
  | `9.5` | `box-only-price` | Graded 9.5 by a grading company |
  | `9` | `graded-price` | Graded 9 |
  | `8` | `new-price` | Graded 8 or 8.5 |
  | `7` | `cib-price` | Graded 7 or 7.5 |
  | `6` | `condition-16-price` | Graded 6 |
  | `5` | `condition-15-price` | Graded 5 |
  | `4` | `condition-14-price` | Graded 4 |
  | `3` | `condition-13-price` | Graded 3 |
  | `2` | `condition-10-price` | Graded 2 |
  | `1` | `condition-9-price` | Graded 1 |

  An empty, zero or unparseable price leaves that key out.
- **Card number:** take the trailing `#<number>` token of `product-name`, for example `Blastoise ex #200` gives `200`. If there's no `#` token, `card_number` is null.
- **Sanity gate.** The import is marked `suspect` and **nothing in `pc_products` is replaced** if any of these hold:
  - The file is empty.
  - A required column (`id`, `console-name`, `product-name`, `manual-only-price`, `sales-volume`) is missing.
  - The row count is less than 80% of the last `ok` import.

  The run is recorded with status `suspect` in `ingest_runs`.
- **Link** (after an ok import), for every `pc_products` row whose `console_name` is in `pc_set_map`:
  - `card_number` null → `needs_review` / `no_card_number`.
  - `product_name` contains a bracketed variant tag, for example `Charizard [1st Edition] #4` or `Pikachu [Reverse Holo] #58` → `needs_review` / `variant`. Our catalog has one product per card number, so only the plain listing links automatically. An admin can still link a variant on purpose.
  - If more than one PriceCharting row ends up linked to the same product (possible only through admin overrides), the `estimates` job skips that product and logs it. It never picks one.
  - Normalise the number using the existing `card-number.ts` rules and look it up among `products` in the mapped `set_id`. Exactly one match → `linked`. None → `needs_review` / `no_match`. More than one → `needs_review` / `ambiguous`.
  - Rows with `is_override = true` are never touched.
  - The run log reports, per mapped set, how many cards were linked and how many need review. A set where **under 50%** of its rows link is called out as a probable bad mapping.

## 6. Estimation: `estimates`

The pure function `computeEstimates(input) → Estimate[]` in `packages/domain/src/estimate.ts`.

**Inputs:**
- Linked PriceCharting rows (product, language, set release date or era override, `sales_volume`, `prices_usd`).
- The set of `(product_id, grade_value)` pairs that have **any** PCG price point. This is the `all` window in `price_points`.

**Era** comes from the set's release date (`era_override` wins when set):
- `vintage`: before 2003-07-01 (the WotC era: EN Base to Skyridge, JP equivalents).
- `mid`: 2003-07-01 to 2016-12-31.
- `modern`: 2017-01-01 onward.
- No date and no override → the card is skipped and logged.
- The boundaries are exported constants.

**Popularity percentile:**
- Within each `(language, era)` group of linked cards, compute `p` = the card's percentile rank by `sales_volume`. The lowest card in the group gets 0 and the highest gets 1. Ties share the average rank. A null `sales_volume` counts as 0.
- If a group has **fewer than 20** cards, every card in it gets `p = 0`, the conservative floor.

**Estimate for each PCG grade:**
1. Grades whose `(product_id, grade_value)` already has a PCG price point are skipped.
2. PCG grades map onto `prices_usd` keys: 10 → `10`; 9.5 → `9.5`; 9 → `9`; 8.5 and 8 → `8`; 7.5 and 7 → `7`; 6 to 1 → the same.
   - PCG 10 tiers (Flawless, Pristine, Gem Mint) all use `10`. The estimate is stored at `grade_value = 10` and applies to the 10 cell regardless of tier.
3. If the PSA price for that grade is missing, there's no estimate for that grade.
4. Calculate:
   - `pct = 0.60 + 0.30 × p`
   - `estimate = round2(psa × pct)`
   - Then `estimate = min(estimate, psa)` as a defensive cap; with `pct ≤ 0.90` it is always below the PSA price anyway.

**Job steps:**
1. Load the latest `ok` import. If it's **older than 7 days**, the run is `suspect` and the existing estimates are left in place.
2. Compute the estimates.
3. Replace `price_estimates` in a single transaction, using a SQL function `replace_price_estimates(rows jsonb)` called by RPC. supabase-js has no client-side transactions.
4. Log the count per era, plus the cards skipped (no era, no PSA price).

## 7. Card page

- **Loading:** `loadCard` (`apps/web/lib/card-data.ts`) also selects `grade_value, estimate_usd, source_as_of` from `public_price_estimates` for the product.
- **Which estimates show:**
  - An estimate whose `source_as_of` is **older than 14 days** is ignored.
  - An estimate for a grade that has any real PCG price point is ignored. Real prices always win, even if a stale estimate row exists.
- **The grade selector.** The card page has no grid. It has a grade selector (`GradeSelect`) and one price box (`GuideBox`) for the chosen grade.
  - Estimated grades are added to the selector **after** the real grades. Instead of "N sales" they show **"Est."**.
  - Choosing one shows an estimate box instead of `GuideBox`. It shows the grade badge, **"~$84"** in a muted style and an **"Est."** badge. The sales list and "Over time" chart are not rendered for an estimated grade.
  - The default grade is always a real one when any exists. Only when a card has no real grades in the window does the page default to the highest estimated grade.
  - An estimate ignores the window selector and shows in every window, because it only exists when the grade has never sold.
- **Footnote** under the estimate box: *"Estimated from PSA market prices and card popularity — no PCG sales yet."*
- **Never shown:** no PSA price, percentage, popularity rank or source name.
- **Excluded from:** price charts, sparklines, the sold list, "last sold", home-page movers and strips, search results, and any `n_sales` or confidence display. Those stay real-sales only.

## 8. Admin

- **Review:** a new page, `/admin/review/pricecharting`, linked from a "PriceCharting links (N)" chip on `/admin/review`. It lists `pc_product_links` rows in `needs_review`, showing console name, product name, parsed number and reason.
  - The admin can link a row to a product by ID (`is_override = true`) or reject it.
  - It's a separate page because the existing review item is built around eBay listings (photos, price, sold date).
- **Health:** `/admin/health` shows the last `pricecharting:csv` and `estimates` runs like the other jobs, plus the latest import's age.
- **Set mapping:** `pc_set_map` is maintained by SQL or a seed file (`packages/db/seed/pc-set-map.sql`) in v1. There is no editing UI.

## 9. Error handling summary

| Situation | Behaviour |
|---|---|
| CSV empty, missing columns, or row count drops more than 20% | Import is `suspect`; previous `pc_products` is kept |
| Token missing or connector off | Job fails fast with a clear message, like the other connectors |
| Latest ok import older than 7 days | `estimates` is `suspect`; existing estimates are kept |
| Estimate source older than 14 days | Hidden on the card page |
| Card number missing, bracketed variant, no match, or ambiguous | `needs_review`; no estimate |
| Several PriceCharting rows linked to one product | That product is skipped and logged |
| Set mapping links under 50% of its rows | Called out in the run log as a probable bad mapping |
| PSA price missing or zero for a grade | No estimate for that grade |
| `(language, era)` group under 20 cards | `pct` = 0.60 floor |
| Set with no release date and no era override | Skipped and logged |
| A grade later gets a real PCG sale | The next `estimates` run drops it; the card page already prefers the real price |

## 10. Testing

- **Domain (`estimate.test.ts`):**
  - The percentile mapping: endpoints 0.60 and 0.90, the midpoint, average rank for ties, null volume.
  - The cap.
  - Era boundaries, including the exact boundary dates.
  - The small-group floor.
  - Skipping grades that have PCG prices.
  - The grade mapping, including 8.5 → `8`, 7.5 → `7`, and all 10 tiers → `10`.
  - A missing PSA price.
- **Domain (`pc-link.test.ts`):** number extraction from product names (`#200`, `#TG05`, `#SV-P 001`-style promos, no `#`), and one, zero or several matches.
- **Connector (`pricecharting.test.ts`):**
  - A small recorded CSV sample in `test/fixtures/` (header plus about 10 rows, including a Japanese set).
  - Column mapping, empty prices, and each case in the sanity gate.
- **DB:** a test that the anon role **cannot** select from any `pc_*` table or from `price_estimates`, and **can** select from `public_price_estimates`, which has no `pct` column.
- **Web:**
  - Unit tests in `apps/web/test/` (the web app has no component-test setup): estimate options are built only for grades with no real price; stale estimates are dropped; the default grade prefers a real grade; tier-10 estimates map to one `10` option.
  - The Playwright card-page screenshot is updated.

## 11. Open risks

- **Licence.** PriceCharting's docs say the data is "licensed for internal use only. Sharing our price data with a third party, or making it available within an application or service used by others, requires a commercial license and express written permission."
  - The user's position is that showing only a derived estimate is internal use.
  - The risk is that a derived estimate shown publicly could be read as "making it available".
  - Mitigations in this design: `pc_*` tables are private, and the only public surface is a view without `pct`.
  - Recommended before public launch, not before building: a short email to PriceCharting asking them to confirm in writing.
- **Japanese coverage.** We haven't confirmed which Japanese sets PriceCharting covers or how it names them. The first real CSV import answers this. Unmapped sets simply get no estimates.
- **Blended lower grades.** PriceCharting's 9 and below mix PSA, BGS, CGC and others. The user accepted this, and it tends to make estimates lower, not higher.
- **Subscription end.** PriceCharting requires all API/CSV data to be purged when the subscription ends. Purging means truncating the `pc_*` tables and `price_estimates`. That's documented here; no tooling in v1.

## 12. Out of scope (v1)

- PSA population data.
- PriceCharting as a cross-check on PCG prices.
- An admin UI for editing `pc_set_map`.
- One Piece. The structure supports it as more set mappings once the catalog has One Piece.
- Building our own 2-month volume from daily snapshots.
- Scheduling in GitHub Actions.
- Estimates in search, home or charts.
