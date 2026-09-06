# PCG Markets — Design Spec (POC)

**Date:** 2026-09-06
**Status:** Draft for review
**Research inputs:** `docs/research/` (2026-09-05)

## 1. Purpose

PCG Markets shows what PCG (Premier Card Grading) slabs actually **sold for**, per card, per grade. No existing price tracker covers PCG (PriceCharting, Pokemon Price Tracker, Collectr, Card Ladder, Alt, and all Japanese aggregators stop at PSA/BGS/CGC/SGC/TAG/ACE). Making past sold prices findable is what lets sellers prove value and gives collectors a reason to grade with PCG.

**The product is one screen:** search a card → see a grade × price grid (10 Flawless / 10 Pristine / 10 Gem Mint / 9.5 / 9 …) backed by a list of real, linked sold listings. Everything else in this spec exists to make that screen truthful.

## 2. Scope

### In (POC)
- **Game:** Pokémon, Japanese and English printings.
- **Data:** sold listings from eBay and Japanese auction sites. Active/asking listings only as a side signal, never in the price grid.
- **UI:** English only. Public search + card page. Admin review queue + ingest health.
- **Cost:** free tiers only. Licensed sources (aucfan, paid The Card API, eBay partner access) come after the POC proves demand.
- **Relationship to PCG:** the user is partnered with PCG. The public PCG API is treated as sanctioned. It is used only for optional cert lookup in the POC.

### Out (POC)
- Other games (One Piece, FaB, MTG…) — the adapter shape allows them later.
- Printing variants (reverse holo vs holo) unless the same set + number is genuinely ambiguous.
- PCG population counts, PCG catalog cross-referencing.
- Public accounts, portfolios, alerts, Japanese UI, push notifications.
- Counterfeit detection — PCG is niche enough that fakes are not a concern.
- Label OCR from slab photos (roadmap; see §13).

## 3. Decisions log

| Decision | Choice | Why |
|---|---|---|
| Core metric | Sold prices, median per (card, grade) | That is the whole point; asking prices are noise |
| Sources | eBay + Yahoo Auctions + Yahoo!フリマ, each verified for PCG volume first | Where PCG slabs actually trade (research) |
| Spine | TCGdex Pokémon catalog (JA + EN) | Japanese set IDs equal the codes printed on cards and written in titles; EN sets carry the ptcgo code and TCGplayer ids |
| Matching | Structured metadata on eBay; strict code extraction on JP; never guess | Wrong prices are worse than missing prices |
| Unmatched listings | Admin review queue, never discarded | Keep all data; humans resolve; resolutions become test fixtures |
| Ingestion runtime | Separate Node worker on GitHub Actions cron | Free, no function timeouts, locally debuggable, hostable anywhere later |
| Web | Next.js PWA on Vercel; Postgres on Supabase | User preference; fits free tiers |

## 4. Architecture

```
pcgmarkets/                       pnpm monorepo, TypeScript
├── apps/
│   ├── web/                      Next.js (App Router), PWA → Vercel
│   └── ingest/                   Node CLI `ingest <job>` → run by GitHub Actions cron
├── packages/
│   ├── db/                       SQL migrations, generated types, query helpers (Supabase)
│   ├── domain/                   Pure logic, no I/O: normalisers, parsers, matcher, pricing
│   └── connectors/               One module per source, common interface
│       ├── tcgdex/               catalog (sets, cards, JA+EN)
│       ├── thecardapi/           eBay sold
│       ├── ebay-browse/          eBay active (side signal)
│       ├── yahoo-auctions/       sold (closedsearch, SSR)
│       ├── yahoo-furima/         sold (?sold=1, SSR)
│       ├── pcg/                  cert lookup only
│       └── fx/                   ECB rates (frankfurter.dev)
├── .github/workflows/ingest.yml
└── docs/
```

**Data flow**

