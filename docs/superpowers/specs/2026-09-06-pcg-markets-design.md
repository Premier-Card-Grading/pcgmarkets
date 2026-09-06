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
| Spine | TCGdex Pokémon catalog (JA + EN) | Set IDs equal the codes printed on cards and written in titles |
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

Index: `(number_num, number_denom)`, `(set_id, number_num)`, trigram on `name_en`, `name_ja`.

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
| currency | text | `USD` / `JPY` |
| kind | text | `sold` / `active` / `ended` |
| sold_at | timestamptz | nullable |
| listed_at, ended_at | timestamptz | nullable |
| is_best_offer | bool | eBay: accepted price unknown |
| seller_country | text | nullable |
| image_urls | text[] | source-hosted; never re-hosted |
| metadata | jsonb | structured fields the source provides (eBay aspects + condition descriptors) |
| raw | jsonb | full payload |
| fetched_at | timestamptz | |

Updates allowed only to `kind`, `ended_at`, `sold_at`, `fetched_at`. Everything else is write-once.

### `listing_matches`
Derived; one row per raw listing; rebuilt by the matcher except where `is_override`.

| column | type | notes |
|---|---|---|
| raw_listing_id | uuid PK/FK | |
| state | text | `matched` / `needs_review` / `rejected` |
| product_id | text FK | nullable |
| grade_value | numeric | `10`, `9.5`, `9` … nullable |
| grade_label | text | `Flawless` / `Pristine` / `Gem Mint` / `Mint` / … nullable (null on a 10 = "any 10") |
| cert_id | text | nullable, 9 digits |
| match_method | text | `ebay_metadata` / `cert` / `jp_codes` / `admin` |
| review_reason | text | nullable: `no_card_number`, `ambiguous_set`, `no_grade`, `possible_pcg_set_code`, `possible_pcgs`, `lot`, `grader_not_pcg`, `other` |
| extracted | jsonb | what the matcher managed to pull out (shown in admin) |
| confidence | numeric | 0–1 |
| is_override | bool | admin decision; matcher must not touch |
| matcher_version | text | |
| resolved_by, resolved_at | text, timestamptz | admin |

### `price_points`
Materialised; fully recomputed after each match run.

| column | type | notes |
|---|---|---|
| product_id | text FK | |
| grade_value | numeric | |
| grade_label | text | nullable = pooled |
| window | text | `30d` / `90d` / `180d` / `all` |
| n_sales | int | |
| median_usd, min_usd, max_usd | numeric | |
| last_sold_at | timestamptz | |
| confidence | text | `high` / `med` / `low` |
| computed_at | timestamptz | |

PK `(product_id, grade_value, grade_label, window)`.

### `fx_rates`
`date`, `base` (`JPY`), `quote` (`USD`), `rate`. Daily from frankfurter.dev (ECB).

### `ingest_runs`
`id`, `job`, `started_at`, `finished_at`, `status`, `items_seen`, `items_new`, `items_updated`, `errors jsonb`. Drives the admin health page.

### `admin_users`
`email` allowlist checked against Supabase Auth.

## 6. Card-number search

Users search by number first. One endpoint, three shapes:

| Input shape | Behaviour |
|---|---|
| 9 digits (`000343136`) | PCG cert lookup → product + grade → card page |
| Number-shaped (`080/090`, `80/90`, `080 / 090`, `080`) | Normalise (strip zeros/spaces) → `(number_num, number_denom)` index. Numerator only → all matches, ranked by number of matched PCG sales |
| Anything else | Trigram on `name_en` / `name_ja`, `unaccent` applied |

Results show image, set, printed number, language, and "PCG 10 median" so the right printing is obvious.

## 7. Ingestion

| Job | Source | Cadence | Budget (free tier) | Fetches |
|---|---|---|---|---|
| `catalog:tcgdex` | api.tcgdex.net | weekly + manual | none stated; be polite | All Pokémon sets and cards, `ja` + `en` |
| `ebay:sold` | The Card API | every 6h | 5k records/day, 3-day lookback | Sold, `q=(pcg,"premier card grading")&graded=true` |
| `ebay:active` | eBay Browse API | daily | 5k calls/day | `category_ids=183454`, `conditionIds:{2750}`, grader = PCG. Disappearance → `kind=ended` |
| `yahoo:auctions` | closedsearch (SSR) | every 6h | ≤1 req/s | Ended auctions, keywords `PCG鑑定品`, `PCG鑑定`, `PCG10`, `PCG9.5`; negatives `PCG-P`, `PCGS` |
| `yahoo:furima` | `?sold=1` (SSR) | every 6h | ≤1 req/s | Sold items, same keywords; item page fetched for sold date |
| `fx:daily` | frankfurter.dev | daily | free | JPY→USD |
| `match` | — | after each ingest | — | New + `needs_review` non-override listings |
| `prices` | — | after `match` | — | Recompute `price_points` |

