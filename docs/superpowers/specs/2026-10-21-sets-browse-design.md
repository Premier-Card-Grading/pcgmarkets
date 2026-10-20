# Sets browse: design

Date: 2026-10-21
Status: approved in brainstorming, awaiting written-spec review

## 1. Goal

Add a proper Sets section, similar to Collectr's, so people can browse the whole catalogue: every English and Japanese set, and every card in a set, whether or not it has PCG comps. The site's users read English, so Japanese sets and cards show English names wherever a correct one is known. Every card should have an image wherever a licensed source has one.

## 2. Decisions from brainstorming

| Topic | Decision |
|---|---|
| Sets index tiles | Logo tiles (option A). A set without a logo shows a dark panel with the printed code and the series. |
| Set page layout | Card grid (option A). A card without an image gets a dark slab-style tile showing the number and name. |
| Tile price | PCG 10 median over 90 days. If there is none, the PCG 10 estimate ("~$X est."). If there is neither, "No comps yet". |
| Japanese source, 2010 onwards | Limitless TCG supplies set names, card lists, official English card names, rarity, card images and logos. Limitless gave permission on 2026-10-21 for its JA set logos, card images and card data. It has no export, so we read its public pages politely. |
| Japanese source, pre-2010, and all English | TCGdex, as today. pokemontcg.io fills in missing English card images. |
| Pre-2010 Japanese names | Pokémon names from PokéAPI's official species names, plus a curated dictionary for Trainer and Energy cards. Never machine translation. A name that can't be fully translated shows the Japanese only. |
| Image storage | We stay on the Supabase free plan (1 GB) for now. Card images we copy from Limitless are stored as **small WebP** files. TCGdex and pokemontcg.io images are linked directly from their public image hosts, so they take no storage. When the subscription starts, we switch to large images (see §4.5). |
| Scope | English and Japanese only. **No Chinese.** No watchlist, portfolio or Collectr-style filter sidebar. |

## 3. Data model (migration `0006_sets_browse.sql`)

The migration is wrapped in `begin; … commit;`, like 0005.

- `sets.logo_url text`: a public URL, or null.
- `sets.series text`: the series name in English, such as "Scarlet & Violet", or null.
- `sets.source text not null default 'tcgdex'`, either `'tcgdex'` or `'limitless'`. It records which source owns the set's card list.
- `sets.limitless_code text`: the set's code on Limitless when it differs from ours, or null.
- `products.rarity` already exists and gets filled from Limitless. `products.name_en` already exists and gets filled for Japanese cards.
- `products.image_source text`: `'tcgdex'`, `'limitless'`, `'pokemontcg'` or null. It shows where each image came from and lets the large-image upgrade target only the Limitless copies.
- New view `public_set_cards`, granted to anon and authenticated. It returns one row per product:
  - `set_id`, `id`, `number_printed`, `number_num`, `number_denom`, `number_suffix`, `name_en`, `name_ja`, `rarity`, `image_url`;
  - `pcg10_median_usd` and `pcg10_n_sales`, from `price_points` where `grade_value = 10`, `grade_label = 'any'` and `window = '90d'`;
  - `est10_usd` and `est10_as_of`, from `price_estimates` where `grade_value = 10`;
  - `sale_count`, from `product_sale_counts`, or 0 when there are none.

  The view never exposes `pct`, `era`, PSA prices or import IDs, the same rule as `public_price_estimates`.
- Storage buckets `set-logos` and `card-images`, readable by the public. Only the service role can write to them.

## 4. Import

### 4.1 Japanese 2010 onwards, from Limitless (`pnpm ingest catalog:limitless`)
- The connector is `packages/connectors/src/limitless/`. It sends at most one request per second to `limitlesstcg.com`, with our `PCGMarketsBot` user agent. A 403 or 429 pauses the job, the same as other connectors.
- **Set list:** read from `/cards/jp`, giving each set's code, English name and release date.
- **Per set:** three page reads:
  - `/cards/jp/{code}?display=list&show=all` gives the number, Japanese name, type and rarity;
  - the same URL with `&translate=en` gives the official English names;
  - the same URL with `display=imgs&show=all` gives each card's image URL.

  All three are matched by card number. That's about 790 requests for 264 sets, roughly 15 minutes at one request per second.
