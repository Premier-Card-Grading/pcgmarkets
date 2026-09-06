# Premier Card Grading (PCG) — Company, Scale, Cert System, Pop Report

*Researched 2026-09-05. "Verified" = fetched directly from source; "snippet" = seen only in search summary; "unverified" = could not confirm.*

## 1. Company basics

**Official sites (verified live):**
- US: https://premiercardgrading.com (Shopify) — footer: "Company Registered in New Zealand"
- NZ: https://premiercardgrading.co.nz · AU: https://premiercardgrading.com.au · UK: https://premiercardgrading.co.uk · JP: https://premiercardgrading.jp · MY: https://premiercardgrading.com.my · DE: https://premiercardgrading.de · EU: https://premiercardgrading.eu (password-walled, "Opening Soon") · PH: premiercardgrading.com.ph (connection refused)
- Pop report / cert lookup: https://pcgpopreport.com
- Backend API host (undocumented): https://app.premiercardgrading.com

**HQ:** 8a Target Court, Wairau Valley, Auckland 0627, New Zealand. NZ reg. no. 8176784. Cloudflare edge for API resolves to AKL.

**Founding:** Not stated officially. Triangulates to mid-2021 (earliest `cardInfo.createOn` 2021-06-16; first Wayback capture 2021-11-15; ChannelFireball partnership 2021-12-06). Cert #000000001 is a Hidden Fates Charizard GX SV49/SV94, Flawless 10.

**Ownership (third-party, unverified on official site):** Rudy of *Alpha Investments* acquired 69% in Sept 2023; US ops reportedly moved to Florida.

**Regional entities:**
- Germany: Premier Card Grading Germany GmbH, Aachen; HRB 26959; DGuSV-certified since 2023.
- Malaysia/SEA: "PCG South East Asia by Invictus Forge", IOI Mall Damansara, Petaling Jaya.
- **Japan: PCG Japan, 2F, 3-8-16 Nipponbashi, Naniwa-ku, Osaka 556-0005.** X: @PCGJapan01. **200+ retailer drop-off partners** (list dated 2026-08-28): 駿河屋 (Suruga-ya), ふるいち, 古本市場, カードボックス; online: Card Rush, Full Comp, Card Lab, Gamers. Turnaround 14 business days.
- Singapore: middleman shop Fyendal Hobby.

**Volume (verified from live API, 2026-09-05):** 278,662 graded records in public pop report; highest cert 000343136. Per-game: Pokémon 140,776; FaB 43,571; One Piece 32,487; MTG 13,026; Sorcery 9,146; DBS 2,935; YGO 2,511; Riftbound 1,435; Weiss 1,409; DBS Fusion World 1,349; Lorcana 995. **Biggest single set: Japanese Pokémon "MEGA: MEGA Dream ex" — 22,285 graded.** Of the newest 600 gradings, 569 are Japanese-language. Japanese-language Pokémon sets ≈ 83k vs English 50k.

