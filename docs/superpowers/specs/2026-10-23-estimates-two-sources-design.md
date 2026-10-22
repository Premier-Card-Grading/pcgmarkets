# Estimates from two PSA price sources — design change

Date: 2026-10-23
Status: approved by the user 2026-10-23, implemented
Changes: `docs/superpowers/specs/2026-10-20-psa-estimates-design.md` (the 60–90% rule, where estimates show and what is never shown stay as they are)

## 1. Why

Estimates fill PCG grades that have never sold, as 60–90% of the equivalent PSA price. The approved design takes every PSA price from PriceCharting's daily CSV. The user wants **two sources**:

- **PriceCharting** (daily CSV, every card, $49/mo, not subscribed yet).
- **PSA sales from SoldComps**, identified from the slab label (`psa_sales`, 8,546 sales on 1,839 cards from the 2026-10-23 backfill; 523 cards have 3+ priced PSA 10 sales).

Today the estimates table is empty because PriceCharting has never been imported. With this change, cards with enough PSA sales get estimates now, and PriceCharting fills the rest once it is subscribed.

## 2. The PSA price for one card and grade

For each card and PCG grade (mapped to a PSA grade as today: 10 → 10, 9.5 → 9.5, 9 → 9, 8.5/8 → 8, …):

1. **SoldComps first**, when the card has **at least 3 priced PSA sales at that grade sold in the last 90 days**: the PSA price is their **median**. Best Offer sales without a known price do not count.
2. **Otherwise PriceCharting**, when it has a price for that grade (as in the approved design).
3. **Otherwise no estimate** for that grade.

The user confirmed SoldComps always comes first. PSA has no 9.5, so PCG 9.5 estimates only come from PriceCharting. Why SoldComps first: those are real PSA sales of exactly that grade, while PriceCharting's prices below 10 are blended across graders (accepted in the approved design). Three sales is the floor so one odd sale cannot set a price.

Not done: averaging the two sources together. It hides which source a number came from and makes the result harder to check; the priority rule is simpler and either source alone is defensible.

## 3. Share of the PSA price

**A flat 75% for every estimate, from either source** (user, 2026-10-23), until there is a way to measure popularity. The 60–90% popularity ranking stays in the code (`computeEstimates` without `flatPct`) for when there is one. SoldComps sale counts are *not* a popularity measure: the backfill searched one page per set, so busy English sets reach a few days back and Japanese sets months, and a count says more about the set's search than about the card.

## 4. Freshness

- PriceCharting estimates: unchanged (hidden on the card page when the import is older than 14 days).
- SoldComps estimates: `source_as_of` is the **newest sale used**. The card page shows a SoldComps estimate while that date is within **90 days**, the same window the median was taken over. After that, a SoldComps estimate needs a new sweep of that card's set.

## 5. Data model (migration `0011`)

`price_estimates` gains `source text not null check (source in ('pricecharting','soldcomps'))`, and `import_id` becomes nullable (a SoldComps estimate has no PriceCharting import). The public view `public_price_estimates` adds `source` so the card page can apply the right freshness rule; it still never exposes the PSA price, `pct` or popularity.

## 6. Job

`pnpm ingest estimates` no longer fails when there is no PriceCharting import: it uses whichever sources exist, and logs how many estimates came from each. A PriceCharting import older than 7 days still marks its part `suspect` and keeps the previous PriceCharting estimates; SoldComps estimates are recomputed on every run.

## 7. Card page

An estimate still reads "~$84 Est."; the footnote drops "and card popularity", since the share is now flat: "Estimated from PSA market prices — no PCG sales yet." The source is never named on the public page.

## 8. Testing

- Domain: SoldComps beats PriceCharting at 3+ sales; 2 sales fall back to PriceCharting; Best Offer sales without a price are ignored; sales older than 90 days are ignored; the 60% floor without a PriceCharting volume; real PCG grades still win.
- Job: runs with no PriceCharting import; counts per source.
- Web: a SoldComps estimate shows within 90 days of its newest sale and hides after.

## 9. Decisions (user, 2026-10-23)

1. SoldComps PSA prices always come first; PriceCharting fills the rest once subscribed.
2. 3 priced sales of the grade in 90 days for a SoldComps price.
3. A flat 75% of the PSA price for every estimate until popularity can be measured.

First run (2026-10-23): 659 estimates, all from SoldComps (493 PCG 10, 150 PCG 9, 16 lower grades), from 7,281 priced PSA sales.
