# The Card API — schema research (2026-09-07)

Docs: https://www.thecardapi.com/docs

## Endpoint

`GET https://thecardapi.com/api/v1/market/sales` (redirects to `www.thecardapi.com`; using `fetch`/undici follows the redirect transparently, so `baseUrl` is left as the bare `thecardapi.com` host).

## Auth

Header: `x-market-api-key: <key>` (key format `tca_...`). No bearer/query-param auth supported per docs.

## Params

Confirmed against the live API:

- `q` — full-text search on title, boolean-OR syntax supported, e.g. `(pcg,"premier card grading")`. **Minimum 4 characters** — `q=pcg` alone is rejected with a 422 (`string_too_short`).
- `graded` (boolean) — professionally graded only.
- `grader` — specific grading company filter (accepts arbitrary strings, e.g. `PCG`, but returns 0 rows if the company isn't present in the dataset — it is not validated against an enum).
- `date_from` / `date_to` (YYYY-MM-DD), `price_min`/`price_max`, `shipping_max`, `print_run_min`/`print_run_max`.
- `page`, `limit` (default 25, max 1000), `cursor` (opaque, from `pagination.next_cursor`), `indexed_after` (ISO timestamp, incremental sync).
- `sort` — `date_desc` (default), `date_asc`, `price_desc`, `price_asc`.

Our connector's production query: `q=(pcg,"premier card grading")&graded=true&limit=100&sort=date_desc`.

## Envelope

```json
{
  "data": [ /* array of sale records */ ],
  "pagination": { "total": 0, "page": 1, "limit": 100, "pages": 1, "next_cursor": null },
  "meta": { "coverage_date_from": null, "coverage_date_to": null, "platforms_covered": [...], "generated_at": "..." }
}
```

`envelope: ["data"]`, `paging: { param: "cursor", nextPath: ["pagination", "next_cursor"] }`.

## Record fields

Verified against a live recorded sample (`packages/connectors/test/fixtures/thecardapi-sample.json`, 11 graded records, `graded=true` query, no PCG keyword — see "PCG results" below for why).

| RawListing field | API field(s) | Present? |
|---|---|---|
| id | `id` | yes (vendor's own composite/opaque id, e.g. `tcgplayer-84606-2026-...`, or eBay's numeric item id when `platform=eBay`) |
| title | `title` | yes |
| price | `price` | yes |
| currency | `currency` | yes (`USD` in every observed record) |
| soldAt | `sold_at` (ISO 8601 UTC) | yes |
| url | `listing_url` | yes |
| imageUrls | `image_url` (single string, not an array) | yes — mapper wraps the single URL in a 1-element array |
| ebayItemId | — | **absent**. The API exposes its own `id`, which for `platform=eBay` rows happens to equal the eBay item number as a string, but there is no dedicated "underlying eBay item id" field distinct from `id`, and for non-eBay platforms `id` is not an eBay id at all. Left `""` in schema — do not conflate with `id`. |
| bestOffer | `listing_type` (enum: `auction`/`fixed_price`/`best_offer`) | present, mapped via `schema.ts`'s `fields.bestOffer = "listing_type"` plus a dedicated `bestOfferValues: ["best_offer"]` allowlist that the connector's mapper compares the raw string against (case-insensitive), rather than the shared `=== true`/`=== "true"` boolean check (which a string enum can never satisfy). Our research on eBay best-offer listings (`docs/research/2026-09-05-western-marketplaces.md`) found best-offer rows expose the **asking** price, not the accepted price — so `listing_type === "best_offer"` is treated conservatively as `isBestOffer=true` (excluded from pricing medians per spec §9) until/unless The Card API confirms its `price` field is the accepted amount on those rows. |
| grader | `grader` | yes when graded (also `grading_company`, redundant with `grader` in every sample record) |
| grade | `grade` | yes when graded |
| certNumber | `cert` | field exists but was **null in all 11 sampled graded records** (TCGplayer/eBay rows in this snapshot don't carry a cert number) |
| set | `card_set` | yes when graded/TCG |
| cardNumber | `card_number` | yes when graded/TCG |
| language | — | **absent**. No language field anywhere in the schema (sports/TCG cards alike). Always `""`/absent in our mapping. |

No seller-identifying fields (username, feedback score, etc.) exist anywhere in the payload — nothing to strip.

## PCG results

**The production query (`q=(pcg,"premier card grading")&graded=true`) returned 0 results** on 2026-09-07 (`"pagination":{"total":0}`). Follow-up probes confirm this is a real absence of PCG data, not a query bug:

- `grader=PCG` (no keyword) → 0 results.
- `q="premier card grading"` (quoted, no PCG abbreviation) → 0 results.
- A broad `graded=true` (no PCG filter) call over the same time window returned 11 graded records, with `grader` values of only `CGC` and `PSA`. No `PCG`/`Premier Card Grading` graded card has been observed in this API's feed.

Since the production query returns nothing to record, **the recorded fixture was captured with a temporarily broadened query (`graded=true&limit=100&sort=date_desc`, no `q`/PCG filter)** purely to observe the real response shape and validate field mapping against genuine structured grader/grade/set/card_number data. `schema.ts`'s `queryParams` was reverted to the intended PCG-targeting production query immediately after recording — the fixture and the live production query are intentionally different, and this is called out in a comment in `schema.ts`.

**Conclusion: this API does return structured grader/set/cardNumber metadata (title-only is NOT the case) — but currently carries zero PCG-graded inventory.** Every field the shared mapper needs (`grader`, `grade`, `cert`, `card_set`, `card_number`) is a real, well-populated column for graded cards from other graders (CGC, PSA); it will populate correctly the moment/if PCG-graded sales appear in the feed. Until then, `theCardApi.fetchSold()` will legitimately yield empty pages against production parameters — this is expected behavior, not a connector bug, and should be periodically re-checked as PCG (a newer grader) gets picked up by more marketplaces/data feeds.
