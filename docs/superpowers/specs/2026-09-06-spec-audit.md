# Spec audit log

Spec under audit: `2026-09-06-pcg-markets-design.md`. Prompt: `2026-09-06-spec-audit-prompt.md`.

## Iteration 1 — 2026-09-06

### Findings

- [BLOCKING] A-01 — `price_points` PK included nullable `grade_label`; Postgres PKs cannot contain nulls, so pooled rows could not exist — §5 — spec text "grade_label … nullable = pooled" in PK `(product_id, grade_value, grade_label, window)`
  - Fix applied: yes — `grade_label` NOT NULL with `'any'` sentinel for pooled.
- [BLOCKING] A-02 — Pooled-10 rule was ambiguous: "pooled" could mean *only unlabelled* 10s or *all* 10s; §6 search results and §10 grid would read it differently — §9 — "listings with grade_value=10, grade_label=null count toward a pooled point"
  - Fix applied: yes — `'any'` = all sales at that grade; tier points are sub-slices shown only at ≥2 sales; never summed. §6 now names the exact `price_points` row the search result reads.
- [MAJOR] A-03 — Spec claimed eBay "made grader + grade mandatory for Graded condition"; research only says MIP defines the descriptors and could not observe fill rates ("expect a mix of correctly-set grader, 'Other', and blanks") — §8 — western-marketplaces §2 Q5
  - Fix applied: yes — claim softened, `grader_missing` reason added, fill rate added to §14 spike list.
- [MAJOR] A-04 — Yahoo!フリマ connector requires `?sold=1`, which フリマ's robots.txt disallows; §11 simultaneously claimed "obey robots.txt paths exactly" — §7, §11 — japan-asia table row "robots.txt disallows sold/open/sort params"
  - Fix applied: partially — conflict documented in §7 and §11 with three options; connector ships off by default. Decision is the product owner's (see Still open).
- [MAJOR] A-05 — No mechanism for `ebay:active` "disappearance → ended": nothing recorded when an item was last seen — §5, §7
  - Fix applied: yes — `last_seen_at` column; ended after 2 consecutive misses.
- [MAJOR] A-06 — Same eBay sale can arrive twice (`ebay_browse` active→ended and `thecardapi` sold) and would be two `raw_listings` rows; no dedupe rule — §5
  - Fix applied: yes — `external_item_id` column + cross-source dedupe rule; only the `thecardapi` row prices.
- [MAJOR] A-07 — Budget arithmetic for `ebay:active` assumed metadata from the search response; research states `conditionDescriptors`/aspects are on the *item* response, so a `getItem` per listing is required (~2k calls on first run) — §7 — western-marketplaces §2 Q1 "The Browse item response carries conditionDescriptors[]"
  - Fix applied: yes — call plan and arithmetic added; still within 5k/day.
- [MAJOR] A-08 — No connector cursor/watermark; a crash mid-page would either skip or re-ingest without a rule — §7
  - Fix applied: yes — `connector_state` table; cursor advances only after a full page persists; partial-page rule added.
- [MAJOR] A-09 — JP grade regex `PCG\s*鑑定?\s*(10|…)` fails on real research titles `PCG鑑定品 Gem Mint 10` (品 and tier word between) and `[PCG10/Flawless]` — §8 — japan-asia "ヒバニー AR 745/742 PCG鑑定品 Gem Mint 10"; Card Lab "[PCG10/Flawless]"
  - Fix applied: yes — regex rewritten with optional `品`/`graded` and optional tier word; both titles now parse.
- [MAJOR] A-10 — Promo numbers (`001/SV-P`) satisfy the number regex but the "set code" step would fail because the promo era code is the denominator, sending every promo to review — §8
  - Fix applied: yes — alphabetic denominator counts as the set code.
- [MAJOR] A-11 — `raw` jsonb stored the full payload including seller usernames/ids — personal data under Japan APPI / GDPR for EU eBay sellers; §11 claimed nothing sensitive was stored — §5, §11
  - Fix applied: yes — seller identifiers stripped before insert; only `seller_country` kept.
- [MINOR] A-12 — "Verified: Yahoo Auctions closedsearch (38 sales)" overstated; research says the 38 were "mixed with set-code noise" — §7 — japan-asia table
  - Fix applied: yes — reworded as partially verified; spike measures true count.
- [MINOR] A-13 — Decisions log said "Set IDs equal the codes printed on cards" — true only for Japanese TCGdex sets; EN ids are dotted (`sv04.5`) with a separate ptcgo code — §3 — competitors-and-catalogs TCGdex row
  - Fix applied: yes — qualified.
- [MINOR] A-14 — `grade_label` semantics for non-10 grades undefined (is 9.5 "Gem Mint" or null?) — §5
  - Fix applied: yes — label meaningful only at 10; null elsewhere.
- [MINOR] A-15 — Authentication slabs (eBay Grade "Authentic") had no representation; `grade_value` numeric would be forced — §5, §8
  - Fix applied: yes — `grade_value = null`, `grade_label = 'Authentic'`, excluded from grid.
