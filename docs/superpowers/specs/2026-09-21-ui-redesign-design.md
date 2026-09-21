# PCG Markets UI redesign — design spec

Date: 2026-09-21
Status: approved design, awaiting spec review
Reference prototype: `docs/superpowers/specs/2026-09-21-ui-redesign/prototype.html` (also published at https://claude.ai/artifact/TKXh3Mp78BfBmM6uycgSXd, version 7)

## 1. Goal

Rebuild every page of `apps/web` to match the approved prototype one for one, on desktop and phone, in light and dark themes. The prototype is the source of truth for anything visual. Where this document and the prototype disagree on a visual detail, the prototype wins. Where the prototype has no answer (loading, error, empty and edge states, data plumbing), this document is the answer.

Scope is the six existing pages: Home, Search results, Card, Admin sign-in, Review queue, Health. No new pages, no new data sources, no auth changes.

## 2. Packages and tooling

Decisions made with the user on 2026-09-21.

| Concern | Decision | Notes |
|---|---|---|
| UI primitives | **shadcn/ui** initialised against Tailwind v4 | Add: `button`, `input`, `badge`, `select`, `popover`, `drawer`, `tabs`, `dialog` (for "Show stack"). Components are generated into `apps/web/components/ui` and then restyled to the tokens in §3. shadcn brings `clsx`, `tailwind-merge`, `class-variance-authority`, `@radix-ui/*`, `vaul`. |
| Charts | **Keep recharts** | Restyle to approximate the prototype's chart and sparkline (§6.3). Pixel match is approximate here by agreement. |
| Icons | **lucide-react** | `Search`, `ChevronDown`, `Check`, `ArrowUpRight`, `ChevronUp`, `ChevronDown`, `Monitor`, `Smartphone`. Stroke width 2, size 18 for inline icons. The slab wordmark glyph is not in Lucide and stays a hand-written SVG component (§4.1). |
| Verification | **Playwright** screenshots | Dev dependency. A script `pnpm --filter @pcg/web shots` screenshots each of the six pages at 390×844 and 1280×900 into `apps/web/.shots/` (gitignored), light and dark. Used at every plan checkpoint; usable in CI later. |
| Fonts | `next/font/google` Archivo, variable, axes `["wdth"]`, weights 400–900 | One family. Fallback stack per §3.2. `font-display: swap`. |
| Theme | System `prefers-color-scheme` only | No toggle, no `next-themes`. Tokens defined for both schemes in `globals.css`. |
| Motion | CSS transitions; vaul for the drawer | No motion library. |
| State in URL | Grade and window live in search params | `?g=10gm&w=90d`. Shareable, back button works, server-renderable. |
| Removed | Nothing | `recharts` stays. `@serwist/next` stays. |

`next.config.ts` keeps `assets.tcgdex.net` in `images.remotePatterns`; all card art goes through `next/image` with explicit width/height or `fill`.

## 3. Design system

Everything below is implemented once in `apps/web/app/globals.css` (tokens, `@theme inline` mapping for Tailwind) and consumed by components. No raw hex in components.

### 3.1 Colour tokens

Light (`:root`) and dark (`@media (prefers-color-scheme: dark)`), exactly as in the prototype's `:root` blocks:

| Token | Light | Dark | Role |
|---|---|---|---|
| `--ground` | `#F4F6F8` | `#0E1318` | page background |
| `--surface` | `#FFFFFF` | `#161C23` | cards, fields, menus |
| `--sunk` | `#E9EDF1` | `#1B222A` | chips, segmented control track, selected rows |
| `--ink` | `#16212D` | `#EAEEF2` | primary text, ink badges, primary buttons |
| `--ink-2` | `#3C4855` | `#C6CED6` | secondary text |
| `--muted` | `#56616E` | `#9AA5B1` | tertiary text, labels |
| `--line` | `#D3D9E0` | `#334050` | borders on interactive things |
| `--line-2` | `#E4E8EC` | `#222B34` | hairlines, card borders |
| `--accent` | `#0B5D75` | `#63C3DA` | links, focus, active outline, 9.5 series |
| `--accent-ink` | `#FFFFFF` | `#0B1B21` | text on accent |
| `--accent-soft` | `#DDEFF3` | `#12303A` | focus ring, cert pill background |
| `--gold` | `#8F6400` | `#E4B84B` | gold text (tier names) |
| `--gold-badge` | `#F2C24E` | `#E9B93E` | PCG 10 badge fill, header search button, gold chart series |
| `--gold-fill` | `#FBF1D2` | `#2A2410` | sparkline area fill |
| `--gold-line` | `#E2BE5A` | `#7A6224` | suspect job outline |
| `--gold-deep` | `#5E4100` | `#F3D68A` | reserved |
| `--good` / `--good-fill` | `#1E7F4F` / `#E3F4EA` | `#5BC98C` / `#12301F` | OK status, up delta, high confidence dot |
| `--warn` / `--warn-fill` | `#A65E00` / `#FBEFD9` | `#F0B35B` / `#33250D` | suspect status, review reasons, medium confidence dot |
| `--bad` / `--bad-fill` | `#B42318` / `#FBE4E1` | `#F08A80` / `#3A1512` | failed status, down delta, reject text |
| `--bar` | `#16212D` | `#0A0E13` | header background |
| `--bar-ink` | `#F4F6F8` | `#EAEEF2` | header text |
| `--bar-mute` | `#98A5B3` | `#8E9AA7` | header secondary text, placeholder |
| `--bar-line` | `#2A3644` | `#1F2830` | header field border |
| `--bar-field` | `#243040` | `#161D26` | header search field, active nav |
| `--focus` | `#0B5D75` | `#63C3DA` | `:focus-visible` outline |
| `--shadow` | `0 10px 30px -12px rgba(22,33,45,.35)` | `0 10px 30px -12px rgba(0,0,0,.7)` | objects only (§3.5) |

Text on `--gold-badge` is always `#16212D` in both themes. Colour roles are strict: gold means PCG 10 and nothing else; accent means "you can act on this" and nothing else.

### 3.2 Typography

One family, Archivo variable. Fallback: `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Segoe UI", system-ui, sans-serif`. Body `font-variation-settings: "wdth" 100`.

Roles (size / weight / width / tracking / other):

| Role | Spec |
|---|---|
| Body | 15px / 400 / 100 / 0 / line-height 1.5 |
| Secondary | 13.5px / 500 / 100, colour `--muted` |
| Caption | 12.5px / 500 / 100, colour `--muted` |
| Section heading (h2) | 22px / 800 / 100 / −0.02em |
| Page heading (h1, admin and results) | 28px / 800 / 100 / −0.025em; grey suffix span 16px / 600 |
| Hero h1 (home) | `clamp(34px, 5.6vw, 56px)` / 800 / 104 / −0.03em / line-height 1; one word in `--gold` |
| Card name h1 | `clamp(32px, 5vw, 48px)` / 800 / 104 / −0.03em / line-height 1; sub-line 0.45em / 600 / colour `--muted` |
| Price | 800 / **112** / −0.02em / `tabular-nums` / line-height 1. Sizes: guide price `clamp(44px, 7vw, 64px)`; results and ladder 20–22px; sales table 19px; strip sticker 18px |
| Price, USD secondary | 600 / 100 / colour `--muted` / 0.7em of its price |
| Card number chip | 13px (16px on card masthead) / 800 / **82** / +0.01em / `tabular-nums` |
| Grade badge | 800 / 92 / −0.01em / `tabular-nums`. 15px in the 28px badge, 12.5px in the 22px badge, 22px in the 40px badge |
| Wordmark | 18px / 800 / 105 / −0.01em |
| Chips | 12.5px / 600; language chip 11px uppercase +0.06em |
| Table header | 12.5px / 600 / colour `--muted` |
| kbd | 11px / 600 |

Numbers everywhere use `font-variant-numeric: tabular-nums`. Japanese text falls back to the system Japanese sans at the same weights.

### 3.3 Radii

| Element | Radius |
|---|---|
| Buttons, inputs, segmented control track, select trigger, popover items | 10–12px (trigger 12, popover 14) |
| Hero search field | 14px |
| Cards: result rows 14px, review item 16px, guide-price box 18px, sales rows and set tiles 12px, job tiles 12px |
| Grade badge | 8px (sm 6px, lg 11px) |
| Card number chip | 6px (8px on masthead) |
| Chips, status pills, count pills | 999px |
| Card art: strip 10px, card page 12px, thumbnails 4–6px |
| Drawer sheet | 20px top corners |

### 3.4 Spacing and layout

- Content max width 1120px, side padding 20px, top padding 24px, bottom 40px.
- Header: `--bar` background, min-height 60px, inner padding 12px 20px, gap 18px.
- Breakpoint: **`md` = 768px** viewport. The prototype used a 720px container query on a frame; the app's content area at `md` is equivalent. Everything described as "desktop" applies at `md` and up; "phone" below.
- Section gap 36–44px; heading to content 14px.
- Touch targets ≥ 44px on phone; chips used as buttons are 36px tall on desktop and 44px on phone.

### 3.5 Elevation

`--shadow` only under things that are physical objects: card art, price stickers, the hero search field, the guide-price box, the sign-in form, the popover menu, the drawer sheet. Everything else is flat with a `--line-2` border.

### 3.6 Motion

- Hover lifts: strip cards `translateY(-4px)`, result rows `translateY(-1px)`; 180ms `cubic-bezier(.2,.7,.2,1)`.
- Border/background transitions 150ms ease-out.
- Popover: 160ms fade + 4px rise, transform-origin top. Drawer: vaul default (about 220ms). Chevron rotates 180° when open.
- `@media (prefers-reduced-motion: reduce)`: all transitions and animations disabled; drawer and popover appear instantly.
- No page-load choreography.

### 3.7 Focus and accessibility

- `:focus-visible` = 2px `--focus` outline, 2px offset, everywhere.
- Every icon-only control has an `aria-label`. Search inputs have `aria-label="Search cards"` and `inputmode="search"`.
- Confidence is never colour alone: dot plus the sale count.
- Contrast: `--muted` on `--ground` ≥ 4.5:1 in both themes (verified: 5.2:1 light, 6.1:1 dark).
- Select and Drawer come from Radix/vaul with keyboard and screen-reader behaviour intact; do not strip roles when restyling.

## 4. Shared components

All in `apps/web/components/`. Names are the file names.

### 4.1 `AppHeader`
- Props: `variant: "public" | "admin"`, `search?: { value?: string; compact?: boolean }`, `admin?: { email: string; reviewCount: number; current: "review" | "health" }`.
- Wordmark: `SlabMark` SVG (24×24: rounded rect outline stroke `currentColor` 2px, gold label bar `7,5 10×4 r1`, faint inner rect) + "PCG Markets" text. On phone in admin variant the text is hidden, mark only.
- Public variant on non-home pages shows the compact `SearchField` at `md`+ (max-width 460px, `--bar-field` background, gold `Search` button). On phone the header has no search; the page body renders the compact field instead (Results page only).
- Admin variant: nav links `Review` with gold count pill (`--gold-badge`, ink text, 999px) and `Health`; active link has `--bar-field` background; email (`--bar-mute`, hidden on phone) and `Sign out`.

### 4.2 `SearchField`
- Variants: `hero` (min-height 62px, radius 14px, shadow, 19px input, 48px `Search` button), `compact` (42px, radius 10px), `header` (compact on `--bar-field`).
- Lucide `Search` icon left, muted. Button: ink background, ground text, weight 700; gold in header variant.
- Focus-within: border `--accent`, 3px `--accent-soft` ring.
- Behaviour unchanged from today's `SearchBox`: 250ms debounce, ≥2 chars, `redirectTo` handling. On submit or Enter navigate to `/search?q=`.

### 4.3 `GradeBadge`
- Props: `grade: number`, `size: "sm" | "md" | "lg"`, `tier?: string`.
- Ink badge with ground text; gold badge with `#16212D` text when `grade === 10`.
- Sizes: sm 22px tall / min-width 26px; md 28px / 32px; lg 40px / 46px.
- With `tier`, renders the badge followed by the tier name in 12.5px / 700 / `--gold` (14px in the guide box).

### 4.4 `Price`
- Props: `value: number | string`, `currency?: "USD" | "JPY"`, `size`, `secondary?: boolean`, `bestOffer?: boolean`.
- Formats with `Intl.NumberFormat("en-US")`: USD whole dollars with `$`, JPY with `¥` and no decimals. `bestOffer` prefixes `≤ `.
- Secondary variant is the lighter USD figure beside a native price.

### 4.5 `Chip`
- Variants: `default` (sunk background), `number` (ink background, condensed 82 width, 800), `lang` (uppercase), `button` (surface + `--line` border, `aria-pressed` fills ink).

### 4.6 `StatusPill`
- `ok | warn | bad | mute` with leading 7px dot and tinted fill. Text: `OK`, `Suspect`, `Failed`, `Scheduled`, `On`, `Off`, or a review reason.

### 4.7 `Delta`
- `up | down | flat`, tinted pill with Lucide chevron; text is the percentage without sign. `flat` with no percentage renders "too few sales".

### 4.8 `SectionHead`
- h2 left, optional aside right (`--muted`, 13.5px) or a control (segmented control).

### 4.9 `Segmented`
- shadcn `Tabs` restyled: `--sunk` track, 3px padding, 10px radius; active tab `--surface` with a 1px shadow. Used for the window picker (`30d`, `90d`, `180d`, `All`) and language filter where the prototype uses chips (`All`, `Japanese`, `English` are `Chip button`).

### 4.10 `Ledger`
- Table styles: header row 12.5px muted with a **2px `--ink` bottom border**, rows with `--line-2` hairlines, 10px vertical padding, 14px column gap, right-aligned numeric columns.

### 4.11 `SiteFooter`
- Two spans that wrap side by side at `md`+: the affiliation/observed-sales line and the image credit line. 12px `--muted`, top hairline.

### 4.12 `GradeSelect`
- Trigger: 52px tall, `--surface`, `--line` border, 12px radius, 1px shadow; content `GradeBadge md` + "PCG 10 Gem Mint" (700) + "14 sales" (muted 13.5px) + chevron (muted, rotates when open). Expanded: `--accent` border and ring.
- At `md`+: shadcn `Popover` anchored under the trigger, full trigger width (max 360px), 14px radius, 6px padding, `--shadow`. Options are 48px rows: badge, label, count right-aligned, Lucide `Check` in `--accent` on the selected row; selected row and hover use `--sunk`.
- Below `md`: shadcn `Drawer` (vaul) from the bottom: 20px top radius, handle (40×4 `--line`), header row "Grade" (17px / 800) with a `Done` text button in `--accent`, options at 52px / 16px. Scrim `rgba(10,14,19,.55)`.
- Selection updates the `g` search param via `router.replace` with `scroll: false`.

### 4.13 `PriceChart` and `Sparkline` (recharts)
See §6.3.

## 5. Pages

Every page: `AppHeader` on top, `SiteFooter` at the bottom (not on admin pages), content column per §3.4.

### 5.1 Home `/`

Desktop and phone share one column.

1. **Hero** (padding-top 30px, max-width 760px): h1 "What's your PCG slab **actually** worth?" with "actually" in `--gold`; lede 17px `--ink-2` max 52ch: "Real sold prices for PCG-graded Pokémon cards, pulled from eBay and Yahoo! Auctions and matched to the exact printing. No asking prices, no guesses."; hero `SearchField` (max-width 680px, placeholder "Number, name or cert"); "Try" row of `Chip button` links: `205/165`, `ナンジャモ`, `Umbreon ex 161`, `cert 000412873`. The example chips are constants in the page; clicking one runs that search.
2. **Just sold** (margin-top 44px): `SectionHead` with aside "Updated {relative time}" from the latest `sold_at`. A horizontal scroll strip (`scroll-snap-type: x mandatory`, `scroll-padding-inline: 28px`, padding `14px 28px 16px`, negative margin to bleed to the edges, hidden scrollbar) of up to 12 `StripCard`s, each 158px wide: card art (63:88, 10px radius, shadow), `GradeBadge md` overlapping the top-right corner by 8px with its own small shadow, a white price sticker overlapping bottom-left (`left:-6px; bottom:12px`, rotated −3°, 7px radius, 18px price, caption line "Gem Mint · eBay" in 10px/700 muted), then name (14.5px/700, single line ellipsis) and "SV4a 350/190 · 19 Sept" (12.5px muted). Whole card links to `/card/[id]`. Hover lifts 4px.
3. **Two columns at `md`** (3fr / 2fr, gap 56px): **Browse by set** — two-column grid of tiles (one column on phone): set name 15px/700, "SV2a · Japanese" 12.5px muted, count pill right (`--sunk`, 700). Sorted by sales desc, top 6, then a full-width "All 512 sets →" link in `--accent` (links to `/search?set=all`; that page is out of scope, so for this release the link opens the search page with an empty query and is acceptable). **How it works** — three items, bold 14px title then muted 14px body, copy exactly as in the prototype.

Empty states: if there are no sales yet, "Just sold" renders the heading and a single muted line "No PCG sales recorded yet. Search a card to see its catalogue entry." Browse by set falls back to the 6 most recently released sets with no count pill.

### 5.2 Search results `/search?q=`

New route. The current inline results under the home search box are removed; the home search navigates here.

- Phone: compact `SearchField` at the top of the body with the query filled in. Desktop: query lives in the header field.
- Heading: the query as h1 28px/800 with grey suffix "{n} printings" (singular "printing"). Right: language `Chip button`s `All` / `Japanese` / `English` (client filter on the loaded results; `aria-pressed`).
- Result rows (`--surface`, `--line-2` border, 14px radius, padding 12px 14px, gap 8px between rows): 56×78 art; name 18px/800 with the alternate-language name after it in 14.5px/500 muted; line of set name + `Chip` set code + `Chip number` + `Chip lang`. Right side at `md`+: three grade prices with gap 26px: `GradeBadge md` 10 + price 20px + "26 sales" caption; then `GradeBadge sm` 9.5 and 9 with 20px/700/width 100 muted prices and count captions. On phone only the 10 column shows, below a hairline under the text. Missing medians render "—" with caption "none".
- Footer line 13.5px muted: "Medians over the last 90 days. Looking for another printing? Add the set code, like <a>SV2a 205</a>, or search by name." The link runs that search.
- Cert queries keep today's behaviour: redirect straight to the card with `?cert=`.
- Empty: h1 shows the query with suffix "no matches"; body: "Nothing matched. Try the number as printed on the card, like 205/165, or the card name." plus the same "Try" chips as the home page.
- Loading: results area renders 3 skeleton rows (surface tiles with `--sunk` blocks); the header field shows no spinner.

### 5.3 Card `/card/[id]?g=&w=&cert=`

**Masthead**: crumbs (13.5px muted): set name as `--accent` link to `/search?q={set printed code or name}`, `/`, language word. h1 card name (primary-language name first: `name_ja` for `ja`, `name_en` for `en`); sub-line "Mew ex · Special illustration rare" (alternate name, then rarity when present). Chip row: `Chip number` 16px with `number_printed`, `Chip` set code (`printed_code`, omit if null), `Chip lang` language word, `Chip` "Released {d Month yyyy}" (omit if null). If `?cert=` is present and resolved: `--accent-soft` pill with Lucide `Check`: "Cert {id} is this card, graded PCG {grade} {tier}" (tier omitted when unknown). The cert grade/tier comes from the cert lookup already performed by search; pass it through as `?cert=&cg=&ct=` params written by the search redirect.

**Body**: at `md`+ a 250px sticky column (top 16px) for the art and a fluid column; on phone one column with the art first.

- **Art**: `next/image`, 63:88, 12px radius, `--shadow`. Phone: centred, width `min(250px, 72vw)`. No caption.
- **Guide price** section: `SectionHead` "Guide price" with the window `Segmented` (`30d`, `90d`, `180d`, `All`; default `90d`; writes `?w=`). Then `GradeSelect` (§4.12). Then the **guide-price box** (`--surface`, `--line-2` border, 18px radius, padding 20px 22px, `--shadow`; two columns at `md`+: content / 220px sparkline):
  - Label row: `GradeBadge lg` with tier at 14px, then muted "most traded grade" only when the selected grade is the one with the most sales in the window.
  - Big row: `Price` at `clamp(44px, 7vw, 64px)`, then `Delta`.
  - Meta row (13.5px muted, wrap, gap 8px 16px): confidence dot + "14 sales in 90 days" (window text: "30 days", "90 days", "180 days", "all time"), "Range $360–470", "Last sold 19 Sept 2026 for ¥62,000" (native currency).
  - Sparkline column: rolling median of the selected grade over the window (§6.3), labels "June" / "vs previous 90 days" / "Today" (first month name, window text, "Today"). With fewer than 3 non-best-offer sales the sparkline area shows a single centred muted line "Not enough sales for a trend".
  - Fine print (13px muted, max 70ch): "Median of {n} matched PCG {grade} {tier} sales in the last {window}, in USD. Yen sales are converted at the ECB rate on the day they sold. Best-offer sales are listed but left out of the median."
- **Sales** section: `SectionHead` "PCG {grade} {tier} sales" with aside "{n} in this window". Only the selected grade's sales in the selected window, newest first. Desktop `Ledger` columns: Sold (date, muted), Price (native, `Price` 19px, right), USD (secondary, right), Source ("eBay", "Yahoo! Auctions", plus ", best offer"), and a `Listing ↗` link (`--accent`, 13px/600, `target=_blank rel="noopener noreferrer nofollow"`). Phone: rows as tiles (12px radius): `GradeBadge md`, source (13.5px/600) over date (12.5px muted), price right with USD below in 12px/600 muted when the native currency is not USD. Show 6, then "Showing 6 of 45. Show all" which expands in place (client state). Empty: "No PCG {grade} sales in this window yet."
- **Over time** section: `SectionHead` "Over time" with aside "Last {window}, USD"; `PriceChart` for the selected grade (§6.3); legend row: series dot + "PCG 10 Gem Mint sales", hollow dot + "Best offer, not in median", right-aligned "Line is the rolling median". Hidden entirely when the selected grade has no sales in the window.

Grade and window persist in the URL; changing either re-renders the three sections without a full reload (client components fed by server-loaded sales for the product, filtered client-side).

`revalidate` stays at 900 seconds for the server data.

### 5.4 Admin sign-in `/admin-login`

Centered column max 420px, margin-top 32px. h1 "Sign in to admin" 34px/800; lede "We email you a link. There is no password." (muted 15px). Form in a `--surface` card (16px radius, 22px padding, shadow): label "Email" (13px/600), shadcn `Input` (44px, 10px radius, `inputmode=email`, `autocomplete=email`), help "Only the admin address on this project receives a link.", primary `Button` "Email me a sign-in link" (ink, 44px, full width). After submit: `--good-fill` panel with Lucide `Check`: "Link sent. Open it on this device within 10 minutes. Nothing arrived? Check spam, then send another." where "send another" resubmits. On `?denied=1`: a `--bad-fill` panel above the form: "That address is not an admin on this project." Errors from Supabase render in the same style with the message text.

### 5.5 Review queue `/admin/review`

- Heading: "54 listings" 28px/800 with grey suffix "need a decision" (singular "1 listing needs a decision"). Right at `md`+: kbd hints `J K move · A assign · R reject · S skip`.
- Reason filter: horizontally scrollable row of `Chip button`s: `All 54`, then one per `review_reason` present, labelled in plain words (`no_card_number` → "No card number", `ambiguous_set` → "Ambiguous set", `no_grade` → "No grade", `lot` → "Possible lot", `grader_missing`/`ambiguous_grader` → "Grader unclear", everything else → "Other"), each with its count in 800 (gold on the pressed chip). Filter is a `?reason=` param.
- Items (`--surface`, `--line-2`, 16px radius, 16px padding; at `md`+ two columns `1fr / 300px` gap 32px with a left hairline on the right column; on phone the right column sits below a top hairline). Active item (keyboard focus or first) has `--accent` border and 3px `--accent-soft` ring.
  - Left: 76×76 listing image (10px radius, `--sunk` placeholder if none); title as a 16px/700 link, two-line clamp, opens the listing in a new tab; line: `Price` 16px native with USD secondary, "Yahoo! Auctions · ended 20 Sept", `StatusPill warn` with the plain-words reason. Extracted fields as a `dl` grid (`repeat(auto-fill, minmax(105px, 1fr))`): Grader, Grade, Tier, Set, Number, Language; missing values render "not stated" / "none found" in muted 500. `details` "Seller description" in `--accent` when a description exists.
  - Right ("Assign to", 13px/600 label): the card finder — compact `SearchField` (placeholder "Number or name") with results as `hits` rows (30×42 art, name 700, "151 · 201/165 · English" muted); picking one swaps in the **picked** tile (`--sunk`, 10px radius, art 34×47, name 14.5px/700, set line muted, `Change` text button in `--accent`). Then Grade and Tier as two shadcn `Select`s side by side (Tier only enabled when Grade is 10; options "Not stated", Flawless, Pristine, Gem Mint). Actions row: primary `Assign` (flex 1, disabled until a card is picked), `Reject` (bad-coloured text button), `Skip` (muted text button; moves the active item without writing).
  - Keyboard: `J`/`K` move active; `A` submits Assign when enabled; `R` rejects; `S` skips. Ignored while typing in an input.
- Footer line: "Showing {n} of {total}. Decisions here override the matcher on every future run." Page size 50 as today; "Load more" button appends the next 50.
- Empty: "Queue is empty. Nothing needs a decision right now."

### 5.6 Health `/admin/health`

- Heading "Ingest health" 28px/800 with `StatusPill`s: "{n} failed" (bad) and "{n} suspect" (warn) when non-zero.
- **Job board**: two-column grid at `md`+ of tiles (12px radius): job name 15px/800/width 96, relative time right ("6 h ago"), result line 13.5px. Ordered failed, suspect, then ok by most recent. Result text: failed → "Failed: {first error message}" in `--bad` with a "Show stack" text button opening a shadcn `Dialog` with the JSON; suspect → "Suspect: {items_seen} seen, {items_new} new"; ok → "OK · {items_seen} seen, {items_new} new" (catalog job: "OK · {seen} sets, {new} cards"). Last tile "Next run" (muted name) with the next cron time computed from the schedule constants (`5 */6 * * *` sold sources, `35 3 * * *` fx, `50 3 * * 1` catalog) and result "ebay:sold-comps, then match and prices". Tiles for failed jobs have a `--bad` border, suspect a `--gold-line` border.
- **Listings** and **Connectors** as two `kv` tables side by side at `md`+ (48px gap): Listings rows per source/kind in plain names ("eBay sold · SoldComps", "eBay sold · The Card API", "Yahoo! Auctions ended"), then a bold "Matched" sum row with a 2px ink rule, "Needs review", "Rejected". Connectors: one row per `connector_state` cursor rendered as a short string (page and timestamp when present, else the ISO timestamp), then one row per kill switch (`CONNECTOR_THECARDAPI`, `CONNECTOR_YAHOO_AUC`, `CONNECTOR_SOLDCOMPS`) as `StatusPill` On/Off read from env on the server.
- **Recent runs**: last 40 in a scrollable `--surface` box (min-width 680px table): Job (700), Status pill, Started ("21 Sept 06:04"), Took (`finished_at − started_at` as "4 m 12 s", "—" while running), Seen, New, Errors (first message in `--bad` 13px with "Show stack").

## 6. Data and API

### 6.1 Search API
`GET /api/search?q=` response gains per-grade medians for the 90-day window:

```ts
interface SearchResult {
  id; nameEn; nameJa; setName; setCode: string | null; numberPrinted; language; imageUrl;
  grades: { g10: PricePeek | null; g95: PricePeek | null; g9: PricePeek | null };
  saleCount: number;
}
interface PricePeek { medianUsd: number; nSales: number }
```
`hydrate` reads `price_points` for `grade_value in (10, 9.5, 9)`, `grade_label = 'any'`, `window = '90d'` in one query and pivots. `pcg10Median` is removed; update `lib/search.ts` tests.

### 6.2 Card page data (`lib/card-data.ts`)
- Load product, set, all `price_points` for the product, and `public_sales` for the product (limit 500, newest first).
- `gradeOptions(points, window)`: ordered list of `{ key, gradeValue, tier | null, nSales, medianUsd, minUsd, maxUsd, confidence, lastSoldAt }` built from points in the window: 10 Flawless, 10 Pristine, 10 Gem Mint, 10 "all tiers" (the `any` point, labelled "PCG 10 · all tiers", included only if there are 10 sales without a tier label), then descending `any` points for 9.5, 9, 8.5 … Only grades with `nSales ≥ 1` appear. Keys: `10fl`, `10pr`, `10gm`, `10`, `95`, `9`, `85`, `8`, …
- Default grade: `10gm` if present, else `10`, else the option with the most sales.
- `deltaPct(sales, grade, window, now)`: median of the grade's non-best-offer USD sales in the window versus the median in the immediately preceding window of equal length; `null` when either side has fewer than 3 sales or the window is `all`. Rendered as `Delta` (up if > +0.5%, down if < −0.5%, else flat "0%").
- `rollingMedian(sales)`: for each non-best-offer sale in date order, the median of it and up to the three previous; feeds both sparkline and chart.
- All of the above are pure functions in `lib/card-data.ts` with vitest coverage.

### 6.3 Charts (recharts)
- **Sparkline**: `AreaChart`, 220×64, no axes, no grid, `Area` with stroke `--gold-badge` (or `--accent` for non-10 grades) 2.5px, fill `--gold-fill` (or `--accent-soft`), a single `ReferenceDot` on the last point (r 4, fill series colour, stroke `--surface` 2px).
- **PriceChart**: `ComposedChart`, height 230 (190 on phone), margins to match `L=44 R=12 T=14 B=28`. `CartesianGrid` horizontal only, stroke `--line-2`. `YAxis` 4 ticks at "nice" steps (choose the smallest of 10, 20, 25, 50, 100, 200, 250, 500, 1000 whose ×4 ≥ max×1.15), labels "$400" / "$1.4k" in 11px/600 muted, no axis line. `XAxis` by day with month ticks plus "Today" at the right edge, same label style. `Line` for the rolling median: series colour, 2.5px, no dots. `Scatter` for sales: r 4.5 (6 for the last), fill series colour, stroke `--ground` 1.5px; best-offer sales fill `--surface` with a 2px series-colour stroke. A `LabelList`-style label on the last sale ("$418", 14px/800 ink) placed below-right of the point. Tooltip: recharts default disabled; a custom minimal tooltip showing date, native price and source is acceptable but optional.
- Chart colours come from CSS variables via `var(--…)` strings, which recharts passes through to SVG.

### 6.4 Home data
- **Just sold**: new view `public_recent_sales` = `public_sales` joined to `products` and `sets` (id, product_id, name_en, name_ja, set printed_code, set name, number_printed, image_url, grade_value, grade_label, price, currency, price_usd, sold_at, source), ordered by `sold_at desc`, limit 12, `is_best_offer = false`. Grant select to `anon`. Migration `0004_home.sql`.
- **Browse by set**: new view `set_sale_counts` (set id, name_en, name_ja, printed_code, language, `sale_count`) from `product_sale_counts` joined to `products` and `sets`, grant to `anon`. Top 6 by `sale_count`. Total set count from `count(*)` on `sets`.

### 6.5 Search redirect for certs
`searchProducts` cert branch redirects to `/card/{id}?cert={gradedId}&cg={finalGrade}&ct={tier}` where `ct` is the cert's `grade` string mapped to a tier label when it is one of Flawless / Pristine / Gem Mint.

### 6.6 Review and health
- Review counts by reason: existing query, grouped in the page. `?reason=` filters the main query.
- Health: `ingest_runs` already has `finished_at`. Kill switches read from `process.env` on the server. Next-run computation lives in `lib/schedule.ts` with the three cron strings as constants and a small "next occurrence" function (no cron library; the three patterns are simple enough to hand-roll, with tests).

## 7. Testing and verification

- **vitest** (existing): `lib/search.test.ts` updated for the new shape; new tests for `gradeOptions`, `deltaPct`, `rollingMedian`, nice-step selection, `lib/schedule.ts`, reason labels, cursor formatting.
- **Playwright**: `apps/web/e2e/shots.spec.ts` visits `/`, `/search?q=205/165`, `/card/{seeded id}?g=10gm`, `/admin-login`, and, with a seeded admin session cookie, `/admin/review` and `/admin/health`; screenshots at 390×844 and 1280×900, light and dark (`colorScheme`). Data comes from the existing smoke seed (`pnpm --filter @pcg/ingest smoke`) against local Supabase. At each plan checkpoint the implementer compares the screenshots to the prototype at the same width and device before marking the task done.
- **Typecheck and lint** must pass: `pnpm typecheck`, `pnpm --filter @pcg/web lint`.

## 8. Out of scope

TCGplayer or any new catalogue source; new pages (set browse, all sets); a theme toggle; tooltips beyond the optional minimal one; PWA manifest colours beyond updating `background_color` to `#F4F6F8` and `theme_color` to `#16212D`.

## 9. Resolved questions

- 720px vs 768px: use Tailwind `md` (768px). The 390px and ≥1040px renders are the fidelity targets.
- Recharts vs custom SVG: recharts, approximate match accepted by the user.
- Where the grade lives: URL param, so a shared link opens on the same grade and window.
- "All 512 sets": links to `/search` for now; a set browse page is a later spec.