- **Set mapping:** `packages/connectors/src/limitless/ja-set-map.ts` is a committed table that links our set IDs to Limitless codes wherever they differ (e.g. `BW1a` ↔ `BKB`, `XY1a` ↔ `XY1x`). Sets with the same code on both sides need no entry.
  - A Limitless set that matches an existing TCGdex set **merges into it**. Cards are matched by `number_num` and suffix. Limitless supplies `name_en` and `rarity` for those cards, plus the image when TCGdex has none. TCGdex keeps the product ID and the Japanese name. Limitless cards with no TCGdex match are added. The set's `source` becomes `'limitless'`.
  - A Limitless set we don't have yet is created with the Limitless code as its ID. The `ja-` prefix rule applies if that ID clashes with an English set. Its `name_en` comes from Limitless, and `name_ja` stays null unless TCGdex has the set. Product IDs are `{set_id}-{number padded to 3 digits}`. `number_printed` is the padded number, and `number_denom` stays null because Limitless doesn't print the official count.
  - A set that's in the map but missing from Limitless's list is logged as a warning and left alone.
- **Japanese logos:** for each Japanese set without `logo_url`, the job fetches `https://s3.limitlesstcg.com/sets/jp/{code}.png`, uploads it to `set-logos/ja/{set_id}.png` and sets `logo_url`. A 403 or 404 leaves it null.
- **Card images:** for each Japanese card without `image_url`, the job fetches the Limitless image at small size (`…_SM.png`), converts it to WebP at quality 80 with `sharp`, uploads it to `card-images/ja/{set_id}/{product_id}.webp`, and sets `image_url` and `image_source = 'limitless'`. This step runs politely too, with two requests at a time to their CDN, and re-running skips images already copied. Budget: about 15,000 images at roughly 25 KB, around 0.4 GB.

### 4.2 Pre-2010 Japanese and all English, from TCGdex (`catalog:tcgdex`, existing)
- This keeps the current behaviour: the `ja-` prefix for clashing IDs, no Pocket sets, no Chinese `CS…` sets, the CP5 name fix, and `JA_SUPPLEMENT_SETS`.
- It also sets `series`:
  - English sets use TCGdex's `serie.name`.
  - Japanese sets map `serie.id` through a fixed table: `PMCG` → "Original era", `neo` → "Neo", `e` → "e-Card", `ADV`/`PCG` → "ADV / PCG", `DP`/`DPt` → "Diamond & Pearl", `L` → "HeartGold & SoulSilver (LEGEND)", `BW` → "Black & White", `XY`/`XYb` → "XY", `SM` → "Sun & Moon", `S` → "Sword & Shield", `SV` → "Scarlet & Violet", `M` → "Mega".
- English `logo_url` is TCGdex's `logo` plus `.png`.
- It fills `name_en` on pre-2010 Japanese sets from `ja-set-names.ts`. Each entry is a standard English name with `review: true` until the user signs it off.
- It fills `name_en` on pre-2010 Japanese cards with `translateJaCardName` (§4.4).
- It **never overwrites** `name_en`, `rarity`, `image_url` or `series` on a set whose `source = 'limitless'`, so the order the two jobs run in doesn't matter.

### 4.3 English images from pokemontcg.io (`pnpm ingest images:en`)
- `packages/connectors/src/pokemontcg/set-map.ts` maps our TCGdex English set IDs to pokemontcg.io set IDs where they differ (e.g. `swsh4.5sv` → `swsh45sv`, `tk-ex-latia` → `tk1a`).
- For each mapped set that has cards without an image, the job reads `/v2/cards?q=set.id:{id}` once, with paging. Cards are matched by number, and `image_url` is set to `images.small`, with `image_source = 'pokemontcg'`.
- It doesn't use an API key and allows a 120-second timeout per request, since the API is slow.
- Images are linked directly, not copied.
- Unmatched cards keep a null image.

### 4.4 Pre-2010 Japanese card names
- `packages/domain/src/names/species-ja-en.json` maps Japanese species names to English. It's generated once from PokéAPI by a script committed under `scripts/`, then committed itself.
- `packages/domain/src/names/card-names-ja-en.ts` is the curated dictionary of Trainer and Energy names, regional and form prefixes, and owner prefixes such as ロケット団の → Team Rocket's.
- `translateJaCardName(name): string | null` matches the whole name first, then splits it into prefixes, species and suffix. It returns null unless every part maps.

