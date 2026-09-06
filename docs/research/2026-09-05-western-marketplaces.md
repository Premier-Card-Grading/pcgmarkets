# Western / English-language Data Sources (eBay-first)

*Researched 2026-09-05. eBay HTML returned 403 to every non-browser client; developer docs readable via `www.developer.ebay.com`. Items marked **unverified** rest on secondary sources.*

## 0. Two findings that reshape the plan

1. **PCG is an enumerated grader in eBay's condition-descriptor vocabulary.** MIP table: `Professional Grader (27501)` value **"Premier Card Grading (PCG)" = ID 2750118**, enabled **only in category 183454 (CCG Individual Cards)**, not Sports (261328) or Non-Sport (183050). Grade values are numeric IDs (10 = 275020 … 1 = 2750218, Authentic = 2750219); Certification Number (27503) is free text ≤30 chars. ~2,056–2,070 active PCG listings in Pokémon TCG node vs ~637k PSA. Source: https://www.developer.ebay.com/api-docs/user-guides/static/mip-user-guide/mip-enum-condition-descriptor-ids-for-trading-cards.html
2. **PCG public JSON API** at `https://app.premiercardgrading.com/public/api/` — see pcg-company report.

## 1. Master table

| Source | Data type | Access | Auth / approval | Rate limits | Cost | PCG coverage | Risk | Recommendation |
|---|---|---|---|---|---|---|---|---|
| **eBay Browse API** | Active listings | REST `item_summary/search`, `getItem`; `aspect_filter` on conditionDescriptors | OAuth client-credentials; free dev account. Docs say production Buy APIs "intended for eBay partners… apply through EPN"; in practice search/getItem work with a production keyset | **5,000 calls/day** default; raise via free Application Growth Check | Free | **Yes** — `conditionIds:{2750}` + grader aspect (syntax finicky, see §2) | API License Agreement restricts caching/redistribution; "Restricted APIs" clause says pricing tools need written consent (unverified whether Browse qualifies) | **Primary for asking prices.** Snapshot daily; delisting = weak sold proxy |
| **eBay Marketplace Insights API** | Sold, last 90 days | REST `item_sales/search` | "**restricted and not open to new users at this time**" (official, fetched 2026-09-05) | — | Free if approved | Ideal | 2025 forum reports of denials | Apply anyway; **plan as if rejected** |
| **eBay Finding API `findCompletedItems`** | Sold | Legacy | — | — | — | — | **Decommissioned 2025-02-04** | Dead |
| **eBay Feed API** | Bulk active snapshots | File download | Limited Release; EPN + business-case review | 75k/day | Free if approved | Active only | Partner-grade approval | Not near-term; no sold data |
| **Terapeak / Seller Hub Research** | Sold, 3-yr, true Best-Offer prices | Dashboard only | Seller account | — | Free | Keyword | No API; scraping = logged-in scraping | Manual QA only |
| **eBay Partner Network (EPN)** | Affiliate tracking; `itemAffiliateWebUrl` via `X-EBAY-C-ENDUSERCTX affiliateCampaignId` | EPN approval | — | Free; earns commission | No sold data | Prerequisite for Buy API production application | Join; monetise clicks |
| **eBay Developer Program** | — | Register | Reviewed ≥1 BD; **2025–26 auto-rejections reported** with no appeal | 5k/day free tier | Free | — | Rejection risk real | Register early with clear business description |
| **130point.com** | Sold (eBay incl. Best-Offer accepted, Fanatics, Goldin, MySlabs, Heritage) | Web only | None | — | Free | Keyword only | Site 403s fetchers | Manual comps only |
| **The Card API (thecardapi.com)** | **Sold, item-level** — eBay from 2026-06-06 + Goldin, Lelands, SCP, Hake's, REA, TCGplayer | Self-serve REST, webhooks, CSV, MCP | Instant key | Free 5k records/day 3-day lookback → Pro $199 200k/day 90-day | Free / $9 / $49 / $199 /mo | **Likely via title search** `q=(pcg,"premier card grading")&graded=true`; grader normalization PSA/BGS/SGC/CGC only — **unverified for PCG** | New vendor; legal basis unstated; ~3 months eBay history | **Best self-serve sold-data candidate — trial free tier** |
| **SoldComps (sold-comps.com)** | Sold eBay, live, ≤40 items/req, ~90-day | Single GET | Instant key | 60 req/min | Free 100/mo; $9/2k; $29/10k; $79/50k | Keyword only | Real-time eBay scrape; no Best-Offer handling | Cheap backup |
| **PriceCharting / SportsCardsPro** | Computed values | REST + CSV | Token | 1/s | $49/mo | **No** (PSA/BGS/CGC/SGC/TAG/ACE) | Official | Raw-card baseline only |
| **Card Ladder** | Sold (100M+) | No public API | Pro sub $20/mo | — | — | **No** | ToS bans scraping | Reference |
| **Market Movers** | Sold comps | App only | Sub | — | $9.99–49.99 | **No** | — | Skip |
| **GemRate** | Population | Partner API | Contact-gated | — | — | **No** | — | Use PCG's own pop API |
| **Alt** | Sold comps | App | — | — | Free | **No** (PSA/BGS/BVG/SGC/CGC) | — | Skip |
| **Collectr** | Daily computed values | Official REST | Key + terms | — | Credit-priced | PSA/BGS/CGC/TAG/ACE/AGS; **no PCG** | No redistribution | Skip |
| **WorthPoint** | Sold archive | Web | Paid | — | $30–60/mo | Incidental | ToS: no commercial use, no scraping | Do not use |
| **TCGplayer API** | Raw prices | REST | "**no longer granting new API access**" | — | — | No | — | Not obtainable |
| **Scraping eBay directly** | Sold (`LH_Sold=1`) + active | Residential proxies + TLS impersonation, or vendors (Apify $2.50–5/1k; SerpApi `show_only=Sold` $25–725/mo; Bright Data $1.50/1k; Zyte/Scrapfly/ScraperAPI $1.50–5/1k) | None | eBay 403s datacenter IPs incl. Apify's (June 2026); `/splashui/challenge` | see left | Yes (title) | robots.txt `Disallow: /sch/`; Feb 2026 UA bans scrapers, Utah law + NAM arbitration; CFAA risk low for logged-out (Van Buren, hiQ, Meta v. Bright Data) but contract/trespass exposure (eBay v. Bidder's Edge). **Best-Offer sales show asking price, not accepted.** Sold search from datacenter IP **302'd to sign-in** | Vendor only, logged-out, low volume, fallback |
| **Whatnot** | Active asks public; `lastSalePrice` via web GraphQL; Seller API (OAuth `read:orders`) own orders only | Seller API "not accepting new applicants"; else Apify (~$1/1k) | Closed | ≤10 req/s | Pay-per-result | **Yes** — live PCG listings ("Pikachu EX 033/106 PCG GEM MINT 10") | Cloudflare; ToS unreadable | Tier-1 for asks; apply for Seller API when reopened |
| **Mercari US** | **Active + sold public** (`status=sold_out`) | Internal GraphQL; Apify ($1.50–2.50/1k, US residential proxy) | None | Cloudflare | Apify | **Yes** — "PCG Pristine 10 Mega Gengar ex Promo" $88 | ToS no explicit anti-scraping clause (only "excessive burden"); business stable (FY2026 profitable) | **Tier-1 sold-comp source** |
| **MySlabs** | Active + public Sold Archive | Public | None | — | Free | **No** (PSA/BGS/BVG/SGC/CSG/CGC/CBCS) | — | Cheap connector; zero PCG until policy changes |
| **Fanatics Collect** | Marketplace; Sales History login-walled | No API | Account | — | — | **No** | Login-walled | Skip |
| **Goldin** | Realized prices | No API | — | — | — | **No** | UA **explicitly bans** scrapers | Do not scrape |
| **Heritage** | Prices-realized | Members-only | Account | CAPTCHA | — | None | Login-walled | Skip |
| **StockX** | Last sale | Seller/Catalog APIs | Approval | — | — | **No** (PSA/BGS only) | — | Skip |
| **COMC** | Quarterly counts | Login + paid | — | — | $10/100 pts | Unlikely | — | Skip |
| **Facebook Marketplace / IG / Discord** | Unstructured | No read API | — | — | — | Anecdotal | Meta litigates scrapers | Manual submission only |

