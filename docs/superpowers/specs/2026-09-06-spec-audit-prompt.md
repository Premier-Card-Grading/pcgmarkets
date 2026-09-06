# Ralph prompt — audit the PCG Markets design spec

You are auditing, not implementing. Do not write application code, scaffold packages, or create files outside `docs/`.

## Inputs (read all of them every iteration)

- `docs/superpowers/specs/2026-09-06-pcg-markets-design.md` — the spec under audit
- `docs/research/README.md` and the four reports it links — the evidence the spec must agree with
- `docs/superpowers/specs/2026-09-06-spec-audit.md` — your own findings from previous iterations (create it on the first pass)

## Decisions you must NOT reopen

These were made by the product owner. Audit their *consequences*, never argue the decision:

1. The core metric is sold prices — median per (card, grade). Asking prices never enter the price grid.
2. Sources are eBay + Yahoo Auctions + Yahoo!フリマ, free tiers only, until a POC exists.
3. Pokémon only (JA + EN). English UI only.
4. TCGdex is the catalog spine. The PCG catalog is not cross-referenced. No counterfeit detection.
5. Matching uses structured metadata on eBay and strict set-code + number + grade extraction on Japanese sites. No name matching.
6. Nothing unmatched is discarded — it goes to an admin review queue with human overrides.
7. Ingestion runs as a separate Node worker on GitHub Actions cron; web is Next.js on Vercel; DB is Supabase Postgres.

## What to audit, in order

For each pass, work through every item and record a finding or an explicit "checked — OK" line:

1. **Evidence conflicts.** Every factual claim in the spec (API limits, endpoints, field names, ToS, volumes, grade scale, number formats) must match the research reports. Flag any claim that is stronger than the evidence, or that the research marked *unverified* without the spec saying so.
2. **Internal consistency.** Data model vs. matching vs. pricing vs. UI: does every field the UI needs exist? Does every state the matcher can produce have a row type and a UI treatment? Do the ingestion cadences fit the stated free-tier budgets (do the arithmetic)?
3. **The core screen.** Walk the card page in §10 field by field. For each number shown, trace back to the exact table + column + computation. Anything that cannot be traced is a blocking finding.
4. **Matcher edge cases.** Take the real title samples in the research (English and Japanese) and run each through the §8 rules by hand. Record: expected state, reason. Flag any rule that mis-routes a real title, any pattern in the research the rules don't cover (promo numbers `001/SV-P`, `SV-P` set codes, katakana grade names, `10+`, `PCG-P`, `PCGS`, lots, best-offer, renamed grade names, Chinese "PCG").
5. **Card-number search.** Check §6 handles: leading zeros, spaces, promos without denominators, same number in JA and EN sets, numerator-only input, 9-digit cert vs. a 9-digit card lot number.
6. **Pricing rules.** Check the pooled-10 rule, best-offer exclusion, FX-on-sale-date, confidence thresholds, and window defaults for ambiguity. Could two engineers implement §9 differently? If yes, that's a finding.
7. **Failure modes & ops.** For each connector: what happens on 403, 429, schema change, empty result, partial page? Is the kill switch, idempotency, and `ingest_runs` reporting sufficient to notice and recover? Is anything missing for the admin to *trust* the grid?
8. **Legal / ToS posture.** Does the spec's scraping behaviour match what the research says each site's robots.txt and terms permit? Is anything stored that shouldn't be (images, personal data, seller identity)?
9. **Scope creep & YAGNI.** Anything in the spec not required to render the core screen truthfully or run the admin queue is a candidate for "defer". List candidates; do not remove without marking them as suggestions.
10. **Ambiguity.** Any sentence a reasonable engineer could implement two ways. Quote it, propose the single reading, and apply it if it doesn't touch a protected decision.
11. **Open questions.** Is §14 complete? Add any question the spike must answer that isn't listed.

## How to record

Maintain `docs/superpowers/specs/2026-09-06-spec-audit.md` with:

```
# Spec audit log

## Iteration N — <date>
### Findings
- [BLOCKING|MAJOR|MINOR|SUGGESTION] <id> — <one-line claim> — §<section> — <evidence: file/line or research quote>
  - Fix applied: yes/no — <what changed in the spec>
### Checked OK
- <item> — <one-line reason>
### Still open (needs product owner)
- <id> — <question>
```

Rules:
- Give each finding a stable id (`A-01`, `A-02`…). Never renumber.
- **Fix the spec inline** for BLOCKING/MAJOR/MINOR findings when the fix is unambiguous and does not touch a protected decision. Edit the spec directly; keep its structure and voice; add, don't rewrite.
- Findings that need the product owner go under "Still open" and are not fixed.
- Don't re-report a finding already fixed in a previous iteration. Verify the fix still holds and list it under "Checked OK".
- Do not pad. A section with nothing wrong gets one "Checked OK" line.
- Commit after every iteration: `git add docs && git commit -m "audit: iteration N — <summary>"`.

## Completion

Stop only when a **full pass** (all 11 items) produces **zero new BLOCKING or MAJOR findings** AND every previously applied fix has been re-verified. Then, and only then, output:

`<promise>SPEC AUDIT CLEAN</promise>`

If "Still open" has items, still output the promise — those are for the product owner — but list them in your final message.