```
connectors ─▶ raw_listings (immutable) ─▶ matcher ─▶ listing_matches ─▶ price_points ─▶ apps/web
tcgdex     ─▶ sets, products ───────────────┘ (lookup)        ▲
                                                  admin review ─┘ (overrides)
```

Rules:
1. **Raw is immutable.** Listings are stored exactly as fetched. Matching is a derived layer that can be rebuilt without re-fetching.
2. **Connectors are dumb, the domain is smart.** A connector returns `RawListing[]`. All parsing lives in `packages/domain` with zero network access.
3. **Human decisions win.** An admin resolution is an override that survives every matcher re-run.

## 5. Data model (Postgres / Supabase)

### `sets`
| column | type | notes |
|---|---|---|
| id | text PK | TCGdex set id (`sv1a`, `sv04.5`) |
| printed_code | text | as printed on card / in titles (`SV1a`, `PAF`); null for some EN sets |
| language | text | `ja` / `en` |
| name_en, name_ja | text | |
| release_date | date | |
| card_count | int | official count (denominator) |
| aliases | text[] | alternate names / codes seen in listings (`"151"`, `"トリプレットビート"`, ptcgo code) |

### `products`
One row per distinct printing — the thing a listing is matched to.

| column | type | notes |
|---|---|---|
| id | text PK | TCGdex card id (`sv1a-073`) |
| set_id | text FK | |
| number_printed | text | `073/073`, `201/165`, `001/SV-P` |
| number_num | int | numerator, for comparison (73) |
| number_denom | int | nullable (promos) |
| number_suffix | text | nullable (`SV-P`, `TG01`) |
| name_en, name_ja | text | |
| rarity | text | TCGdex rarity string |
| language | text | `ja` / `en` |
| image_url | text | TCGdex asset |

Index: `(number_num, number_denom)`, `(number_num, number_suffix)`, `(set_id, number_num)`, trigram on `name_en`, `name_ja`.

### `raw_listings`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| source | text | `thecardapi` / `ebay_browse` / `yahoo_auc` / `yahoo_furima` |
| source_item_id | text | unique with `source` |
| url | text | |
| title | text | |
| description | text | nullable |
| price | numeric | native |
| currency | text | ISO 4217 as the source reports it (`USD`, `JPY`, `GBP`, `AUD`…) |
| kind | text | `sold` / `active` / `ended`. `sold` requires evidence of a transaction (The Card API sold record; Yahoo Auctions ended with ≥1 bid; フリマ sold flag). Ended-without-sale is `ended` |
| sold_at | timestamptz | nullable |
| listed_at, ended_at | timestamptz | nullable |
| is_best_offer | bool | true **only** when the sale was via best offer *and* the source reports the listed price rather than the accepted price. If a source supplies the accepted price, store that price and `false` |
| seller_country | text | nullable |
| external_item_id | text | nullable; the marketplace's own id when the source is an aggregator (The Card API → eBay item id). Used to dedupe the same eBay item seen via `ebay_browse` and `thecardapi` |
| image_urls | text[] | source-hosted; never re-hosted |
| metadata | jsonb | structured fields the source provides (eBay aspects + condition descriptors) |
| raw | jsonb | full payload **minus seller identifiers** (username, seller id, feedback, contact) — stripped before insert; only `seller_country` is kept |
| fetched_at | timestamptz | |
| last_seen_at | timestamptz | `active` listings only: last run in which the source still returned the item |

Updates allowed only to `kind`, `ended_at`, `sold_at`, `fetched_at`, `last_seen_at`. Everything else is write-once.

**Cross-source dedupe.** When a `thecardapi` row arrives whose `external_item_id` equals an existing `ebay_browse` row's `source_item_id`, the `ebay_browse` row is set to `kind=sold` with the same `sold_at`, and only the `thecardapi` row participates in matching and pricing. The eBay item never counts twice.

**Ended detection (`ebay_browse`).** Each run stamps `last_seen_at` on every item it returns. An `active` item not seen for **2 consecutive runs** becomes `kind=ended`, `ended_at = last_seen_at`. One missed run is tolerated (search pagination gaps).

