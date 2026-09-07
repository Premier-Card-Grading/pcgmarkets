# SoldComps eBay-Sold Source + eBay-Title Matcher — Plan

> Extension to the PCG Markets POC (already merged to main). Adds a free eBay *sold* source (SoldComps) and an English/eBay-title matcher path. Same monorepo, same review discipline.

**Goal:** Ingest eBay sold PCG listings via SoldComps (free tier), match them to products by parsing the (structured-enough) English/JA-code titles, and price them — lifting matched sold listings from ~11 toward ~1,000+.

**Spike evidence (2026-09-07):** `"PCG 10 pokemon"` → 5,298 eBay sold; 95% of titles carry a PCG grade, 60% a card number; ~20% cleanly matchable (real JA set codes: sv8a, M2a, S8b …). Noise: ~40% Chinese grey-market (`Csv9.5C`, `S.Chinese`) — often a different grader; a few `x PCG`/`PCG campaign`/`Nagaba` promo-name false positives (card is actually PSA/CGC).

**SoldComps API:** `GET https://api.sold-comps.com/v1/scrape?keyword=<kw>&page=<n>&count=40`, header `Authorization: Bearer $SOLDCOMPS_KEY`. Response `{ keyword, page, totalResults, hasNextPage, items:[{ itemId, title, condition, endedAt, soldPrice, soldCurrency, totalPrice, sellerUsername, ... }] }`. **No `url` field** → build `https://www.ebay.com/itm/{itemId}`. **No structured grader/grade/set** → title-only. Free tier 100 req/mo, 60 req/min.

## Global constraints
- Free tier only. Budget SoldComps requests carefully (100/mo): a keyword sweep of a few keywords × a few pages per run.
- Strip `sellerUsername` (PII) before storing `raw` (reuse stripSellerFields).
- Never a wrong price: anything not cleanly resolvable → `needs_review`. Grey-market/other-grader noise → review, never matched.
- `kind = "sold"` (SoldComps returns completed sales); `is_best_offer = false` (soldPrice is the realised price).
- New `Source` value `"soldcomps"`; matcher dispatch routes it to the new eBay-title path (NOT matchEbay, which needs Browse metadata).

## File structure
```
packages/domain/src/
  types.ts               + "soldcomps" to Source; + review reasons "ambiguous_grader"
  match-ebay-title.ts     NEW — matchEbayTitle (reuses findSetCode/findCardNumber/parseGradeFromText/stripGradeToken + English set-name + noise filters)
  matcher.ts              route "soldcomps" → matchEbayTitle; bump MATCHER_VERSION → "3"
  catalog-index.ts        + setsByNameOrAlias already exists (reuse for EN set-name resolution)
packages/connectors/src/
  soldcomps/schema.ts     NEW — vendor shape (base, auth, fields, keywords)
  soldcomps/index.ts      NEW — soldComps: Connector (sweep + paginate + map + PII strip + eBay URL)
apps/ingest/src/jobs/
  soldcomps.ts            NEW — soldConnectorJob(soldComps)
  ../cli.ts               + "ebay:sold-comps" job
apps/web/components/SoldList.tsx   + soldcomps → "eBay" source label
```

---

### Task S1: SoldComps connector + Source type

**Files:** create `packages/connectors/src/soldcomps/{schema,index}.ts`, `packages/connectors/test/soldcomps.test.ts`, fixture `packages/connectors/test/fixtures/soldcomps-sample.json`; modify `packages/domain/src/types.ts` (add `"soldcomps"` to `Source`), `packages/connectors/src/index.ts` (exports).

**Interfaces produced:**
- `SOLDCOMPS` in schema.ts: `{ baseUrl:"https://api.sold-comps.com/v1", scrapePath:"/scrape", keywords:["PCG 10 pokemon","PCG 9.5 pokemon","PCG 9 pokemon"], authHeader:(k)=>({Authorization:`Bearer ${k}`}), count:40 }`
- `extractItems(body): unknown[]` (body.items), `toRawListing(item): RawListing|null`
- `soldComps: Connector` (name `"soldcomps"`), cursor `{ keywordIndex:number; page:number; seenIds:string[] }`