### 4.5 Upgrade path, once the subscription starts
Re-run the image step with `--size lg`. It replaces every image where `image_source = 'limitless'` with the large file converted to WebP, about 50 KB each, roughly 0.75 GB. Nothing else changes.

## 5. Pages

### 5.1 Navigation
- The public header gets a "Sets" link on desktop and mobile, marked `aria-current` on the sets pages.
- The home page's "All N sets →" link goes to `/sets`.
- The set link in the card page breadcrumb goes to `/sets/[id]`.

### 5.2 `/sets?lang=en|ja`
- This is a server component with `revalidate = 900`. `lang` defaults to `en`, and an invalid value falls back to `en`.
- English / Japanese tabs use the existing segmented-control styling, rendered as links. Each tab label shows its set count.
- Sets are grouped by `series`. Groups are ordered by their newest release, newest first, and sets within a group by release date, newest first. Sets with no series go in a final "Other" group.
- Each tile has:
  - the logo panel (the logo on a white background, or the dark code panel);
  - the release date in a corner pill;
  - the English name, or the Japanese name when there's no English one;
  - the code and the number of products we hold. A set with no products shows its official count, labelled "card list coming".
  - a gold sales chip when `set_sale_counts` is above 0.
- A filter box narrows the tiles as you type, matching the English name, Japanese name, code or alias. It runs in the browser.

### 5.3 `/sets/[id]`
- This is a server component with `revalidate = 900`. An unknown ID returns `notFound()`.
- The breadcrumb reads Sets / English or Japanese / series.
- The header has the logo panel, the English name as the `h1` with the Japanese name underneath, and chips for the code, language, release date, card count and PCG sales.
- The cards come from `public_set_cards`, paged so the 1000-row limit can't cut a set off. The whole set is passed to a client component.
- Controls:
  - A search box. `parseCardQuery` in `@pcg/domain` turns `069/187`, `69/187`, `69` or `069` into a number and an optional denominator. Anything else is treated as name text and matched against the English and Japanese names, ignoring case. Numbers that aren't numeric fall back to a substring match on `number_printed`.
  - All / With sales, where "with sales" means `sale_count > 0`.
  - Sort by Number or Price. Price sorts by the displayed price, high to low, with "No comps yet" cards last.
- The grid has 2 columns on phones, then 3, 4 and 5 as the screen widens. Each card links to `/card/[id]` and shows:
  - the image, or the dark slab tile;
  - the English name, or the Japanese name;
  - the number, the rarity, and the Japanese name when an English one is shown;
  - the price line: "$X · PCG 10 · n sales", or "~$X est." when the estimate is no more than `ESTIMATE_MAX_AGE_DAYS` (14) old, or "No comps yet".
- Empty states:
  - A set with no products shows "We don't have the card list for this set yet."
  - A search with no results shows "No cards match “…”" and a button to clear it.

### 5.4 Styling
Everything uses existing tokens and components, in both light and dark themes. Images go through `next/image`, and `remotePatterns` adds the Supabase storage host and `images.pokemontcg.io`.

## 6. Testing
- **Domain:** `parseCardQuery` and `translateJaCardName`, including their edge cases and the null result.
- **Connectors:** Limitless parsing is tested against fixture HTML for the set list and the three set views, and the joins are checked by card number. The tests also cover set-map merging, the pokemontcg.io set map with number matching, the TCGdex series table, and the rule that TCGdex never overwrites Limitless-owned fields.
- **Ingest:** the image step skips images already copied, a 403 or 404 leaves the image null without failing the job, and WebP conversion is called with the small size.
- **DB:** static assertions on migration 0006, checking the grants, that the view leaves out PSA and pct columns, the bucket policies, and the begin/commit wrap.
- **Web:** unit tests for the tile price fallback, the set filter and the card search. Playwright screenshots of both pages in light, dark and mobile, and a browser smoke test against the real database.

## 7. Known gaps after this work
- About 2,600 pre-2010 Japanese cards have no licensed image source, so they keep the slab tile.
- Some English sets have no image source: the DP to SM trainer kits and a few 2025–26 special sets.
- Japanese sets that only Limitless has show numbers without the official count.

## 8. Out of scope
- Chinese.
- Watchlist, portfolio, and the Collectr-style filter sidebar.
- Machine translation.
- Large images, until the subscription starts (§4.5).