### `listing_matches`
Derived; one row per raw listing; rebuilt by the matcher except where `is_override`.

| column | type | notes |
|---|---|---|
| raw_listing_id | uuid PK/FK | |
| state | text | `matched` / `needs_review` / `rejected` |
| product_id | text FK | nullable |
| grade_value | numeric | `10`, `9.5`, `9` … nullable. **Authentication** slabs (no grade; eBay Grade = "Authentic") store `grade_value = null`, `grade_label = 'Authentic'`; they are `matched` and shown in the sold list but never in the grid |
| grade_label | text | Meaningful **only when `grade_value = 10`**: `Flawless` / `Pristine` / `Gem Mint`, or null = "10, tier unknown". For every other grade the label is implied by the number and stored null |
| cert_id | text | nullable, 9 digits |
| match_method | text | `ebay_metadata` / `cert` / `jp_codes` / `admin` |
| review_reason | text | nullable: `no_card_number`, `no_set_code`, `ambiguous_set`, `no_grade`, `no_metadata`, `grader_missing`, `possible_pcg_set_code`, `possible_pcgs`, `lot`, `grader_not_pcg`, `other` |
| extracted | jsonb | what the matcher managed to pull out (shown in admin) |
| is_override | bool | admin decision; matcher must not touch |
| matcher_version | text | |
| resolved_by, resolved_at | text, timestamptz | admin |

### `price_points`
Materialised; fully recomputed after each match run.

| column | type | notes |
|---|---|---|
| product_id | text FK | |
| grade_value | numeric | |
| grade_label | text | NOT NULL. `'any'` = pooled over every sale at this grade regardless of tier; `'Flawless'` / `'Pristine'` / `'Gem Mint'` = that tier only (grade 10 only). Sentinel rather than null so it can sit in the PK |
| window | text | `30d` / `90d` / `180d` / `all` |
| n_sales | int | |
| median_usd, min_usd, max_usd | numeric | |
| last_sold_at | timestamptz | |
| confidence | text | `high` / `med` / `low` |
| computed_at | timestamptz | |

PK `(product_id, grade_value, grade_label, window)`.

### `fx_rates`
`date`, `base`, `quote` (`USD`), `rate`. Daily from frankfurter.dev (ECB) for **every currency observed in `raw_listings`** (JPY first; eBay sales can also arrive in GBP, AUD, EUR, CAD). Lookup uses the latest rate on or before the sale date (ECB publishes weekdays only).

### `connector_state`
`connector` PK, `cursor` (jsonb — last page / watermark / lastSoldDate), `updated_at`. A connector advances its cursor only after every item on the page was persisted, so a crash mid-page re-fetches that page rather than skipping it.

### `ingest_runs`
`id`, `job`, `started_at`, `finished_at`, `status`, `items_seen`, `items_new`, `items_updated`, `errors jsonb`. Drives the admin health page.

### `admin_users`
`email` allowlist checked against Supabase Auth.

## 6. Card-number search

Users search by number first. One endpoint, three shapes:

| Input shape | Behaviour |
|---|---|
| 9 digits (`000343136`) | PCG cert lookup → product + grade → card page. If the API returns no record, fall through to the number path (a 9-digit string can also be a lot number or typo) |
| Number-shaped (`080/090`, `80/90`, `080 / 090`, `080`, `001/SV-P`) | Normalise: strip leading zeros and whitespace; numeric denominator → `(number_num, number_denom)`; alphabetic denominator (`SV-P`, `S-P`) → `(number_num, number_suffix)`. Numerator only → all matches across all sets and both languages, ranked by number of matched PCG sales, then release date desc |
| Anything else | Trigram on `name_en` / `name_ja`, `unaccent` applied |

Results show image, set, printed number, language, and the pooled "PCG 10 · 90d" median (`price_points` where `grade_value = 10, grade_label = 'any', window = '90d'`) so the right printing is obvious. The same number in a Japanese and an English set are two rows, distinguished by set name and a language badge.