- GitHub Actions: one workflow, job matrix, staggered start times, secrets for API keys and Supabase service role.
- Every connector is idempotent: `unique(source, source_item_id)`; re-runs never duplicate.
- Each run writes an `ingest_runs` row.
- Per-connector kill switch via env (`CONNECTOR_YAHOO_FURIMA=off`).

**Coverage gate.** Before a sold source is scheduled, a one-off spike runs it against ~30 days of history and counts PCG Pokémon sales. Below ~20, it is not scheduled and the reason is recorded in `docs/research/`. Unverified today: The Card API (PCG normalisation + eBay volume), Yahoo!フリマ (volume). Verified: Yahoo Auctions closedsearch (38 `PCG鑑定品` sales in 180 days).

## 8. Matching

Goal: assign `(product, grade_value, grade_label)` to a listing **only when it is unambiguous**; otherwise route to review. Never name-match.

### eBay (`ebay_metadata`)
Structured fields from `metadata` (Browse `localizedAspects` + `conditionDescriptors`; The Card API equivalents where present):
1. `Professional Grader` must equal `Premier Card Grading (PCG)` (ID 2750118). Anything else → `rejected` with `grader_not_pcg`. Missing → `needs_review`.
2. `Grade` → `grade_value`.
3. `Set` + `Card Number` + `Language` → product. `Set` resolved through `sets.name_en` / `aliases`. Exactly one product → `matched`; zero or many → `needs_review` (`ambiguous_set` / `no_card_number`).
4. `Certification Number` if present → cert lookup overrides steps 2–3 (`match_method=cert`).
5. Title scanned for exactly one thing: the 10-tier word (`Flawless` / `Pristine` / `Gem Mint`) → `grade_label`. eBay's Grade field is numeric only, so this is the only title dependency. Absent → label null.

### Japanese sources (`jp_codes`)
No structured metadata exists on Yahoo Auctions / Yahoo!フリマ. Extraction is limited to three fixed patterns applied to title, then description:
1. **Set code** — case-insensitive match against the closed list `sets.printed_code` (`SV1a`, `s12a`, `M2a`, `SV-P` …).
2. **Card number** — regex `\b(\d{1,3})\s*/\s*(\d{1,3}|[A-Z]+-P)\b`.
3. **Grade** — regex over `PCG\s*鑑定?\s*(10|9\.5|9|8\.5|8|7\.5|7|6|5|4|3|2|1)` and the katakana/English tier words (`フローレス`/`Flawless`, `プリスティン`/`Pristine`, `ジェムミント`/`Gem Mint`).

All three present and resolving to exactly one product → `matched`. Any missing or ambiguous → `needs_review` with the specific reason. Title contains `PCG-P`, `/PCG-P`, or `PCGS` without a grade token → `needs_review` with `possible_pcg_set_code` / `possible_pcgs` (admin confirms reject).

### Common
- Lots ("×3", "セット", "まとめ") → `needs_review` with `lot`.
- Grade names are normalised through PCG's rename table (`Gold Pristine`→`Flawless`, `EX-NM`→`Excellent`, etc.).
- `matcher_version` stamped; a version bump re-runs everything not `is_override`.

### Admin review queue (`/admin/review`)
- Lists `needs_review` newest first: title, photos (source-hosted), price, link, `extracted` ("found grade 10, no card number").
- Admin picks product via the same search box as the public site, sets grade + label, or rejects. Writes `is_override=true`, `match_method=admin`.
- Counts by `review_reason` on the dashboard so the largest failure bucket is visible.
- Every resolution is exported (title → product/grade) into the domain test fixtures.

## 9. Pricing

