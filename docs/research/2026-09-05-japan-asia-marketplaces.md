# Japan / Asia Data Sources

*Researched 2026-09-05. ~60 searches + ~70 direct fetches. Sites returning 403 to non-browser fetchers are flagged — itself an anti-bot signal.*

## Source table

| Source | Region | Data type | Access | Auth | Cost | PCG coverage (observed) | Feasibility (1-5) | Notes |
|---|---|---|---|---|---|---|---|---|
| **Yahoo! Auctions closedsearch** (`auctions.yahoo.co.jp/closedsearch/closedsearch?p=…`) | JP | **Sold** (落札価格, end date, bids), 180-day window | HTML scrape (SSR; no login/CAPTCHA) | None | Free DIY; Apify actor $0.50/1k | **Yes** — 38 sold hits for `PCG鑑定品` in 180 days | **4** | Official API shut down 2020. robots.txt explicitly `Allow: /closedsearch/closedsearch` but disallows parameterised variants. LY 共通利用規約 Art.14/15 restrict reuse/bots. |
| **Yahoo! Auctions active** | JP | Asking | HTML (SSR) | None | Free | Yes — 9 active | 4 | |
| **Yahoo!フリマ (旧PayPayフリマ)** (`paypayfleamarket.yahoo.co.jp/search/{kw}?sold=1`) | JP | **Sold + asking** | HTML (SSR) | None | Free | **Yes — strongest PCG density found** ("ヒバニー AR 745/742 PCG鑑定品 Gem Mint 10 ¥12,500") | **4** | No API. No sold *date* in list view (item page unverified). robots.txt disallows `sold`/`open`/`sort` params. |
| **Mercari JP** | JP | Sold + asking | JS shell (CSR); internal `api.mercari.jp` needs DPoP-signed JWT (OSS `mercapi`); or Apify | None (unofficial) | Apify `jupri/mercari-jp` $30/mo+ | Yes — PCG slabs exist | **2** | **No public API.** Guide art. 900 prohibits access "by methods other than the interface we provide" and commercial data use without consent. Highest legal/technical risk. |
| **Rakuma** (`fril.jp/s?query=…&transaction=soldout`) | JP | Sold + asking | HTML (SSR) | None | Free; Apify $4/1k | Weak — PCGS coin noise; PSA only | 3 | No sold date. |
| **Rakuten Ichiba Item Search API** | JP | Asking (shops) | Official REST | `applicationId` + `accessKey` | Free | Not observed | 3 (low relevance) | No sold data; excludes C2C. |
| **aucfan (オークファン)** | JP | **Sold history aggregate** (ヤフオク, メルカリ, ラクマ, Yahoo!フリマ, Amazon; ~10 yrs) | Official API + **MCP server** (法人限定), web Premium, Apify | Contract | Quote via contact form | Would inherit PCG from Yahoo/フリマ | **4 (if contracted)** | **Only licensed route to Yahoo/Mercari sold history.** |
| **Snkrdunk (スニダン)** | JP | Asking by grade SKU | Web; no API | None | Free | **No** — graded SKUs PSA/BGS/ARS only; PCG = "他鑑定品" | 2 | Official PSA dealer. |
| **magi (magi.camp)** | JP | Asking + rankings | Rails SSR | None | Free | **No** — 0 results for `PCG鑑定` | 3 | PSA/BGS/ARS only. |
| **Card Lab Online (c-labo-online.jp)** | JP | Asking (shop) | SSR HTML | None | Free | **Yes** — "《鑑定済み》[PCG10]【AR】M2a 212/193 ¥4,980", "[PCG10/Flawless]", "[PCG9.5]"; sells "PCG鑑定キット" | 4 | Official PCG drop-off partner; clean structured titles. |
| **Full Comp (shopping.fullcomp.jp)** | JP | Asking | Shopify-style (fetch refused) | None | Free | Yes — "PCGミステリーパック" | 3 | PCG partner. |
| **Cardrush** (`/product-group/277` 鑑定済カード) | JP | Asking | 403 | None | Free | Partner; unverified | 2 | Bot protection. |
| **Suruga-ya (駿河屋)** | JP | Asking | 403 | None | Free | Partner; unverified | 2 | |
| **Hareruya2** | JP | Asking | SSR | None | Free | **No** — `/collections/pcg` is the 2004-06 *set*, not grader | 2 | Example of "PCG" set-code noise. |
| Torecolo, Yuyu-tei, Mint Mall, Torekaji, Torecaya | JP | Asking | — | — | — | Not verified | ? | Clove is oripa gacha, not marketplace. |
| **pokeca-chart.com** / ポケカチ / トレカHACK | JP | Aggregated PSA prices | Web only; 403 | — | Free | PSA only | 1 | |
| **Buyee** | Proxy | Asking (Yahoo Auctions mirror) | SSR | None | Free | Mirrors same 9 Yahoo listings | 2 | No ended/sold view. |
| ZenMarket / Neokyo / Jauce / FromJapan / Sendico | Proxy | Asking | All 403 | — | — | Unverified | 1 | |
| **Ruten (露天)** | TW | Asking | Unofficial JSON `rtapi.ruten.com.tw/api/search/v3/index.php/core/prod?q=…` | None | Free | **No** — 0–2 hits | 2 | |
| Shopee TW/SG | TW/SG | Asking | Seller API only; web anti-bot | — | — | Unverified | 1 | |
| Carousell HK/SG | HK/SG | Asking (sold badge) | 403 | — | — | PSA/BGS/CGC/TAG/ARS; **PCG not observed** | 1 | |
| **Bunjang (번개장터)** | KR | Asking; `status` 0/3 (3 likely sold — inferred) | Unofficial JSON `api.bunjang.co.kr/api/1/find_v2.json?q=…` | None | Free | **Yes** — 64 hits for "PCG 포켓몬 카드"; "PCG10등급" | 3 | Second-best PCG signal after Japan. |
| Huca.tw, tcgTalk (SG) | TW/SG | Aggregators | Web | — | — | PSA only | 1 | |
| **frankfurter.dev** (ECB rates) | FX | Daily JPY→USD | Free JSON, no key | None | Free | n/a | 5 | JPY→USD 0.0064 on 2026-09-04. |