## 7. Ingestion

| Job | Source | Cadence | Budget (free tier) | Fetches |
|---|---|---|---|---|
| `catalog:tcgdex` | api.tcgdex.net | weekly + manual | none stated; be polite | All Pokémon sets and cards, `ja` + `en` |
| `ebay:sold` | The Card API | every 6h | 5k records/day, 3-day lookback | Sold, `q=(pcg,"premier card grading")&graded=true` |
| `ebay:active` | eBay Browse API | daily | 5k calls/day | **Not user-visible in the POC** (§9, §10) — collected for later analysis only. `item_summary/search` with `category_ids=183454`, `filter=conditionIds:{2750}`, `q=PCG` (≈11 calls at 200/page for ~2k listings), then **`getItem` per new listing** — `localizedAspects` and `conditionDescriptors` are only on the item response, not the summary. First run ≈2.1k calls; steady state ≈ 11 + new listings/day. Disappearance → `kind=ended` (see §5) |
| `yahoo:auctions` | closedsearch (SSR) | every 6h | ≤1 req/s | Ended auctions via `/closedsearch/closedsearch?p=<keyword>` only — the one path robots.txt allows; no `istatus`, `n`, price or sort params. **closedsearch lists every ended auction, including ones that got no bids** — a row is `kind=sold` only when bids ≥ 1; otherwise `kind=ended`. Keywords `PCG鑑定品`, `PCG鑑定`, `PCG10`, `PCG9.5`; `PCG-P` / `PCGS` hits are kept but routed to review (§8), not filtered at fetch |
| `yahoo:furima` | `?sold=1` (SSR) | every 6h | ≤1 req/s | Sold items, same keywords; item page fetched for sold date. **Known conflict:** フリマ's robots.txt disallows the `sold`/`open`/`sort` params this needs (research). See §11 and §14 — product-owner decision pending |
| `fx:daily` | frankfurter.dev | daily | free | All currencies observed → USD |
| `match` | — | after each ingest | — | Routine run: listings with no `listing_matches` row + `needs_review` rows where `is_override = false`. On a `matcher_version` bump: every row where `is_override = false`, including `rejected` |
| `prices` | — | after `match` | — | Recompute `price_points` |

- GitHub Actions: one workflow, job matrix, staggered start times, secrets for API keys and Supabase service role.
- Every connector is idempotent: `unique(source, source_item_id)`; re-runs never duplicate.
- Each run writes an `ingest_runs` row.
- Per-connector kill switch via env (`CONNECTOR_YAHOO_FURIMA=off`).
- **Zero-result guard.** A scraper that gets HTTP 200 but parses 0 items from a page that previously yielded items marks the run `suspect` (likely markup change) and does not advance `connector_state.cursor`. `suspect` runs are highlighted on `/admin/health`.
- **Partial pages.** Items parsed before an error are persisted; the cursor is not advanced; the next run re-fetches the page.

**Coverage gate.** Before a sold source is scheduled, a one-off spike runs it against ~30 days of history and counts PCG Pokémon sales. Below ~20, it is not scheduled and the reason is recorded in `docs/research/`. Unverified today: The Card API (PCG normalisation + eBay volume), Yahoo!フリマ (volume; research saw the highest PCG density but did not count). Partially verified: Yahoo Auctions closedsearch returned 38 hits for `PCG鑑定品` in 180 days, **mixed with `PCG-P` set-code noise** — the true PCG-slab count is lower and is what the spike measures.

## 8. Matching

Goal: assign `(product, grade_value, grade_label)` to a listing **only when it is unambiguous**; otherwise route to review. Never name-match.