## 2. Key findings

### eBay APIs (Sept 2026)
- **Browse API.** OAuth client-credentials (`https://api.ebay.com/oauth/api_scope`). 5,000 calls/day per app. Filters: `conditionIds:{2750}` (Graded; 4000 = Ungraded), `price`, `buyingOptions:{FIXED_PRICE|AUCTION|BEST_OFFER}`, `itemLocationCountry`, `sellers`. `aspect_filter` requires `categoryId` in both `category_ids` and the filter string; `fieldgroups=ASPECT_REFINEMENTS` returns `aspectDistributions` to discover exact grader value string. Item response carries `conditionDescriptors[]` (Professional Grader, Grade, Certification Number). A 2023 thread trying `conditionDescriptors.name:Professional Grader,…` hit error 12017 unresolved — **verify filter syntax in API Explorer**; fallback `q=PCG&category_ids=183454&filter=conditionIds:{2750}` then post-filter. Community reports 10,000-result cap per query.
- **Production caveat.** Buy APIs Requirements page: production "intended for eBay partners only… apply through EPN… no guarantee." Many hobby devs use Browse in production with plain keyset; enforcement unstated.
- **Marketplace Insights:** "restricted and not open to new users." Docs behind login.
- **Finding API:** decommissioned 2025-02-04.
- **API License Agreement "Restricted APIs":** no selling/sharing data, no bulk redistribution, pricing tools require written consent. Read before shipping a "price guide" on Browse data. https://developer.ebay.com/join/api-license-agreement