- [MINOR] A-16 — Confidence rule had a gap: ≥5 sales with max/min ≥ 2 mapped to nothing — §9
  - Fix applied: yes — maps to `med`.
- [MINOR] A-17 — Median for even counts, FX lookup on non-trading days, and non-JPY/USD eBay currencies (GBP/AUD/EUR) unspecified — §5, §9
  - Fix applied: yes — mean of middle two; latest rate on/before date; all observed currencies.
- [MINOR] A-18 — Cert path had no fallback when the 9-digit input is not a PCG cert — §6
  - Fix applied: yes — falls through to number search.
- [MINOR] A-19 — JP language detection unspecified; research shows `海外` / `英語版` tokens on EN cards sold in Japan — §8
  - Fix applied: yes — default `ja`, token list flips to `en`.
- [MINOR] A-20 — `10+` token (research: sometimes means Pristine, unconfirmed) had no rule — §8
  - Fix applied: yes — recorded as hint, does not set label.
- [MINOR] A-21 — Lot detection missed English tokens and `セット` false positives ("set" as expansion) — §8
  - Fix applied: yes — token list extended; `セット` only adjacent to digit/枚.
- [MINOR] A-22 — Vintage Japanese cards have no printed number; spec implied every card has one — §8
  - Fix applied: yes — noted as expected review-queue traffic; TCGdex representation added to spike list.
- [MINOR] A-23 — No zero-result / markup-change guard for scrapers; a silent parser break would look like "no sales" — §7, §11
  - Fix applied: yes — `suspect` run status; cursor not advanced.
- [MINOR] A-24 — TCGdex image licence stated as if granted; research says no explicit licence — §10
  - Fix applied: yes — footer text and fallback plan.
- [MINOR] A-25 — The Card API rows may be title-only; English titles would have fallen into the JP code rules by default — §8
  - Fix applied: yes — `no_metadata` reason; English titles never code-extracted.
- [SUGGESTION] A-26 — `ebay:active` is the only reason the POC needs an eBay developer account (rejection risk, slow); sold data comes from The Card API. Deferring it removes the slowest external dependency — §7, §13
  - Fix applied: no — product-owner call; listed in §14.
- [SUGGESTION] A-27 — JP listings with number but no set code are common (research). A code-only relaxation (number + denominator + language → exactly one product across all sets) would match many without name matching — §8
  - Fix applied: no — touches protected decision 5's boundary; listed in §14.

### Checked OK
- §1 competitor coverage claims — match competitors-and-catalogs Track A table.
- §5 grade scale names and rename table — match pcg-company §2.
- §6 numerator-only search and JA/EN same-number collision — handled by ranking + language badge (after A-18 edit).
- §7 The Card API budget — 5k/day, 3-day lookback, 4 runs/day well inside; matches western-marketplaces table.
- §7 Yahoo Auctions path — `/closedsearch/closedsearch?p=` matches the robots.txt Allow in research; pagination param flagged to spike.
- §8 `PCG-P` with a grade token — correctly treated as legitimate (rule already said "without a grade token").
- §8 eBay grader ID 2750118 / category 183454 — match western-marketplaces §0.
- §10 card-page trace — every displayed value now maps to a column: header ← `products`+`sets`; grid ← `price_points`; sold list ← `raw_listings` ⋈ `listing_matches` ⋈ `fx_rates`; chart ← same join; search median ← `price_points('any','90d')`.
- §11 Mercari JP exclusion — matches japan-asia legal section.
- §12 fixtures-from-admin-resolutions — consistent with §8 queue design.
- §13 phasing — no conflict with decisions 1–7.

### Still open (needs product owner)
- A-04 — Yahoo!フリマ: accept robots.txt deviation for `?sold=1`, use active-only fallback, or drop from POC?
- A-26 — Defer `ebay:active` (and the eBay developer account) out of the POC?
- A-27 — Allow number + denominator + language matching when no set code is present, or keep strict?

## Iteration 2 — 2026-09-06

Re-read the full spec after iteration-1 edits; re-verified A-01…A-25 (all hold, listed under Checked OK); full checklist pass.

### Findings

- [MAJOR] A-28 — Yahoo Auctions closedsearch lists *every* ended auction, including ones with zero bids; spec treated all closedsearch rows as `sold`, which would put unsold asking prices into the median — §5, §7 — japan-asia table: closedsearch returns "落札価格, end date, **bids**"
  - Fix applied: yes — `kind=sold` only when bids ≥ 1, else `ended`; `kind` column note now states the transaction-evidence rule per source.
- [MAJOR] A-29 — §13 spike said "pull ~30 days from The Card API"; the free tier has a **3-day lookback**, so that is impossible under decision 2 (free tiers) — §13 — western-marketplaces table: "Free 5k records/day, 3-day lookback"
  - Fix applied: yes — spike runs daily for ~10 days and extrapolates; Yahoo Auctions (180-day window) pulled directly; フリマ sampled via item pages.