### eBay (`ebay_metadata`)
Structured fields from `metadata` (Browse `localizedAspects` + `conditionDescriptors`; The Card API equivalents where present):
1. `Professional Grader` must equal `Premier Card Grading (PCG)` (ID 2750118). Anything else → `rejected` with `grader_not_pcg`. Missing → `needs_review` (`grader_missing`). eBay's MIP docs define grader/grade descriptors for the Graded condition, but the research could not observe fill rates on live listings — expect blanks and "Other"; the spike measures this (§14).
2. `Grade` → `grade_value`. `Authentic` → `grade_value = null`, `grade_label = 'Authentic'` (§5).
3. `Set` + `Card Number` + `Language` → product. `Set` resolved through `sets.name_en` / `aliases`; `Card Number` run through the §6 normaliser (a numerator-only value such as `201` is acceptable once `Set` resolves); `Language` mapped `Japanese → ja`, `English → en`. Exactly one product → `matched`; zero or many → `needs_review` (`ambiguous_set` / `no_card_number`). Early Japanese sets (roughly pre-2001) carry no printed collector number — domain knowledge, not in the research; how TCGdex ids them is a §14 spike item — so those listings will land in review by design.
4. `Certification Number` if present → cert lookup overrides steps 2–3 (`match_method=cert`).
5. Title scanned for exactly one thing: the 10-tier word (`Flawless` / `Pristine` / `Gem Mint`, plus old names per the rename table) → `grade_label`. eBay's Grade field is numeric only, so this is the only title dependency. Absent → label null. A `10+` token with no tier word is recorded in `extracted.tier_hint` but does **not** set a label (research: sellers sometimes mean Pristine, unconfirmed).
6. Both eBay sources: if `metadata` is empty (The Card API may return title-only rows — §14), the listing goes to `needs_review` (`no_metadata`) rather than through the JP title rules. English titles are never code-extracted.

### Japanese sources (`jp_codes`)
No structured metadata exists on Yahoo Auctions / Yahoo!フリマ. Extraction is limited to three fixed patterns applied to title, then description:
1. **Set code** — case-insensitive match against the closed list `sets.printed_code` (`SV1a`, `s12a`, `M2a` …), matched as a whole token (not inside another word).
2. **Card number** — regex `(?<![\d/])(\d{1,3})\s*/\s*(\d{1,3}|[A-Za-z]{1,4}-P)(?![\d/])` (mixed case because of `DPt-P`). An alphabetic denominator (`SV-P`, `S-P`, `PCG-P`) **is** the set code for that promo era — step 1 is satisfied by it; no separate code is required.
3. **Grade** — `PCG\s*(?:鑑定品?|graded)?\s*(?:gem\s*mint|pristine|flawless|mint|ジェムミント|プリスティン|フローレス)?\s*(10|9\.5|9|8\.5|8|7\.5|7|6|5|4|3|2|1)(?![\d.])`, case-insensitive. Covers `PCG10`, `PCG 9.5`, `PCG鑑定 10`, `PCG鑑定品 Gem Mint 10`, `[PCG10/Flawless]`. Tier label from the tier word if present anywhere in the title (English or katakana, old names via rename table); else null.
4. **Language** — default `ja`. Title/description containing `海外` (research example: "ナンジャモ 海外 プロモ PCG鑑定"), `英語`, `English`, or `EN版` → `en`.

All of set code, number, and grade present and resolving to exactly one product → `matched`. Any missing or ambiguous → `needs_review` with the specific reason. Title contains `PCG-P`, `/PCG-P`, or `PCGS` **and no grade token** → `needs_review` with `possible_pcg_set_code` / `possible_pcgs` (admin confirms reject). A `PCG-P` promo that *also* has a grade token (`084/PCG-P PCG10`) is a legitimate PCG-graded card and matches normally.

### Common
- Lots (`×3`, `x2`, `セット`, `まとめ`, `lot`, `bundle`, `枚セット`) → `needs_review` with `lot`. `セット` alone is ambiguous (also "set" as in expansion) — only when adjacent to a digit or `枚`.
- Grade names are normalised through PCG's rename table (`Gold Pristine`→`Flawless`, `EX-NM`→`Excellent`, etc.).
- `matcher_version` stamped; a version bump re-runs everything not `is_override`.