## Key findings

### PCG in Asia
- Japan branch Osaka; ¥3,000–3,500 standard, ¥5,000 express; X @PCGJapan01; **200+ drop-off partners** (Card Rush, Full Comp, Card Lab, Gamers, Suruga-ya chains) — explains volume. Card Lab and Full Comp retail PCG slabs and PCG-branded products.
- Malaysia RM90/RM150; no SG/TH/HK/TW/KR office.
- **How Japanese sellers write it:** `PCG鑑定`, `PCG鑑定品`, `PCG10` / `PCG 10`, `PCG9.5` / `PCG鑑定 9.5`, `Gem Mint 10`, `PCG10/Flawless`, `ジェムミント`, `フローレス`. Korean: `PCG10등급`.
- **Critical noise:** "PCG" is also the 2004–06 Pokémon set code (`043/PCG-P`) and PCGS coins. Exclude `/PCG-P`, `PCG-P`, `PCGS`; prefer `PCG鑑定` / `PCG10` / `PCG9.5` tokens.
- Observed JP PCG slab prices: mostly modern AR/SAR ¥950–¥12,500; PCG is low-premium here.

### Japanese marketplaces
- **No public search/sold API for Mercari, Yahoo Auctions, Yahoo!フリマ, Rakuma.**
- **Sold data reachable without JS:** Yahoo Auctions closedsearch (180 days, final price + end date + bids), Yahoo!フリマ `?sold=1` (price, no date in list), Rakuma `transaction=soldout`. Mercari needs DPoP API or headless.
- **aucfan** is the only licensed aggregate; 法人限定 contract; ships an MCP server.
- **Card platforms don't recognise PCG** (Snkrdunk, magi, Hareruya2). PCG inventory lives on Yahoo!フリマ, Yahoo Auctions, Mercari, partner shops.
- **No PCG tracker exists in Japan** — aggregators are PSA-only.

### Other Asia
- **Korea/Bunjang** only non-Japan market with visible PCG supply. Confirm `status=3` semantics empirically.
- TW/HK/SG: no meaningful PCG presence.

### Practical
- FX: store native JPY/KRW; convert at display via ECB daily (frankfurter.dev).
- Card numbers: `NNN/NNN` with set code (`SV1a 073/073`, `M2a 212/193`, `SV9 111/100`); promos `NNN/<era>-P` (`001/SV-P`, `208/S-P`, `084/PCG-P`); eras PCG-P 2004–06, DP-P, DPt-P, L-P, BW-P, XY-P, SM-P, S-P (2019–22), SV-P (2022–). Same numerator different denominator = different card; disambiguate on name + number + rarity.
- Titles: grade first or last ("PSA10 リザードン ex SAR 201/165", "ヒバニー AR 745/742 PCG鑑定品 Gem Mint 10"). **8/10 Yahoo!フリマ PCG titles contained a card number**; Card Lab always. Expect ~20–30% C2C titles to lack a number.

### Legal/ToS (Japan)
- Copyright Act **Art. 30-4** exempts information analysis; **Art. 47-5** minor incidental use — price aggregation is the intended case. ToS breach = contract claim; heavy load can be 業務妨害 (Penal Code 233/234-2; Okazaki library case 2010).
- **Mercari** art. 900: most explicit anti-scraping language.
- **LY Corp** 共通利用規約 Art. 14/15; Yahoo Auctions robots.txt nonetheless allows `/closedsearch/closedsearch`.

## Recommended sources to start with

1. **Yahoo!フリマ `?sold=1` + Yahoo Auctions closedsearch** — highest PCG density, SSR, sold prices. ≤1 req/s, respect robots paths, keywords `PCG鑑定品 | PCG鑑定 | PCG10 | PCG9.5`, negatives `PCG-P | PCGS`.
2. **aucfan corporate API/MCP** — open 法人 contract early; only compliant path to Mercari + Yahoo depth.
3. **Card Lab Online + Full Comp** — PCG partners with clean titles; "dealer ask" layer.
4. **Bunjang `find_v2.json`** — cheap KRW secondary market.
5. **PCG public API** — cert validation.
6. **Mercari JP** — defer; partnership inquiry given ToS.
7. Skip v1: Snkrdunk/magi/Hareruya2, Carousell/Shopee/Ruten, proxy services.
