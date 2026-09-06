# PCG Markets — Research

Research conducted 2026-09-05 as input to the product spec.

| File | Covers |
|---|---|
| [pcg-company](2026-09-05-pcg-company.md) | PCG the company: scale, cert system, public API, pop report, label, volume by game/language |
| [western-marketplaces](2026-09-05-western-marketplaces.md) | eBay APIs & ToS, The Card API, Mercari US, Whatnot, other Western venues, scraping legality |
| [japan-asia-marketplaces](2026-09-05-japan-asia-marketplaces.md) | Yahoo Auctions/フリマ, Mercari JP, aucfan, PCG partner shops, Bunjang (KR), JP legal posture |
| [competitors-and-catalogs](2026-09-05-competitors-and-catalogs.md) | Competitor UX patterns, card catalog APIs per game, canonical identity key, variant taxonomy |

## Headline findings

1. **No one prices PCG slabs.** PriceCharting/Pokemon Price Tracker stop at TAG/ACE; Alt/Card Ladder/Collectr stop at big four. Japanese aggregators are PSA-only.
2. **PCG's volume is Japanese-first.** 569/600 newest gradings are Japanese-language. Top set is JP "MEGA Dream ex" (22k). Pokémon 141k, FaB 44k, One Piece 32k, MTG 13k.
3. **PCG runs a public JSON API** (`app.premiercardgrading.com/public/api`) with cert lookup, 293k-product catalog, and per-card pop counts. Undocumented — as a PCG partner we should get this sanctioned/formalised.
4. **eBay has "Premier Card Grading (PCG)" as an official grader value** (ID 2750118, category 183454 only). ~2k active listings. Browse API gives asking prices; **sold data is closed** (Marketplace Insights restricted; Finding API dead). Sold via The Card API (trial), Mercari US, or vendor scrape.
5. **Japan sold data:** Yahoo Auctions closedsearch + Yahoo!フリマ `?sold=1` are SSR and carry the most PCG. aucfan is the only licensed aggregate (contract). Mercari JP has the most hostile ToS.
6. **PCG grade scale needs `(value, label)` as key:** three distinct 10s (Flawless/Pristine/Gem Mint), and "Gem Mint" spans 9.5 and 10. Names were renamed once — old labels exist in the wild.
7. **"PCG" is ambiguous:** also a 2004–06 Pokémon set code (`/PCG-P`), PCGS coins, a different "Pokemon Card Grading" company, and Chinese-market listings. Disambiguation layer is a first-class component.
8. **Catalog spine:** use PCG's own 293k product catalog as the spine, link out to TCGdex (Pokémon JA/EN), Bandai (One Piece), Scryfall (MTG), etc.