- **Headline = median** of matched `sold` listings for `(product, grade_value, grade_label)` within the window.
- **Pooled 10:** listings with `grade_value=10, grade_label=null` count toward a pooled "10 (any)" point. The grid shows Flawless / Pristine / Gem Mint columns only where each has ≥1 sale of its own; otherwise a single "10" column. No split is ever fabricated.
- **Currency:** stored native; converted at the ECB rate for the sale date. Display shows both (`¥18,500 ($118)`).
- **Best-offer eBay sales** (`is_best_offer`) appear in the sold list flagged "≤ $X" and are excluded from medians.
- **`ended` (active→gone) listings** are never in the grid; shown in a separate "possibly sold" section only if we choose to surface them.
- **Confidence:** `high` = ≥5 sales and max/min < 2; `med` = 2–4 sales; `low` = 1 sale.
- **Windows:** 30d / 90d (default) / 180d / all.

## 10. Web app

| Route | Content |
|---|---|
| `/` | Search box (§6). Results: image, set, printed number, language, PCG 10 median |
| `/card/[productId]` | Header (names EN+JA, set, number, image) · grade × price grid with `n` and confidence · window toggle · sold list (date, grade, native + USD price, source, outbound link) · price-over-time chart, one series per grade |
| `/admin/review` | Review queue (§8) |
| `/admin/health` | `ingest_runs` table, per-source counts: sold / matched / in queue / rejected |

- Card page is server-rendered from `price_points` + `listing_matches`; cached and revalidated after each `prices` run. This page is the shareable proof ("a PCG 10 of this sold for $190 last week").
- PWA: installable manifest, offline app shell, last-viewed card pages cached. No push, no public accounts.
- Auth: Supabase Auth, admin routes gated by `admin_users` allowlist.
- Footer: not affiliated with eBay / LY Corp; card images © The Pokémon Company / Nintendo / Creatures / GAME FREAK via TCGdex; prices are observed sales, not offers.

## 11. Error handling, operations, legal posture

- One connector failing never blocks another or the `prices` job. Failures land in `ingest_runs.errors` and show on `/admin/health`.
- Scrapers: obey robots.txt paths exactly (Yahoo Auctions allows `/closedsearch/closedsearch`; parameterised variants are avoided), real User-Agent with contact email, ≤1 req/s, exponential back-off, 6h pause on 429/403.
- Kill switch per connector (env flag) so a takedown request can be honoured in one commit.
- Listing images are linked, never copied. Only title, price, date, URL, and structured metadata are stored.
- Secrets in GitHub Actions and Vercel env; Supabase service role key never reaches the browser.
- Japan: Copyright Act Art. 30-4 covers information analysis; LY Corp terms are contractual risk only, mitigated by low rate and robots compliance. Mercari JP is excluded because of its explicit anti-scraping clause.

## 12. Testing

- `packages/domain` is pure and fully unit-tested: number normaliser, set-code detector, grade parser, JP extraction, eBay metadata mapping, median/confidence. Fixtures are **real titles** captured in research plus every admin-resolved example.
- Connectors are tested against recorded HTML/JSON fixtures; live calls only in the spike scripts.
- Smoke test: seed 20 listings → `match` → `prices` → card page renders the expected grid.

## 13. Phasing

1. **Spike (days).** Scripts, not product code: pull ~30 days from The Card API, Yahoo Auctions, Yahoo!フリマ; count PCG Pokémon sales per source; sample titles into fixtures. Decide which sources are scheduled. Register eBay developer + EPN accounts (both have rejection risk; start early).
2. **POC (weeks).** Monorepo scaffold → Supabase schema → TCGdex catalog sync → chosen connectors → matcher → pricing → card page + search → admin queue + health → GitHub Actions cron → Vercel deploy.
3. **After POC.** Licences (aucfan corporate API, The Card API paid tier, eBay partner/Marketplace Insights application); PCG label OCR on slab photos to turn Japanese listings into metadata-grade data; active listings surfaced; PCG pop counts on card page; One Piece; Japanese UI.

## 14. Open questions (resolved during the spike)

- Does The Card API return eBay item specifics / condition descriptors, or title only? Does it normalise PCG as a grader?
- Real PCG Pokémon sold volume per source over 30 days.
- Exact Browse API `aspect_filter` syntax for the grader condition descriptor (fallback: `q=PCG` + post-filter).
- Does Yahoo!フリマ's item page expose the sold date?
- Which TCGdex EN sets lack a `printed_code`, and what alias list is needed for eBay `Set` values.