### Admin review queue (`/admin/review`)
- Lists `needs_review` newest first: title, photos (source-hosted), price, link, `extracted` ("found grade 10, no card number").
- Admin picks product via the same search box as the public site, sets grade + label, or rejects. Writes `is_override=true`, `match_method=admin`.
- Counts by `review_reason` on the dashboard so the largest failure bucket is visible.
- Every resolution is exported (title → product/grade) into the domain test fixtures.

## 9. Pricing

- **Headline = median** of matched `sold` listings for `(product, grade_value, grade_label)` within the window. Even count → mean of the two middle values. Input set: `listing_matches.state = 'matched'`, `raw_listings.kind = 'sold'`, `is_best_offer = false`, `grade_value` not null, `sold_at` within window as of compute time.
- **Pooled vs tiered (grade 10).** For every grade a `grade_label = 'any'` point is computed over **all** sales at that grade, tier known or not. For grade 10 only, additional points are computed per tier (`Flawless`, `Pristine`, `Gem Mint`) over sales whose tier is known. Unlabelled 10s therefore contribute to `'any'` and to no tier. The grid always shows the `'any'` 10 column; it adds a tier column only when that tier has ≥2 sales in the window. Tier columns are sub-slices of `'any'`, never summed with it. No split is ever fabricated.
- **Currency:** stored native; converted at the ECB rate on or before the sale date. Display shows both (`¥18,500 ($118)`).
- **Best-offer eBay sales** (`is_best_offer`) appear in the sold list flagged "≤ $X" and are excluded from medians and counts.
- **`ended` (active→gone) listings** are never in the grid and not shown on the card page in the POC; they exist only for later analysis.
- **Confidence:** `high` = ≥5 sales **and** max/min < 2; `med` = 2–4 sales, **or** ≥5 sales with max/min ≥ 2; `low` = 1 sale. `n_sales = 0` → no row.
- **Windows:** 30d / 90d (default) / 180d / all, measured backwards from `computed_at`.

## 10. Web app

| Route | Content |
|---|---|
| `/` | Search box (§6). Results: image, set, printed number, language, PCG 10 median |
| `/card/[productId]` | Header (names EN+JA, set, number, image) · grade × price grid with `n` and confidence · window toggle · sold list (date, grade, native + USD price, source, outbound link) · price-over-time chart: one series per `grade_value` (tiers of 10 are not split in the chart), points = individual sales in USD |
| `/admin/review` | Review queue (§8) |
| `/admin/health` | `ingest_runs` table with `suspect` runs highlighted, `connector_state` cursors, per-source counts: sold / matched / in queue / rejected |

- Card page is server-rendered from `price_points` + `listing_matches`; cached and revalidated after each `prices` run. This page is the shareable proof ("a PCG 10 of this sold for $190 last week").
- PWA: installable manifest, offline app shell, last-viewed card pages cached. No push, no public accounts.
- Auth: Supabase Auth, admin routes gated by `admin_users` allowlist.
- Footer: not affiliated with eBay / LY Corp; card images © The Pokémon Company / Nintendo / Creatures / GAME FREAK, served from TCGdex's asset CDN (TCGdex publishes no explicit image licence — treated as fan content; images are hot-linked, not copied, and swapped for a self-hosted set if TCGdex objects); prices are observed sales, not offers.

## 11. Error handling, operations, legal posture

- One connector failing never blocks another or the `prices` job. Failures land in `ingest_runs.errors` and show on `/admin/health`.
- Scrapers: real User-Agent with contact email, ≤1 req/s, exponential back-off, 6h pause on 429/403.
- robots.txt, per source (from research):
  - **Yahoo Auctions:** `/closedsearch/closedsearch` is explicitly allowed; `istatus`, `n`, price and sort params are disallowed. We use `?p=<keyword>` and the site's own next-page link only. Whether the pagination param is among the disallowed set is a spike item (§14).
  - **Yahoo!フリマ:** `sold`, `open` and `sort` params are **disallowed** for crawlers, and sold-only results require `?sold=1`. The spec as written violates robots.txt for this one source. Options for the product owner (§14): (a) accept the deviation — it is a contractual/robots matter, not a legal bar, mitigated by ≤1 req/s; (b) fetch the bare search page (active only) and detect sold via disappearance, losing sold dates; (c) drop フリマ from the POC. The connector ships behind its kill switch, off by default, until decided.
