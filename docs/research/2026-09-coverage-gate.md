# Coverage gate — PCG Pokémon sold listings per source

Threshold (spec §7): ≥20 PCG Pokémon sales / 30 days to schedule a source.

Scope note: per the Task 15 controller ruling, The Card API's PCG coverage was
already established as zero in Task 13 (its graded-sales feed is CGC/PSA
only — no PCG grader ever appears), so the multi-day extrapolation run
described in the original task brief was skipped. Only Yahoo Auctions was run
live for this spike.

| Source | Measured window | PCG sold (30d, extrapolated where noted) | Grader/metadata fill rate | Decision | Date |
|---|---|---|---|---|---|
| yahoo_auc | 30d direct (one live `closedsearch` sweep across `YAHOO_KEYWORDS`, 25 items fetched total) | 1 | n/a — Yahoo listings carry no structured grader metadata (`withGraderAspect: 0`); grade/number are extracted from title text only | **hold** (1 ≪ 20) | 2026-09-07 |
| thecardapi | N/A — not re-run; carried over from Task 13's finding | 0 | 0% (its `grader` field never contains PCG/"Premier Card Grading") | **hold**, connector kept-but-empty (auto-populates once/if PCG sales appear in its feed) | 2026-09-07 |

## Raw run output (Yahoo, live, one sweep)

```json
{
  "source": "yahoo",
  "fetched": 25,
  "soldInLast30d": 4,
  "pcgSoldInLast30d": 1,
  "withGraderAspect": 0
}
```

`fetched` is the full accumulated `spikes/out/yahoo.json` set (all 4
`YAHOO_KEYWORDS` searches, one page each — every keyword's first results page
was already fully "seen" or had no next-page link, so the sweep completed in
a single page per keyword). `soldInLast30d` (4) counts every sold item — any
grader — within the trailing 30 days; `pcgSoldInLast30d` (1) additionally
requires a PCG grade token in the title. No HTTP error occurred (no
403/302); the connector's 1 req/s throttle was left untouched.

## Notes

- **PCG-P set-code noise on Yahoo: 7/25 titles (28%).** These are Pokémon
  promo cards printed with a `NNN/PCG-P` "card number" (Meiji chocolate
  promos, McDonald's promos, etc.) where `PCG-P` is a *promo-set suffix*
  printed on the card, not a grading company. `findCardNumber` legitimately
  parses `"104/PCG-P"` as num=104/suffix="PCG-P" (matches
  `[A-Za-z]{1,4}-[Pp]`), and `hasPcgSetCodeNoise` flags the same substring.
  In every one of these 7 titles the item was actually graded by PSA or ARS,
  not PCG — the real grader name sits well away from the `PCG-P` token, so a
  naive "contains PCG" substring check would badly overcount. The existing
  `parseGradeFromText` regex (requires a digit immediately after `PCG`,
  optionally through a tier word) already avoids this: none of these 7
  produced a false grade match, because `PCG-P` is followed by another
  letter, not a digit.
- **Titles lacking any card-number-shaped token: 13/25 (52%).** Mostly very
  old ("旧裏"/old-back) cards, brand/campaign mentions ("PCG CAMPAIGN"), and
  cards whose number uses a non-slash format (see next point). These
  correctly resolve to `no_card_number` / `no_grade` under `matchJp` even
  when a PCG-looking grade digit is present elsewhere in the title (e.g.
  `【PCG9】ピカチュウ 旧裏...` — grade parses fine, but there's no number to
  match against the catalog).
- **Non-Pokémon PCG items appear in the sample.** `YAHOO_KEYWORDS` (`PCG鑑定品`,
  `PCG鑑定`, `PCG10`, `PCG9.5`) are grader-scoped, not game-scoped: 1/25
  titles was a Yu-Gi-Oh card (`遊戯王 カイザー グライダー... 304-051 PCG9`).
  Its number format (`304-051`, hyphen not slash) doesn't match
  `CARD_NUMBER_RE` anyway, so it falls out at `no_card_number`, but it
  inflates the raw "PCG sold" funnel before matching and is worth knowing
  about if the gate count is ever done by keyword-hit count rather than by
  post-parse structure.
- **"PCG" as a bare brand mention (no digit follows) is common and correctly
  ignored.** Several titles include `ポケモンカード PCG ...` or `... PCG
  ピカチュウ ...` as a product-category mention (seller advertising "this is
  the kind of card PCG grades") with no grade number immediately following.
  `parseGradeFromText`'s requirement that a grade digit (optionally through a
  tier word) sit immediately after `PCG` correctly returns no grade for all
  of these — a substring-only "contains PCG" heuristic would have
  false-matched several of them.
- **Only 1 title was a clean match candidate**: `PCG9.5 ピカチュウ 016/049
  ほっぺすりすり 鑑定品 ポケモンカード` — PCG grade (9.5), clean `num/denom`
  card number, not a lot, no PCG-P/PCGS noise. Three more titles had a valid
  PCG grade digit but failed on `no_card_number` (old-back cards with no
  printed number) or `lot` (a 5-card bundle), and were sold *outside* the
  30-day window anyway (Mar–Jun 2026) — even loosening the window to the
  full ~6-month span the 25 fetched items cover, PCG-Pokémon volume on Yahoo
  is very thin (≤5 of 25 sampled items structurally match at all).
- **Sets sharing a `card_count` per language (TCGdex):** not measured in this
  spike — the catalog isn't populated in the DB until Task 16, so this line
  from the brief's template is deferred. `spikes/export-catalog-sample.ts` is
  written and committed but intentionally **not run**; it will export
  `packages/domain/test/fixtures/catalog-sample.json` once Task 16 lands.

## Decision

- **yahoo_auc: hold.** 1 PCG-Pokémon sale in the last 30 days is far short of
  the ≥20/30d scheduling threshold. Re-check after Task 16 (catalog present,
  so real match rates — not just structural eligibility — can be measured)
  and/or after widening `YAHOO_KEYWORDS` to more PCG-grade tokens (e.g.
  `PCG8`, `PCG7`, `PCGフローレス`, `PCGプリスティン`) or a longer observation
  window; on current numbers this source is not worth scheduling for
  recurring ingest yet.
- **thecardapi: hold, connector kept-but-empty.** Confirmed 0 PCG coverage
  (Task 13). No further measurement needed here — the connector stays wired
  and untouched; if The Card API's feed ever starts surfacing PCG-graded
  sales, the existing `pcg` filter in `spikes/count-coverage.ts`
  (`grader` metadata match or title grade parse) will pick it up
  automatically on the next run, with no code changes required.
