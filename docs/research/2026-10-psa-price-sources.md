# PSA price sources: research (2026-10-14 to 2026-10-20)

Purpose: find a source of PSA-graded market prices to drive PCG price estimates (spec: `docs/superpowers/specs/2026-10-20-psa-estimates-design.md`).

**Decision: PriceCharting CSV for PSA-equivalent prices. SoldComps stays PCG-only.**

## PriceCharting (chosen)

Read from the official docs at pricecharting.com/api-documentation and the plans page at /pricecharting-pro, using a normal browser on 2026-10-18.

- **Plan:** the API and CSV need **Legendary, $49/mo**. Collector ($6/mo) has no API access. There's no free API tier or trial.
- **Data:** *"The API and CSV only support current item values in various grades and conditions. Historic prices and historic sales are not supported."* The sold listings shown on card pages are website-only. The `/api/offers` endpoints cover PriceCharting's own marketplace, not eBay comps.
- **Card price keys:**

  | Key | Meaning |
  |---|---|
  | `loose-price` | Ungraded |
  | `condition-9-price` | Grade 1 |
  | `condition-10-price` | Grade 2 |
  | `condition-13-price` | Grade 3 |
  | `condition-14-price` | Grade 4 |
  | `condition-15-price` | Grade 5 |
  | `condition-16-price` | Grade 6 |
  | `cib-price` | Grade 7 or 7.5 |
  | `new-price` | Grade 8 or 8.5 |
  | `graded-price` | Grade 9 |
  | `box-only-price` | Grade 9.5 |
  | `manual-only-price` | **PSA 10** |
  | `bgs-10-price` | BGS 10 |
  | `condition-17-price` | CGC 10 |
  | `condition-18-price` | SGC 10 |
  | `condition-19-price` | CGC 10 Pristine |
  | `condition-20-price` | BGS 10 Black |
  | `condition-21-price` | TAG 10 |
  | `condition-22-price` | ACE 10 |

  Grades 1–9.5 are "by a grading company", meaning blended across graders. Only `manual-only-price` is PSA-specific.
- **Other useful columns:** `sales-volume` ("the yearly units sold"), `tcg-id` (TCGplayer ID), `epid`, `release-date`, `console-name`, `product-name`.
- **CSV:** generated every 24 hours; prices in USD with two decimals; column names match the API keys. CSV calls are limited to one every 10 minutes. The API returns prices in pennies.
- **Storage:** "Data can and should be cached/stored on your servers." All data must be purged when the subscription ends.
- **Licence:** "licensed for internal use only. Sharing our price data with a third party, or making it available within an application or service used by others, requires a commercial license and express written permission." The user treats derived estimates as internal use. See the spec, §11.

## SoldComps (kept for PCG only)

From sold-comps.com and /docs, 2026-10-14.

- **Plans:**

  | Plan | Price | Requests/month |
  |---|---|---|
  | Basic | Free | 100 |
  | Starter | $9/mo | 2,000 |
  | Growth | $29/mo | 10,000 |
  | Scale | $79/mo | 50,000 |

  **Commercial use is allowed on every plan**, including the free one.
- **What a request returns:** one request is one page of up to **240** sold items (`count` = 60, 120 or 240). Each page is billed separately. Searches reach back at most 90 days and stop at page 100.
- **Item specifics:** Grade, Set, Card Number and Professional Grader are **not** in the scrape response. Fetching them costs one request per item (`/v1/item/{id}`). They can be used as filters through `aspectFilter`, but unknown facet names are **silently ignored**.
- **Follow-up for the existing connector:** it uses `count: 40`, but valid values are 60, 120 or 240. Switching to 240 would cut PCG request usage roughly sixfold.

## Rejected

- **PokemonPriceTracker:**
  - Free tier: 100 credits a day, with PSA 8/9/10 prices from eBay sales. Business is $99/mo and is needed for commercial use and population data.
  - It's Pokémon-only, with no sign of One Piece.
- **PokeTrace:** the free tier has ungraded prices only.
- **Scrydex:** covers several games including One Piece (beta), with graded prices and population data on every plan. It starts at $29/mo and has no free tier. Worth revisiting for One Piece.
- **JustTCG:** covers several games. Graded data is only in a v2 beta, and the free tier is non-commercial.
- **Collectr:**
  - The official API ([getcollectr.com/api](https://getcollectr.com/api)) needs approval. Its terms forbid storing pricing data, redistribution and competing services, and require "Powered by Collectr".
  - The app's backend `api-v2.getcollectr.com` is private and blocks non-browser clients with CloudFront 403s. Not used.
- **PSA's own API:** cert lookup, with a reported limit of about 100 calls a day. Sources disagree on whether it returns population counts. There's no price data.
