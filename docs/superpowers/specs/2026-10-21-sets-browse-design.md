# Sets browse: design

Date: 2026-10-21
Status: approved in brainstorming, awaiting written-spec review

## 1. Goal

Add a proper Sets section, similar to Collectr's, so people can browse the whole catalogue: every English and Japanese set, and every card in a set, whether or not it has PCG comps. The site's users read English, so Japanese set and card names get English names wherever a correct one is known.

## 2. Decisions from brainstorming

| Topic | Decision |
|---|---|
| Sets index tiles | Logo tiles (option A). English logos come from TCGdex. Japanese logos come from Limitless TCG, copied once into our storage; Limitless gave permission on 2026-10-21. Sets without a logo get a dark panel showing the printed code and the series. |
| Set page layout | Card grid (option A). Cards without an image get a dark slab-style tile showing the number and name. |
| Japanese set names | English name first, Japanese name underneath. The English names come from a committed code → name map: Limitless for 2010 onwards, standard community names for older sets, which are flagged for review. |
| Japanese card names | Pokémon names come from PokéAPI's official species names. Trainer and Energy names come from a curated dictionary in code. Machine translation is not used. A card whose name we can't translate fully shows the Japanese name only. |
| Tile price | PCG 10 median over 90 days. If there is none, the PCG 10 estimate ("~$X est."). If there is neither, "No comps yet". |
| Scope | English and Japanese only, with no Chinese sets. No watchlist, portfolio, rarity or Collectr-style filter sidebar. |

## 3. Data model (migration `0006_sets_browse.sql`)

`sets` and `products` already have `name_en`. For Japanese rows it is currently null, and this work fills it in.

Changes:
- `sets.logo_url text`: a public URL, or null.
- `sets.series text`: the English series name, such as "Scarlet & Violet" or "Black & White". Null when unknown.
- New view `public_set_cards`, granted to anon and authenticated. It returns one row per product, with:
  - `set_id`, `id`, `number_printed`, `number_num`, `number_denom`, `number_suffix`, `name_en`, `name_ja`, `image_url`;
  - `pcg10_median_usd` and `pcg10_n_sales`, taken from `price_points` where `grade_value = 10`, `grade_label = 'any'` and `window = '90d'`;
  - `est10_usd` and `est10_as_of`, taken from `price_estimates` where `grade_value = 10`;
  - `sale_count`, taken from `product_sale_counts` (0 when there are no sales).

  The view exposes only the columns that the card page already shows publicly. It never exposes `pct`, `era`, PSA prices or import IDs, the same rule as `public_price_estimates`.
- New storage bucket `set-logos`, readable by the public. Only the service role can write to it.

The whole migration is wrapped in `begin; … commit;`, like 0005.

## 4. Import

### 4.1 Set names, series and logos
- `packages/connectors/src/tcgdex/ja-set-names.ts` maps each Japanese set code to its `name_en`, plus an optional `limitless` code where Limitless uses a different one (e.g. `BW1a`).
  - Entries for sets before 2010 carry `review: true` until the user signs them off.
  - Codes missing from the map keep `name_en` null, and the UI falls back to the Japanese name.
- Series:
  - English sets take `serie.name` from TCGdex.
  - Japanese sets map TCGdex's `serie.id` through a small fixed table, e.g. `SV` → "Scarlet & Violet", `S` → "Sword & Shield" and `PMCG` → "Original era". The DP, DPt and BW series are also added to `JA_SUPPLEMENT_SETS`, since TCGdex doesn't return those sets.
- Logos:
  - English `logo_url` is TCGdex's `logo` plus `.png` when the set has one. The site already uses TCGdex's image server for card images.
  - Japanese logos come from a new job, `pnpm ingest logos:ja`. For each Japanese set without a `logo_url`, it fetches `https://s3.limitlesstcg.com/sets/jp/{code}.png` (the Limitless code when one is mapped), uploads the image to `set-logos/ja/{set_id}.png`, and sets `logo_url`.
  - The job runs politely, at most one request per second. A 403 or 404 leaves `logo_url` null, with no error. Re-running only fetches the logos that are still missing.