**Mapping (toRawListing):** `sourceItemId=itemId`; `url="https://www.ebay.com/itm/"+itemId`; `title`; `price=Number(soldPrice)` (null-guard, >0); `currency=(soldCurrency||"USD").toUpperCase()`; `kind="sold"`; `soldAt=new Date(endedAt).toISOString()` (null if invalid); `endedAt` same; `isBestOffer=false`; `sellerCountry=null`; `externalItemId=itemId`; `imageUrls=[]`; `metadata={}` (title-only); `raw=item` (connector persists via upsertRawListings which strips PII, but ALSO strip sellerUsername here in toRawListing's raw to be safe — actually stripSellerFields runs at DB layer; keep raw=item, DB strips). Return null if itemId/title/soldPrice/endedAt missing.

**Connector fetchSold:** sweep `keywords`; per keyword paginate `page` from cursor; stop a keyword when `hasNextPage===false` OR a page is entirely already-seen (dedupe via seenIds) OR after a page cap (e.g. 3 pages/keyword to respect the 100/mo budget — make it a const PAGE_CAP=3). Advance cursor per page (persist-then-advance, like yahoo). `suspect: items.length===0 && page===1`. Bearer from `process.env.SOLDCOMPS_KEY` (throw if missing).

**Steps (TDD):**
- [ ] Record a real fixture: `set -a; source .env; set +a; curl -s -H "Authorization: Bearer $SOLDCOMPS_KEY" "https://api.sold-comps.com/v1/scrape?keyword=PCG+10+pokemon&page=1&count=40" > packages/connectors/test/fixtures/soldcomps-sample.json`. Confirm it has `items[]`. (Uses 1 of 100 monthly requests.)
- [ ] Write `test/soldcomps.test.ts` asserting against the fixture: `extractItems` finds items; every `toRawListing` non-null result has source "soldcomps", sourceItemId, kind "sold", price>0, currency `^[A-Z]{3}$`, soldAt ISO, url `https://www.ebay.com/itm/`. Assert PII: `sellerUsername` is NOT copied into any typed RawListing field (it stays only in `raw`, stripped at DB layer).
- [ ] Run test → FAIL (module not found).
- [ ] Add `"soldcomps"` to `Source` union in domain types.ts. Write schema.ts + index.ts. Export.
- [ ] Run test → PASS; `pnpm --filter @pcg/connectors typecheck`; repo `pnpm typecheck`.
- [ ] Commit.

**Verify:** the recorded fixture parses; no live connector sweep yet (that's S3).

---

### Task S2: eBay-title matcher path

**Files:** create `packages/domain/src/match-ebay-title.ts`, `packages/domain/test/match-ebay-title.test.ts`; modify `packages/domain/src/types.ts` (add review reason `"ambiguous_grader"` to the union), `packages/domain/src/matcher.ts` (route `"soldcomps"` → matchEbayTitle; bump MATCHER_VERSION → `"3"`), `packages/domain/src/index.ts`.

**Interface produced:** `matchEbayTitle(input:{ title:string }, catalog: CatalogIndex): MatchResult`

**Algorithm** (reuses domain helpers; do NOT name-match a card, but DO resolve a SET by its English name/alias):
1. **Noise filters first** (route to review, never matched):
   - `/\bcsv\s?\d/i` or `/\bcgc\b|\bpsa\b|\bbgs\b|\bsgc\b|\btag\b/i` present AND no clear standalone PCG grade → `needs_review` reason `"ambiguous_grader"` (grey-market or other-grader listing).
   - `/x\s?pcg|pcg\s?campaign|nagaba/i` → `needs_review` `"ambiguous_grader"` ("PCG" is a promo/campaign name, not the grader).
2. `grade = parseGradeFromText(title)`; if none → `needs_review` `"no_grade"` (after the PCG-P/PCGS noise checks from match-jp — reuse hasPcgSetCodeNoise/hasPcgsNoise).
3. `isLot(title)` → `"lot"`.
4. `cardNumber = findCardNumber(title)`; none → `"no_card_number"`.
5. `language = detectLanguage(title)` (defaults ja; these JA-card titles usually say "Japanese"/carry JA codes — stays ja; English-set cards → resolve by EN name/denominator).
6. Set resolution (in order), using GRADE-STRIPPED title for set-code search (stripGradeToken):
   a. `findSetCode(stripGradeToken(title), catalog.setCodes(language))` → productsBySetAndNumber → exactly one → matched, method `"ebay_title"`.
   b. promo suffix (cardNumber.suffix) → productsBySuffixAndNumber → one → matched.
   c. number + denominator → setsByCardCount(denom, language) → productsBySetAndNumber → one → matched; >1 → `"ambiguous_set"`.
   d. English set NAME: scan the title for any `sets.name_en`/alias (via a new `catalog.findSetNameInText(title)` OR reuse setsByNameOrAlias by trying tokens) — if exactly one set matches by name AND its product at cardNumber.num resolves to one → matched. (Keep this conservative; if it needs a new catalog method, add `findSetInText(title): SetRef[]`.)
   e. else `"no_set_code"`.
7. `gradeLabel` = grade.value===10 ? parseTierLabel(title) : null. `match_method = "ebay_title"`.

**Add `"ebay_title"` to MatchMethod union** in types.ts.

**Steps (TDD):**
- [ ] Write `test/match-ebay-title.test.ts` with an InMemoryCatalog containing a JA set (code `M2a`, cardCount 193, product 230/193) and an EN set (name "Base Set", code "base1"/BS, cardCount 102, product 4/102). Assert (each fails pre-impl):
   - `"Pokemon PCG10 MEGA GENGAR EX M2a 230/193 MA 2025 Japanese"` → matched to M2a-230, grade 10, method `ebay_title`.
   - `"Charizard Base Set 4/102 PCG 10 Gem Mint"` → matched to the Base Set product via EN name (or number+denom 102), grade 10, label "Gem Mint".
   - `"Pokemon PCG10 EEVEE EX Csv9.5C 246/208 SAR 2026 Chinese"` → `needs_review` `ambiguous_grader` (Csv = other grader).
   - `"PSA 10 Pikachu Yu Nagaba x PCG Campaign 208/S-P"` → `needs_review` `ambiguous_grader`.
   - `"Pokemon PCG 10 Sylveon ex 069/187 sv8a"` with sv8a set → matched.
   - a title with grade+number but unknown set → `needs_review` `no_set_code`.
   - a lot title → `lot`.
- [ ] Run → FAIL. Implement match-ebay-title.ts (+ any catalog helper). Wire matcher.ts dispatch + MATCHER_VERSION "3". Update match-ebay.test.ts's version pin to "3".
- [ ] Run `pnpm --filter @pcg/domain test` (all green) + `pnpm typecheck`.
- [ ] Commit.

---

### Task S3: Ingest job + live run + web source label

**Files:** create `apps/ingest/src/jobs/soldcomps.ts`; modify `apps/ingest/src/cli.ts` (add job `"ebay:sold-comps"`), `apps/ingest/src/run.ts` KILL_SWITCH map (add `"ebay:sold-comps": "CONNECTOR_SOLDCOMPS"`), `apps/web/components/SoldList.tsx` (source label `soldcomps: "eBay"`), `.env.example` (already has SOLDCOMPS_KEY/CONNECTOR_SOLDCOMPS).

**Steps:**
- [ ] `soldcomps.ts`: `export const soldCompsJob = soldConnectorJob(soldComps);` Wire into cli.ts jobs map as `"ebay:sold-comps"`. Add kill-switch entry.
- [ ] `pnpm --filter @pcg/ingest typecheck` + repo typecheck + `pnpm --filter @pcg/ingest test` green.
- [ ] SoldList.tsx: add `soldcomps: "eBay"` to the source-name map.
- [ ] LIVE run (budget-aware — the connector's PAGE_CAP limits requests): `pnpm ingest ebay:sold-comps` → then `pnpm ingest match --all` (matcher v3 re-runs all non-override) → `pnpm ingest prices`.
- [ ] Verify + report: `select source,count(*) from raw_listings group by 1`; `select state,count(*) from listing_matches group by 1`; `select count(*) price_points, count(distinct product_id) products_priced from price_points`; and the review_reason breakdown for soldcomps rows. Report matched/priced BEFORE (matched 11, priced 11) → AFTER.
- [ ] `pnpm --filter @pcg/web build` (SoldList change compiles).
- [ ] Commit.

**Note:** the card page + search read `price_points`/`public_sales` (source-agnostic), so new soldcomps sales appear automatically once priced — only the SoldList source label needed changing.

---

## Self-review
Coverage: connector (S1), matcher path + dispatch + version (S2), ingest wiring + live run + web label (S3). PII stripped (S1 raw + DB layer). Noise → review (S2). No wrong prices (fail-closed). Free-tier budget respected (PAGE_CAP). Card page/search unchanged (source-agnostic reads).
Open risk: SoldComps `url` absent → constructed from itemId (verify the eBay itm URL resolves during S3 live run by spot-checking one). English set-name resolution (S2 step 6d) is the least-certain piece — keep conservative, fall to review.