### How sellers title PCG on eBay
- Dominant token **`PCG <grade>`** (`PCG 10`, `PCG 9.5`, `Pcg 9.5`), often with tier word (`GEM MINT`, `PRISTINE`), sometimes `10+` = Pristine. "Premier Card Grading" spelled out: **zero** captured titles. **No cert numbers in titles.** Disclaimers common: `(NOT PSA)`, `(same as PSA)`.
- Category 183454. Asking $10–$489.
- eBay Grade aspect is numeric only → **Flawless/Pristine/Gem Mint 10 indistinguishable in item specifics** — use title parsing or cert lookup.
- **Disambiguation hazards:** "PCG" = Japanese Pokémon set-code prefix (`075/PCG-P`); substring of "PCGS" (coins); a different company "Pokemon Card Grading" (pokemoncardgrading.net); Chinese-language listings "PCG 10 (same as PSA 10)" alongside "CSV9.5" — probably a different grader (Premier's Pokémon catalog has no Chinese cards).

### Scraping eBay
Technically fragile; our probes 403'd on all HTML, 302→sign-in on LH_Sold. Legally: low CFAA risk logged-out, but express robots.txt prohibition + UA + Bidder's Edge precedent. Worst case for small aggregator: C&D + blocks. Data trap: Best-Offer sales show struck-through asking price.

## 3. Recommended strategy

**Primary (build now)**
1. **eBay Browse API for asking prices.** Register dev + EPN accounts immediately. `category_ids=183454`, `filter=conditionIds:{2750}`, `q=PCG` + `fieldgroups=ASPECT_REFINEMENTS`; keep title-regex path for "Other" grader. Daily snapshot (~2k listings fits 5k budget). Attach `affiliateCampaignId`. Delisting + `buyingOptions` = weak sold signal.
2. **PCG cert/pop API as canonical key.**
3. **Sold via The Card API** — trial free tier; verify PCG normalization and Best-Offer flagging. $49–199/mo.
4. **Mercari US sold comps** via polite scraper / Apify with US residential proxies.

**Fallbacks:** SoldComps; vendor eBay sold scrape (logged-out, low volume, flag Best-Offer as "≤ listed"); Whatnot asks + `lastSalePrice` low volume.

**Long shots:** Marketplace Insights application; Buy API production via EPN.

**Do not:** scrape Goldin, Collectors.com, WorthPoint, Heritage, COMC, Fanatics Sales History, or anything logged-in on eBay.

## 4. Open / unverified
- Exact Browse `aspect_filter` syntax for condition descriptors.
- Whether eBay enforces EPN/partner approval on read-only Browse; whether Browse is a "Restricted API" for pricing tools.
- Whether LH_Sold → sign-in redirect applies to real browsers.
- The Card API's PCG normalization + legal basis.
- Whatnot ToS; any real PCG sold prices (none retrievable this session).
