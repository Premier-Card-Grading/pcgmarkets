# Data pipeline + eBay accuracy — findings and handoff (2026-09-22)

Where we left off after investigating pricing-data accuracy. Pick up from the "Next week" list.

## TL;DR

- **eBay data was inaccurate:** the SoldComps connector text-searched "PCG 10 pokemon", which returned any listing with "PCG" in the title. 79% of matched eBay sales were China-located grey-market listings whose slabs are actually PSA/CGC.
- **Fixed on branch `feat/ebay-pcg-facet`** (commit `1123e0e`, not merged): the connector now filters by eBay's own grading-company facet (`aspectFilter={"Professional Grader":"Premier Card Grading (PCG)"}`) + Pokémon singles category `183454`, sweeping `ebay.com` / `ebay.com.au` / `ebay.co.uk`. **Validated live** — AU and UK both returned real PCG Pokémon results.
- **Yahoo is accurate**, leave it alone.
- **The Card API** will not be used for PCG (other plans for it).
- **Decision:** keep all three eBay sites.

## Pipeline state

- GitHub Action `.github/workflows/ingest.yml` runs sold sources every 6h, fx daily, catalog weekly, then match+prices. It had **never run on GitHub** until the repo was first pushed on 2026-09-22 — all existing data came from local `pnpm ingest` runs, last on **2026-09-07**.
- Data as of today (via service role): SoldComps eBay ~343 listings, Yahoo ~261, The Card API 0. 116 matched, 488 needs_review. Last ingest 2026-09-07 (15 days stale).
- `SOLDCOMPS_KEY` in `.env` was **stale** (old key); updated 2026-09-22 to the current key (ends `...jlla`, verified working by the user's own curl). `.env` is gitignored.

## The eBay accuracy problem (root cause)

- SoldComps returns **title + price + location + category only** — no grader field. Confirmed by dumping a stored `raw` payload.
- The grader lives in eBay's structured **item aspects** ("Professional Grader"), which SoldComps strips and eBay blocks from direct item-page scraping.
- The old approach text-searched titles, so grey-market sellers who type "PCG 10" into titles (cards actually PSA/CGC, often "S.Chinese"/"CSM"/"same as PSA") got matched as PCG, poisoning the medians.
- Evidence: of 105 matched eBay sales — 83 China, 15 US, 5 AU, 2 EU. Titles almost all one seller's `Pokemon PCG10 <NAME> <set> <number> ... Japanese` template.

## The fix

Filter at eBay's facets instead of guessing from titles. Confirmed facts:
- eBay's "Professional Grader" facet includes **"Premier Card Grading (PCG)"** (2,153 items in Pokémon singles).
- SoldComps `aspectFilter` takes a JSON object of eBay's exact sidebar facet names/values.
- Pokémon TCG singles = eBay category **183454**.
- Endpoint `/v1/scrape`; auth `Authorization: Bearer sc_...` (the `sc_` prefix is part of the key).

Implemented in `packages/connectors/src/soldcomps/{schema.ts,index.ts}` + tests. All facet strings live in `SOLDCOMPS` in `schema.ts` so they're one-line tunable. 40 connector tests pass, typecheck clean.

## Site-overlap finding (why we still keep all 3)

Live test, one call per site, PCG facet:
- `ebay.com.au` ∩ `ebay.co.uk` = **27 of 40 shared (67%)** — same international/US sellers, differing only by display currency (AUD vs GBP). Union 53 unique of 80 fetched.
- `ebay.com` failed both test runs (flaky API), but is the largest, most distinct pool.
- Dedup is handled: same eBay item id across sites is collapsed by the connector's `seenIds` and the DB unique `(source, source_item_id)`, so overlap never double-counts.
- **Cost:** three sites = 3× request usage (free tier 100/month). We accepted this tradeoff for coverage.

Residual caveat: eBay's facet is only as good as sellers' tags — a few "PCG 10, like PSA/CG" grey-market items still slip through because the seller set the structured PCG field. Big improvement over title text, not perfect.

## SoldComps API notes

- Free tier: 100 requests/month, ~17 used at start of today's session. Each eBay site is a separate request per page (`PAGE_CAP = 3` pages/site/sweep).
- The API is **intermittently flaky** — the same valid request returned 401 / 500 / 200 across rapid calls today. Space requests out (the connector's `politeFetch` already does 1s). Retry on 401/500 rather than assuming a bad key.
- Params confirmed: `keyword`, `ebaySite` (one per call: ebay.com/.com.au/.co.uk/…), `categoryId`, `aspectFilter` (JSON), `sortOrder=endedRecently`, `count` (≤40 sold), `page`. Docs: https://sold-comps.com/docs

## Next week (ordered)

1. **Validate `.com` scrape** — today it only flaked; run `pnpm ingest ebay:sold-comps` once and confirm all three sites return rows. If `.com` returns empty (not error), check the facet value spelling for that marketplace.
2. **Clean the existing bad data.** The 105 grey-market matches are still in the DB; re-matching won't remove them (they match from their own titles). Delete the old SoldComps `raw_listings` (+ their `listing_matches`), re-scrape with the new filter, then run `pnpm ingest match` and `pnpm ingest prices`. Expect eBay-sourced prices to thin out — accurate over plentiful.
3. **Merge `feat/ebay-pcg-facet`** into main once (1)+(2) look right.
4. **Fix the GitHub workflow:** it schedules `ebay:sold` (The Card API — not used for PCG) + `yahoo:auctions`, but NOT `ebay:sold-comps`, and its env lacks `SOLDCOMPS_KEY` / `CONNECTOR_SOLDCOMPS`. Add the sold-comps job to the 6h cron and its env. Also add the repo Actions secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SOLDCOMPS_KEY`, `CONTACT_EMAIL`) or the scheduled runs will fail.
5. **Historic backfill (optional):** no source offers bulk history. Yahoo closed-search reaches ~180 days (a deeper one-off sweep helps); FX has `FX_BACKFILL_DAYS` for a deep seed so old yen sales convert; The Card API is 3-day lookback (forward-only). Richer data mostly comes from running the cron reliably so it compounds.

## Branch/repo state

- `main`: UI redesign merged and pushed to `git@github.com:shuiiz/pcgmarkets.git`.
- `feat/ebay-pcg-facet`: connector accuracy fix + this doc. Not merged, not pushed.

## Sets catalogue (Limitless + TCGdex + pokemontcg.io)

Powers the `/sets` browse pages (spec: `docs/superpowers/specs/2026-10-21-sets-browse-design.md`).

**Prerequisite:** migration `packages/db/migrations/0006_sets_browse.sql` applied by hand: `npx supabase db query --linked -f packages/db/migrations/0006_sets_browse.sql`.

**Run order** (each job ends with an `ok:` / `suspect:` / `failed:` line):

```bash
pnpm ingest catalog:tcgdex      # sets + cards, EN and JA (~10 min)
pnpm ingest catalog:limitless   # Japanese names, codes, logos, extra sets (~15 min at 1 req/s)
pnpm ingest catalog:tcgdex      # second run must not undo Limitless-owned fields
pnpm ingest images:ja           # Limitless small images -> WebP q80 -> Supabase storage (long)
pnpm ingest images:en           # links missing English images from pokemontcg.io
```

- **Kill switch:** `CONNECTOR_LIMITLESS=off` disables the Limitless connector.
- **Larger images:** once the Supabase subscription starts, run `pnpm ingest images:ja --size lg` to upgrade stored images from small to large.
- **Permission:** Limitless gave permission on 2026-10-21 and asked for polite access: at most 1 request per second (and 2 concurrent requests to its image CDN), using the `PCGMarketsBot/0.1` user agent. A 403/429 pauses the job.
- **Images:** Limitless images are copied into our storage and never hotlinked; TCGdex and pokemontcg.io images are linked directly.
- **Duplicate sets:** TCGdex returns empty duplicates `SM1+`, `sm2+`, `SM3+`, `SM4+`, `SM5+` (the real sets are `SM1p`..`SM5p`); delete them when they have no products.

**Known gaps (spec section 7):**
- About 2,600 pre-2010 Japanese cards have no licensed image source, so they keep the slab tile.
- Some English sets have no image source: the DP to SM trainer kits and a few 2025-26 special sets.
- Japanese sets that only Limitless has show numbers without the official count.
