# Competitors, UX Patterns, and Card Catalog Data

*Researched 2026-09-05.*

## Track A — Competitor / analog products

| Product | Graders | PCG? | Search UX | Price presentation | Matching (public info) | Model | API |
|---|---|---|---|---|---|---|---|
| **Collectr** | PSA/BGS/CGC | No | ⌘K text; set browse; scan | Market value per card & grade; portfolio; 5+ yr history (PRO); eBay + TCGplayer side by side | Not published | Freemium; PRO; affiliate | None |
| **TCGplayer** | n/a | No | Set + name + number | Market/Low/Mid/High per printing | n/a | Marketplace | Closed since 2023 |
| **PriceCharting** | PSA/BGS/CGC/SGC/**TAG/ACE** | **No** | Free-text; set → "Name #N" | Columns: Ungraded, 7, 8, 9, 9.5, PSA 10, BGS 10, CGC 10; sales list; 2026 pop-vs-price chart | "monitor every eBay sale… proprietary technology to assign each sale to a card" | Paid API/CSV; affiliate | Yes, paid, 1/s |
| **Card Ladder** | PSA/BGS/SGC/CGC (PSA-affiliated) | No | Player/set | Smoothed CL value; sales list; pop; indices | Human research team vets cards | Pro $15/mo | No |
| **GemRate** | PSA/BGS/SGC/CGC | Unknown | Player/card/set | Population only | Cross-grader matching | Free + reports | Not seen |
| **130point** | Whatever's in title | Incidental | Raw keyword | Flat sold list; reveals Best-Offer accepted | None — user matches | Free/ads | No |
| **Alt** | PSA/BGS/BVG/SGC/CGC | No | Card search | "Alt Value" ML: avg recent txns when dense; comparable anchoring when sparse; **confidence Low→High** | ML comps + expert | Marketplace | No |
| **Market Movers** | PSA/BGS/SGC | No | Card search | Daily avg; 30-day comps slide-out | Automated title matching; **documented failure**: vague titles fall into base-card comps; UX says click through and verify | Sub | No |
| **Ludex** | Scans slabs | No | Photo scan | Value range | Image recognition | Free 200/mo; $19.99 | No |
| **CollX** | Barcode on slabs | Unknown | Photo scan | Avg recent txns | Visual search | Free + Pro | No |
| **Pokédata** | PSA/CGC | No | Set/card | History, volume | — | Free / $8 / $20 | Personal only |
| **PokemonPrice.com** | Raw/PSA 9/PSA 10 | No | Set list (1st Ed / Shadowless / Unlimited as separate sets) | Trending per grade, pop, "grading difficulty" | — | Free + EPN | No |
| **Pokemon Price Tracker** | PSA/CGC/BGS/SGC/**TAG/ACE** incl. half grades | No | tcgPlayerId or set id | **Per grade: median (primary), avg, min/max, "smart market price" + confidence** | Proprietary | $9.99 / $99 / $300 | Yes |
| **PSA APR** | PSA | No | Set → card; cert | Per-grade avg + recent sales; graph | In-house | Free | No |
| **CGC Pop Report** | CGC | No | Game → era → set → card | Population only | n/a | Free | No |
| **TAG DIG** | TAG | No | QR / `tagd.co/CERT#` | Grade, 5 subgrades, pop, rank — no price | n/a | Free | No |

### Public write-ups on matching noisy titles
- Market Movers buying guide: only competitor documenting failure mode + mitigation (show 30-day comp list, link to eBay to verify).
- eBay Research (EMNLP 2011): supervised NER over titles + bootstrapped seed lists + n-gram normalization; 90% precision.
- eBay "Scan to list": image recognition against card catalog → newer listings carry cleaner item specifics.
- Alt Value: ML comps with grade/grader adjustments when sparse.

### UX patterns to match (table stakes)
1. **Per-grade price matrix** on card page. For PCG: `9 Mint · 9.5 Gem Mint · 10 Gem Mint · 10 Pristine · 10 Flawless`, sub-9 collapsed.
2. **Headline number + provenance**: median of last N sold in window; show N and window.
3. **Confidence indicator** — essential for PCG (most cards <5 sales).
4. **Raw sold list under the number** with date, price, marketplace, link — the match-error escape hatch.
5. **Sold vs active split.**
6. **Price × population chart** — native for us since PCG pop is in the API.
7. **Search**: name + number + set; cert lookup; scan slab → price.
8. **Free core + Pro history/alerts**; EPN affiliate links.

### Gaps we can own
- **Nobody prices PCG slabs.** PriceCharting/PPT went to TAG/ACE and stopped.
- **Japanese-first** — PCG volume is Japanese; competitors English-centric.
- **PCG-vs-PSA spread** per card — differentiator no one offers.
- **Label-aware matching** — PCG `finish`/`cardVariant` + cert subgrades disambiguate better than title parsing once a cert is present.

## Track B — Card catalogs / reference data

| Source | Games / langs | Card ID | Set code | Variants | Images & terms | Access | Notes |
|---|---|---|---|---|---|---|---|
| **pokemontcg.io** | Pokémon, **EN only** | `base1-4`, `sv4pt5-6` | own ids + `ptcgoCode` | via tcgplayer price keys | small/large | Key 20k/day; **500/502 today; 41% reliability reported** | V1 data unmaintained since 2021 |
| **TCGdex** (api.tcgdex.net) | Pokémon, 10+ langs incl. **JA (184 sets through 2026 "M" era)**, zh-tw, ko | `SV4a-350` (JA), `sv04.5-006` (EN); `localId` = printed number | **JA ids = printed codes** (`SV4a`, `S12a`, `M2a`, `M-P`) | `variants{normal,reverse,holo,firstEdition,wPromo}` + `variants_detailed[]` with per-variant TCGplayer productId | `assets.tcgdex.net/{lang}/{serie}/{set}/{localId}/high.webp` | Free, no key, "be considerate"; open-source MIT | Community; saw `cardCount.total=320` vs 360 listed for SV4a |
| **pokemon-card.com** (official JP) | JP | internal numeric | in image path | printed number, regulation mark | © Pokémon | SSR GET form; no robots.txt | Scrapeable; ToS risk |
| **Limitless TCG** | Pokémon EN+JP; One Piece | `/cards/jp/SV4a/350`; OP `OP05-119?v=2` | printed JP codes | OP parallels `?v=1/2`, `_p1/_p2` | Own CDN | HTML only | Excellent cross-ref |
| **TCG Collector** | Pokémon EN+JP+CN | slug `growlithe-…-078-076` | set names | rarity icons | Own | 403 to bots | Variant vocab |
| **One Piece official** (Bandai cardlist) | EN/JP/zh/ko | `OP17-061`; **parallels `_p1`, `_p2`, `_p3`** | `OP17`, `EB04`, `PRB02`, `ST28` | rarity `L/SR/R/UC/C/SEC/SP CARD`; "Illustration Type: Comic/Animation/Original" (= manga art) | © Bandai | SSR; scrapeable | |
| **OPTCG API** / **API TCG** (apitcg.com) | OP EN / 8 games | mirrors `_p1` | | | Re-hosted | Free/key | Hobby maturity |
| **Scryfall** | MTG all langs incl. `ja` | UUID per printing; `oracle_id`; `collector_number`; `lang` | 3–5 letter | `finishes[]`, `promo_types[]`, `frame_effects[]`, `full_art`, `variation_of` | Fan Content Policy: free, no paywalling, 50–100ms between requests | Free, bulk files | Gold standard |
| **YGOPRODeck** | YGO (no ja) | numeric + `card_sets[]{set_code "MRD-EN098", set_rarity}` | prefix | rarity per set | **Must re-host** images | 20 req/s | Set code + rarity = print identity |
| **Lorcast** | Lorcana | `crd_…`; `collector_number`; `rarity` incl. Enchanted | numeric | foil via price; Enchanted = own number (205/204) | Ravensburger Community Code | ~10 rps | |
| **DBS Fusion World official** | EN/JP/zh/th | `FB11-001`; `_p1`, `_f` | `FB01–FB11`, `FS`, `ST` | rarity | © Bandai | SSR | |
| **Weiss Schwarz official** | EN & JP | `SAO/S20-001` | embedded | RR/SR/SP/SSP/SEC | © Bushiroad | SSR | |
| **Union Arena official** | EN/JP | `UA01BT/CGH-1-001` | `UA01BT` | parallel flag | © Bandai | JS-heavy | |
| **Sports** | Beckett / Sportscardspro | year + brand + # + player + parallel + serial | brand-year | dozens of parallels | none open | paid | **Defer** (<1% PCG volume) |

### Recommended primary catalog per game

| Game | Primary | Why | Fallback |
|---|---|---|---|
| Pokémon (JP + EN) | **TCGdex** | Only free API with real JA coverage; JA set ids = printed codes; per-variant productId; images | PCG `v2/catalog/products` for set-name→code; Limitless/TCG Collector QA |
| One Piece | **Bandai cardlist scrape** (EN+JP) with `_pN` | Authoritative; parallels modelled | apitcg; Limitless `?v=` |
| MTG | **Scryfall** | | — |
| Yu-Gi-Oh | **YGOPRODeck** | | no JA |
| Lorcana | **Lorcast** | | lorcana-api.com |
| DBS FW / Weiss / Union Arena / FaB / Riftbound / Sorcery | Official cardlists | No APIs | PCG catalog as seed (FaB 43k graded — dedicated source later) |
| Sports | **Defer**; PCG catalog rows as-is | | |

**Cheap head start:** PCG's `v2/catalog/products` is a **293k-row master list keyed exactly the way PCG labels slabs** (setName, cardNumber, language, rarity, finish). Ingest as spine; *link* to external catalog ids rather than building spine from external catalogs.

### Canonical identity key

```
product_key = game
            | set_ref          # canonical set id (TCGdex "SV4a"; Scryfall set; OP "OP05"; YGO "LOB")
            | collector_number # normalized (strip leading zeros to compare; keep printed form; keep denominator "214/190" and suffixes "A-1", "★", "TG01")
            | variant_code     # controlled enum
            | language         # ISO 639-1 — mandatory; same number differs by language in PCG data
slab_key    = product_key | grader="PCG" | grade_value (0–10 step 0.5; 0=Authentic) | grade_label (Flawless|Pristine|Gem Mint|Mint|…)
optional:     subgrades{centering,corners,edges,surface}, cert_id, label_type, autograph
```

**Variant taxonomy** (`variant_code` + free `variant_note`):
- Print run/era: `first_edition`, `unlimited`, `shadowless`, `promo`, `prerelease`, `error`
- Finish: `non_holo`, `holo`, `reverse_holo`, `pattern_reverse_holo:{pokeball|masterball|energy}`, `foil`, `etched`, `cosmos`, `textured`
- Art/frame: `alternate_art`, `full_art`, `special_art_rare`, `borderless`, `extended_art`, `showcase`, `manga_art`, `parallel:{p1|p2|p3}`, `sp_card`
- Other: `signature`, `serial_numbered:/N`, `overnumbered`, `alter`

**Rule:** when publisher assigns a distinct collector number (Pokémon SAR 350/190, Lorcana Enchanted 205/204), the variant lives in `collector_number` and `variant_code=base`; when publisher reuses the number (OP `_p1`, MTG foil, Pokémon reverse holo, 1st ed stamp), it lives in `variant_code`. Keep both.

### Matching implications
- JP Pokémon titles almost always carry set code + `NNN/NNN` → near-unique into TCGdex. EN titles carry set *name* + `N/NNN` → need set-name alias table (PCG names, TCGplayer group names, ptcgo codes, TCGdex names).
- One Piece `OP05-119` reliable; "parallel/alt art/manga" → `_p1/_p2`; "SP" → SP CARD.
- MTG: collector number + set + lang + foil → Scryfall.
- **Cert number present → skip title parsing; resolve via `v1/gradings?gradedId=`.** Prioritise extracting 9-digit certs from titles/descriptions/photos.
- "PCG 10" maps to three labels; when absent, price against pooled "10 (any)" and show split when cert-resolved.

**Images:** Scryfall (Fan Content Policy), TCGdex (no explicit licence), Lorcast (Community Code), YGOPRODeck (re-host), PCG's own product images (terms unstated — ask PCG). All publisher-copyrighted; "fan content / not affiliated" footer + no paywalling of catalog data is the norm.

**Uncertainties:** PCG API undocumented; TCGdex JA completeness community-dependent; pokemontcg.io unreliable now; GemRate/Beckett unverifiable (bot walls); no TCGplayer graded price product found.