- [MINOR] A-30 — `raw_listings.currency` note said `USD / JPY` while `fx_rates` anticipates GBP/AUD/EUR/CAD — §5
  - Fix applied: yes — ISO 4217 as reported.
- [MINOR] A-31 — "Vintage Japanese cards have no printed number" was stated as fact but is not in the research — §8
  - Fix applied: yes — marked as domain knowledge; TCGdex handling already a spike item.
- [MINOR] A-32 — JP language tokens listed `海外版` / `米国版`; the research example is bare `海外` ("ナンジャモ 海外 プロモ") and `米国版` is unsupported — §8
  - Fix applied: yes — `海外`, `英語`, `English`, `EN版`.
- [MINOR] A-33 — Promo-suffix regex `[A-Z]{1,4}-P` misses `DPt-P` (research era list) — §8
  - Fix applied: yes — mixed case.
- [MINOR] A-34 — `match` job scope ("new + needs_review") contradicted §8 Common ("version bump re-runs everything not override", which includes `rejected`) — §7, §8
  - Fix applied: yes — routine vs version-bump scope stated in §7.
- [MINOR] A-35 — `is_best_offer` semantics if a source reports the *accepted* price (The Card API might) were undefined; such sales would have been wrongly excluded — §5, §9
  - Fix applied: yes — true only when accepted price is unknown.
- [MINOR] A-36 — `listing_matches.confidence` (0–1) was never set by any rule or read by pricing; matching is binary by design — §5 (YAGNI/ambiguity)
  - Fix applied: yes — column removed.
- [MINOR] A-37 — Card-page chart "one series per grade" ambiguous between grade_value and grade_value×tier — §10
  - Fix applied: yes — per `grade_value`, tiers not split, points are individual USD sales.
- [MINOR] A-38 — No index for the promo search path `(number_num, number_suffix)` introduced in A-18 — §5
  - Fix applied: yes.
- [MINOR] A-39 — eBay `Card Number` aspect may be numerator-only (`201`); rule 3 did not say whether that is acceptable — §8
  - Fix applied: yes — acceptable once `Set` resolves; normalised via §6.
- [MINOR] A-40 — `/admin/health` did not surface `suspect` runs or `connector_state` cursors added in A-08/A-23; `ebay:active` not marked as invisible in the POC — §7, §10
  - Fix applied: yes.
- [SUGGESTION] A-41 — EPN registration in §13 was not needed for anything in POC scope (no affiliate links; Browse works without it per research) — §13
  - Fix applied: yes — removed from the spike; eBay dev account tied to the A-26 decision.

### Checked OK
- A-01 `price_points` PK — `grade_label` NOT NULL with `'any'`; PK valid.
- A-02 pooled rule — §9 and §6 agree on `'any'` = all sales at grade; tier ≥2 to show.
- A-03 grader-mandatory claim — softened; fill rate in §14.
- A-04 フリマ conflict — documented in §7 and §11; connector off by default; owner item.
- A-05 ended detection — `last_seen_at`, 2 misses.
- A-06 dedupe — `external_item_id` rule present.
- A-07 `getItem` budget — arithmetic in §7 (≈2.1k first run < 5k).
- A-08 `connector_state` — present; cursor rule consistent with A-23 partial-page rule.
- A-09 JP grade regex — re-tested by hand against `PCG鑑定品 Gem Mint 10`, `[PCG10/Flawless]`, `PCG鑑定 9.5`, `PCG10`, `PCG 9.5`: all capture the numeric group; `PCG-P` does not match (hyphen breaks `\s*`).
- A-10 promo denominator = set code — present.
- A-11 seller PII stripped — §5 and §11 consistent.
- A-12…A-25 — wording present as recorded in iteration 1.
- §1, §3 vs research — no new conflicts.
- §6 search shapes — cert fallback, promo suffix, numerator-only ranking all present; 9-digit lot number falls through.
- §9 — median (even count), FX on/before date, confidence three-way, windows from `computed_at`: no two-reading sentences found.
- §10 card-page trace — header ← `products`⋈`sets`; grid ← `price_points`; sold list and chart ← `raw_listings`⋈`listing_matches`⋈`fx_rates`; search median ← `price_points('any','90d')`. Authentication slabs appear in sold list only.
- §11 legal — matches research per source; Mercari JP excluded; Yahoo Auctions path allowed; フリマ flagged.
- §12 — fixtures include the §8 example titles; connectors fixture-tested.
- §14 — spike list covers The Card API fields/best-offer/item id, fill rates, aspect_filter syntax, フリマ date, pagination robots, EN printed codes, vintage JP ids.

### Still open (needs product owner)
- A-04 — Yahoo!フリマ robots.txt: accept deviation, active-only fallback, or drop.
- A-26 — Defer `ebay:active` (and the eBay developer account) out of the POC.
- A-27 — Allow number + denominator + language matching when no set code is present, or keep strict.