- Kill switch per connector (env flag) so a takedown request can be honoured in one commit.
- Listing images are linked, never copied. Only title, description, price, date, URL, and structured metadata are stored. Seller identifiers are stripped before insert (§5) — no personal data is retained (Japan APPI, GDPR for EU eBay sellers).
- Secrets in GitHub Actions and Vercel env; Supabase service role key never reaches the browser.
- Japan: Copyright Act Art. 30-4 covers information analysis; LY Corp terms are contractual risk only, mitigated by low rate and robots compliance. Mercari JP is excluded because of its explicit anti-scraping clause.

## 12. Testing

- `packages/domain` is pure and fully unit-tested: number normaliser, set-code detector, grade parser, JP extraction, eBay metadata mapping, median/confidence. Fixtures are **real titles** captured in research plus every admin-resolved example.
- Connectors are tested against recorded HTML/JSON fixtures; live calls only in the spike scripts.
- Smoke test: seed 20 listings → `match` → `prices` → card page renders the expected grid.

## 13. Phasing

1. **Spike (days, running ~10 days wall-clock).** Scripts, not product code. Yahoo Auctions closedsearch exposes 180 days, so 30 days is pulled directly. The Card API free tier has a **3-day lookback**, so the script runs daily for ~10 days and the 30-day figure is extrapolated. Yahoo!フリマ has no date in the list view, so the script fetches item pages for a sample. Count PCG Pokémon sales per source; sample titles into fixtures; measure eBay descriptor fill rates. Decide which sources are scheduled. Register the eBay developer account early (rejection risk) — only needed if `ebay:active` stays in the POC (§14); EPN is not needed for the POC.
2. **POC (weeks).** Monorepo scaffold → Supabase schema → TCGdex catalog sync → chosen connectors → matcher → pricing → card page + search → admin queue + health → GitHub Actions cron → Vercel deploy.
3. **After POC.** Licences (aucfan corporate API, The Card API paid tier, eBay partner/Marketplace Insights application); PCG label OCR on slab photos to turn Japanese listings into metadata-grade data; active listings surfaced; PCG pop counts on card page; One Piece; Japanese UI.

## 14. Open questions

### Resolved during the spike
- Does The Card API return eBay item specifics / condition descriptors, or title only? Does it normalise PCG as a grader? Does it flag best-offer sales and expose the eBay item id (needed for §5 dedupe)?
- Real PCG Pokémon sold volume per source over 30 days.
- Fill rate of `Professional Grader` / `Grade` / `Card Number` / `Set` on live eBay PCG listings.
- Exact Browse API `aspect_filter` syntax for the grader condition descriptor (fallback: `q=PCG` + post-filter).
- Does Yahoo!フリマ's item page expose the sold date?
- Is Yahoo Auctions' closedsearch pagination param inside the robots.txt disallow list?
- Which TCGdex EN sets lack a `printed_code`, and what alias list is needed for eBay `Set` values.
- How TCGdex represents vintage Japanese cards without printed numbers.

### Need the product owner
- **Yahoo!フリマ robots.txt conflict** (§11): accept deviation, active-only fallback, or drop.
- **JP listings with number but no set code** (research: common). Strict rule sends them to review. A code-only relaxation — number + denominator + language resolving to exactly one product across all sets — would match many of them without any name matching. Allow, or keep strict?
- **`ebay:active` in the POC?** Sold comes from The Card API, so the eBay developer account (rejection risk) is only needed for asking prices, which are not in the grid. Deferring it removes the slowest external dependency from the POC.