### 4.2 English names for Japanese cards
- `packages/domain/src/names/` holds:
  - `species-ja-en.json`: Japanese species name → English, generated once from PokéAPI by a script committed under `scripts/`, then committed. There's no runtime dependency on PokéAPI.
  - `card-names-ja-en.ts`: the curated dictionary. It covers:
    - Trainer and Energy names, e.g. 基本超エネルギー → Basic Psychic Energy and タロ → Lacey;
    - regional and form prefixes (アローラ → Alolan, ガラル → Galarian, ヒスイ → Hisuian, パルデア → Paldean, アカツキ → Bloodmoon, メガ → Mega);
    - owner prefixes (ロケット団の → Team Rocket's, and so on).
  - `translateJaCardName(name): string | null` matches a whole name first, then splits it into prefixes, species and suffix. The suffixes include ex, EX, GX, V, VMAX, VSTAR, BREAK, LV.X and ◇. It returns null unless every part maps, so a partial or guessed name is never produced.
- The catalogue import sets `products.name_en = translateJaCardName(name_ja)` for Japanese cards.

## 5. Pages

### 5.1 Navigation
- The public header gets a "Sets" link on desktop and mobile, marked `aria-current` on the sets pages.
- The home page's "All N sets →" link goes to `/sets`.
- The set link in the card page breadcrumb goes to `/sets/[id]` instead of search.

### 5.2 `/sets?lang=en|ja`
- This is a server component with `revalidate = 900`. `lang` defaults to `en`, and an invalid value falls back to `en`.
- English / Japanese tabs use the existing segmented-control styling, rendered as links so each tab has its own URL. Each tab label shows its set count.
- Sets are grouped by `series`. Groups are ordered by their newest set's release date, newest first, and sets within a group are ordered by release date, newest first. Sets with no series go in a final "Other" group.
- Each tile has:
  - the logo panel (white background with the logo, or a dark panel with the code and series);
  - the release date in a corner pill;
  - the English name, or the Japanese name when there's no English one;
  - the code and card count. The card count is the real number of products in the set, so it includes secret rares. A set with no products shows its official count, labelled "card list coming".
  - a gold chip with the sales count when it's above 0, taken from `set_sale_counts`.
- A filter box narrows the tiles as you type, matching the English name, Japanese name, code or alias. It runs in the browser, since each tab has about 200 sets.

### 5.3 `/sets/[id]`
- This is a server component with `revalidate = 900`. An unknown ID returns `notFound()`.
- The breadcrumb reads Sets / English or Japanese / series.
- The header has the logo panel, the English name as the `h1` with the Japanese name underneath, and chips for the code, language, release date, card count and PCG sales.
- The cards come from `public_set_cards` for this set, loaded with paging so the 1000-row limit can't cut a set off. The whole set is passed to a client component.
- Controls:
  - A search box. `parseCardQuery` in `@pcg/domain` turns `069/187`, `69/187`, `69` or `069` into a number and an optional denominator. Anything else is treated as name text and matched against the English and Japanese names, ignoring case. Numbers that aren't numeric, such as promos, fall back to a substring match on `number_printed`.
  - All / With sales: "with sales" means `sale_count > 0`, meaning any PCG sale at any grade.
  - Sort by Number or Price. Number sorts by `number_num`, then the printed number. Price sorts by the displayed price, high to low, with "No comps yet" cards last.
- The grid has 2 columns on phones, then 3, 4 and 5 as the screen widens. Each card links to `/card/[id]` and shows:
  - the image, or the dark slab tile with the number, English and Japanese names and the code;
  - the English name, or the Japanese name;
  - the number, followed by the Japanese name when an English one is shown;
  - the price line: "$X · PCG 10 · n sales", or "~$X est." when the estimate is no more than `ESTIMATE_MAX_AGE_DAYS` (14) old, or "No comps yet".
- Empty states:
  - A set with no products shows "We don't have the card list for this set yet."
  - A search with no results shows "No cards match “…”" and a button to clear it.

### 5.4 Styling
Everything uses existing tokens and components: Chip, SectionHead, Price, the segmented control and the surface and line colours. Both light and dark themes are supported. Images go through `next/image`, and `remotePatterns` adds the Supabase storage host.

## 6. Testing
- Domain:
  - `parseCardQuery` covers every number format, names, promos and empty input.
  - `translateJaCardName` covers species, suffixes, regional and owner prefixes, dictionary hits, and names that partly don't map (null).
- Connectors: Japanese set name and series mapping, English logo URLs, and the logo job's handling of 403 and 404 (null, no throw).
- DB: static assertions on migration 0006, checking the grants, that the view leaves out PSA and pct columns, and the begin/commit wrap.
- Web: unit tests for the tile price fallback and the set filter. Playwright screenshots of both pages in light, dark and mobile, and a browser smoke test against the real database.

## 7. Out of scope
- Chinese sets.
- Card lists for the ~90 Japanese sets TCGdex lacks (a separate decision).
- Rarity.
- Watchlist and portfolio.
- Collectr-style filter sidebar.
- Translating Japanese set or card names by machine.