**Partnerships:** ChannelFireball (2021; CFB later acquired by TCGplayer — explains `binderpos` image hosts); Japan retailer network; Middleman Programme + Ambassadors. **No Whatnot partnership** (Whatnot's grader partner is PSA).

**Pricing / turnaround:**

| Region | Bulk | Standard | Express | Other |
|---|---|---|---|---|
| US | $14.95, 40–60 BD | $19.95, 20–30 BD, subgrades + metal label | $49.95, 7–10 BD | Authentication $12.95 |
| NZ | NZ$25 | NZ$35 | NZ$50 | Same Day NZ$60 |
| AU | A$25 | A$35 | A$60 | Same Day A$80; Reslab A$15 |
| JP | ¥2,500, 6–8 wk | ¥3,500, 1–2 wk | ¥5,000, ~124 h | Authentication ¥2,200–2,500 |
| MY | RM80 | RM90 | RM150 | Same Day RM180 |
| DE | — | €19.95–25.25 | €40–51.75 | Pregrading €8.50–8.95 |

**Pregrading tier (launched ~2026-05-15):** three result bands (9.5+, 8–9, ≤7), no subgrades, **no cert ID**, "Void Sticker" seal. **Must never be ingested as slabs.**

**Controversies:** 2023 conflict-of-interest debate (content creator owning a grader); figoca notes low mainstream acceptance, "at least one scam allegation thread (unverified)".

## 2. Grading scale (verified: US Grading Standards, FAQ, API `v2/gradeNames`)

| # | Name | Label finish | Rule |
|---|---|---|---|
| 10 | **Flawless** ("Quad 10") | 24K gold-coated | all four subgrades 10, 50/50 centering; "<1% of cards" |
| 10 | **Pristine** | mirror gold | minor imperfection in **one** subgrade (e.g. 10/10/10/9.5) |
| 10 | **Gem Mint** | gold | minor imperfections in **two** subgrades; centering 50/50–55/45 |
| 9.5 | Gem Mint | gold | |
| 9 | Mint | silver | |
| 8.5 | NM-Mint+ | silver | |
| 8 | NM-Mint | silver | 60/40–65/35 |
| 7.5 | Near Mint+ | silver | |
| 7 | Near Mint | silver | 65/35–70/30 |
| 6 | Excellent | silver | |
| 5 Good · 4 Fair · 3 Worn · 2 Poor · 1 Damaged | | silver | |
| — | **Authentication** | silver, no grade | |

- Half grades exist only at 9.5, 8.5, 7.5. Three 10-tiers are distinguished by *name*, not number. Flawless = PCG's black-label equivalent.
- **Subgrades: Centering, Corners, Edges, Surface** (Standard tier). Overall grade limited to one level above lowest subgrade.
- **Scale was renamed** (API `previousGradeName`): Gold Pristine→Flawless, EX-NM 6→Excellent, Excellent 5→Good, Very Good 4→Fair, Good 3→Worn, Fair 2→Poor, Poor 1→Damaged. DE site still shows old names. Expect old-name labels in the wild.
- Special label designations: Special Event, Worlds Label, Authentication, Error, Signatures, Altered, Damaged, Counterfeit.
- JP katakana names: フローレス / プリスティン / ジェムミント / ミント / NM-Mint+ / ニアミント+ / ニアミント / エクセレント … ダメージド.

**Critical gotcha:** API `grade` string "Gem Mint" is used for both 10.0 and 9.5. Always key on `finalGrade` (numeric) + `grade` (name) together.

**Overall grade distribution (all 278,662, 2026-09-05):** Flawless 2,593 (0.9%) · Pristine 25,610 (9.2%) · Gem Mint 10 ≈44,021 (15.8%) · 9.5 110,409 (39.6%) · 9 63,009 (22.6%) · 8.5 10,559 · 8 4,296 · 7.5 1,095 · 7 2,324 · 6 2,000 · 5 897 · 4 560 · 3 269 · 2 185 · 1 147. **≈26% carry a "10"; ≈65% are 9.5+.**

## 3. Cert / serial system (verified by direct API calls)

- **Format:** `gradedId`, 9-digit zero-padded decimal, sequential (`000009973`, `000343136`). Starts at `000000001`. API also accepts unpadded form. Gaps exist (~81% density — cancelled/auth-only/unpublished).
- **Lookup page:** `https://pcgpopreport.com/report/{gradedId}`. Create-React-App SPA, no SSR, no captcha. Calls a **public JSON API**:

| Endpoint (base `https://app.premiercardgrading.com/public/api`) | Purpose |
|---|---|
| `GET /v1/gradings?gradedId={id}` | **cert lookup** |
| `GET /v1/gradings?offset=&limit=&gameCode=&setName=&cardNumber='{n}'&finalGrade=` | filtered listing (limit cap 200) |
| `GET /v2/catalog/gradings/search?limit=&offset=&grade=&finalGrade=&gameCode=&cardName=` | search with `pagination.total` |
| `GET /v2/gradeNames` | grade names incl. `previousGradeName` |
| `GET /v2/catalog/games` | 64 games + `cardsGraded` + languages |
| `GET /v2/catalog/sets?gameId=&limit=&offset=` | 7,760 sets + `cardsGraded`, `productCount`, `language`, `tcgPlayerId` |
| `GET /v2/catalog/products?setId=` | **293,088 products**: `cardNumber, rarity, language, finish, imageUrl, tcgPlayerId` |
| `GET /v1/gameInfo?includeCounts=true` · `/v1/gameInfo/{gameCode}/set/{setName}?includeCounts=true` | per-card `finalGradeCounts` |

- **Openness:** no auth, no key; CORS reflects any Origin (GET); no rate limiting observed in 15 rapid requests; `cache-control: no-store`. Swagger at `/swagger-ui.html` → 401. **Undocumented — treat as subject to change.** `game` field inconsistent across eras (`"pkm"` vs `"Pokémon"`); `gameCode` filter undercounts older records — use `/v2/catalog/*` for counts.

**Cert record fields:** `gradedId, game, setName, cardName, cardNumber, finish, finalGrade, grade, centeringGrade, cornersGrade, edgesGrade, surfaceGrade, completed, stageKey, files[] (empty — no slab photos), notes[]`, plus `cardInfo{ title, rarity, number, image, reverseImage, finish, language, releaseDate, setName, tcgPlayerId, externalSource, sports }`. **Not returned:** grading date (`completedOn` null), submitter, label variant.

**Raw sample — cert 000009973:**
```json
{"gradedId":"000009973","game":"Pokémon","setName":"S&S: Darkness Ablaze","cardName":"Mew V (69/189)","cardNumber":"69/189","finish":"Holo",
 "finalGrade":9.5,"grade":"Gem Mint","centeringGrade":9.0,"cornersGrade":9.5,"edgesGrade":9.5,"surfaceGrade":9.5,
 "completed":true,"stageKey":"DONE","files":[],
 "cardInfo":{"id":10762,"gameCode":"pkm","title":"Mew V","rarity":"Ultra Rare","number":"69/189",
   "image":"https://images.binderpos.com/0206eeb3-28a1-4308-ba02-4e17735f87c9.png","finish":"Holo","language":"English",
   "releaseDate":"8/14/2020","setName":"S&S: Darkness Ablaze","tcgPlayerId":219443,"externalSource":"TCGPLAYER","sports":false}}
```
Other samples: `000000001` Charizard GX SV49/SV94 Flawless (10/10/10/10); `000343136` One Piece Koby PRB02-001 Parallel (Japanese) Pristine 10 (10/10/10/9.5); `000343117` Cavendish EB01-012 Gem Mint 10 (9.5/10/9.5/10).

**PCG `finish` vocabulary:** `Parallel`, `Alternate Art`, `Full Art`, `Holo`, `Non-Holo`, `Non Holo, Reverse Holo`, `Energy Reverse Holo`, `Poke Ball Reverse Holo`, `Foil`, `Non Foil`, `Borderless Non-Foil`, `Alternate Art Signature`, `Base`; separate `cardVariant` for oddities (`Overnumbered`, `Alter by …`). Sports finishes include Autograph/Memorabilia/Serialized.

**Card number shapes:** Pokémon `999/999` (JP zero-padded `001/193`; EN `4/102`, `19/189`), One Piece `AA99-999`, promos `AA999`/`999`.

## 4. Population report

- Routes `/:gameCode`, `/:gameCode/:setName`, `/:gameCode/:setName/:number`, `/:gameCode/:setName/:number/:finalGrade`, `/report/:gradedId`.
- Per game → set → card, `finalGradeCounts: [{grade:"9.0",count:15},…]`. Not downloadable; fully paginated via API (limit=200).

## 5. Label format

- Laser-engraved, double-sided metal label. Front: grade + subgrades. **Back: card data + QR code "that leads directly to the entry in the Pop Report"** (likely `pcgpopreport.com/report/{gradedId}` — exact URL unverified).
- Colors: silver ≤9; gold 9.5 & Gem Mint 10; mirror gold Pristine; 24K gold-coated Flawless; silver/no grade for Authentication.
- Slab: PMMA, ultrasonic-welded; standard 63×88 mm and Japanese 59×86 mm. "Player's Slab" variant with NFC sticker.
- Exact printed text fields, old-vs-new label designs, Japanese-language labels: unverified — needs photo review.

## 6. Where PCG slabs trade / third-party coverage

- **eBay:** "Premier Card Grading (PCG)" is a Professional Grader value — ~2,070 listings (~1,533 Pokémon, ~197 One Piece).
- **Whatnot:** no partnership, but live PCG listings found.
- **Mercari US:** PCG slabs present, sold prices public.
- **Japan:** Yahoo!フリマ, Yahoo Auctions, Mercari JP, Card Lab, Full Comp (see japan-asia report).
- **Korea:** Bunjang has 64+ PCG hits.
- **Price trackers:** PriceCharting — no PCG column (has TAG/ACE). GemRate, Card Ladder, Collectr, Alt, Market Movers — none. **No third-party tracker covers PCG.**

## 7. Community perception & relative pricing

- No direct PCG-10-vs-PSA-10 price data retrievable this session.
- Qualitative: "lower liquidity alternative… buyers anchor to PSA/BGS/SGC"; slab quality praised; JP collector blog notes PCG "doesn't inflate price like PSA". Strongest acceptance in NZ/AU. eBay Authenticity Guarantee excludes PCG.
- Inferred tiering for display: Flawless ≈ BGS Black Label / CGC Pristine; Pristine ≈ PSA 10-ish; Gem Mint 10 ≈ CGC/BGS 9.5–10. Show three 10-tiers separately; never collapse.

## 8. Categories graded (64 games)

Pokémon (EN/FR/JP) · Flesh and Blood · One Piece (EN/JP/CN) · MTG · Sorcery · DBS · Yu-Gi-Oh! · Riftbound · Weiss Schwarz · DBS Fusion World · Lorcana · MetaZoo · Sports (Basketball 550, Rugby 248, Soccer 231, Football 106, Baseball 87, …) · Star Wars Unlimited, Grand Archive, Digimon, Hololive, Final Fantasy, Duel Masters, Union Arena, Naruto Kayou, Cardfight, Marvel, NZ Mint coins, Gundam, Love Live, Godzilla.

## Summary

| Facts we can build on (verified) | Unknowns to verify |
|---|---|
| Cert = 9-digit zero-padded sequential `gradedId`; lookup `pcgpopreport.com/report/{id}` | Exact URL encoded in label QR |
| Public JSON API at `app.premiercardgrading.com/public/api` (no auth, CORS open, undocumented) | API stability / whether PCG wants us on a sanctioned feed |
| Cert returns name, set, number, finish, language, releaseDate, final + 4 subgrades, image, tcgPlayerId | Grading date (null), slab photos (empty), label variant |
| 15-step scale; 4 subgrades; rename history in API | Date of scale rename |
| `grade`="Gem Mint" covers 10.0 and 9.5 — key on `finalGrade` + `grade` | — |
| 293k-product catalog keyed exactly as PCG labels slabs | Reslab behaviour (same cert? new?) |
| Pregrading has no cert — exclude | PCG 10 vs PSA/CGC/TAG 10 price ratios |
