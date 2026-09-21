# PCG Markets UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the six pages of `apps/web` to match the approved prototype one for one on desktop and phone, light and dark.

**Architecture:** Tokens live once in `globals.css` and are mapped into Tailwind v4 via `@theme inline`; shadcn/ui primitives are generated into `components/ui` and restyled through those tokens. Pages stay server components that load data with the Supabase anon/service clients, and hand it to small client components for the interactive parts (search, grade select, window, review actions). Grade and window state lives in URL search params.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind v4, shadcn/ui (Radix + vaul), lucide-react, recharts 2, next/font (Archivo variable), Supabase JS, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-21-ui-redesign-design.md` and the prototype `docs/superpowers/specs/2026-09-21-ui-redesign/prototype.html` (visual source of truth; open it in a browser, use the Desktop/Phone toggle).

## Global Constraints

- Work on branch `feat/ui-redesign` from `main`. Run all commands from the repo root unless stated.
- Node ≥ 22, pnpm 9.12. Web app is `apps/web` (`@pcg/web`). Tests: `pnpm --filter @pcg/web test`. Typecheck: `pnpm typecheck`. Lint: `pnpm --filter @pcg/web lint`.
- No raw hex in components. Every colour is a token from `globals.css` (§3.1 of the spec) used through a Tailwind class (`bg-surface`, `text-mute`, `border-line-2`, …) or `var(--…)` inside SVG.
- One font family: Archivo variable with the `wdth` axis. Prices: weight 800, width 112, tabular figures. Card numbers: weight 800, width 82.
- Colour roles are strict: gold only for PCG 10; teal (`--accent`) only for things you can act on.
- Breakpoint: Tailwind `md` (768px). Fidelity targets: 390px and ≥1040px.
- Touch targets ≥ 44px on phone. `:focus-visible` outline 2px `--focus`, offset 2px.
- `prefers-reduced-motion: reduce` disables all transitions and animations.
- Card art always through `next/image` (host `assets.tcgdex.net` is already allowed).
- Copy is exactly as written in the spec and prototype (sentence case, no middle-dot chains except where the prototype uses them in stickers, captions and set tiles).
- Commit after each task with a conventional message. Do not push.

## File structure

Create:
- `apps/web/components/ui/*` — shadcn generated (button, input, badge, select, popover, drawer, tabs, dialog) then restyled.
- `apps/web/lib/utils.ts` — `cn()` (shadcn).
- `apps/web/lib/format.ts` — extend: `fmtNative`, `fmtDateLong`, `fmtDateShort`, `relativeTime`, `fmtDuration`.
- `apps/web/lib/grades.ts` — grade keys, labels, `gradeOptions`, `defaultGradeKey`, `deltaPct`, `rollingMedian`, `niceStep`.
- `apps/web/lib/home-data.ts` — recent sales + set counts loaders and row shapes.
- `apps/web/lib/review.ts` — reason labels, extracted-field rows.
- `apps/web/lib/health.ts` — cursor and run formatting; `lib/schedule.ts` — next cron run.
- `apps/web/lib/use-media-query.ts` — `useMediaQuery` hook.
- `apps/web/components/{SlabMark,AppHeader,SearchField,GradeBadge,Price,Chip,StatusPill,Delta,SectionHead,Segmented,SiteFooter,StripCard,ResultRow,ResultsList,GradeSelect,GuideBox,Sparkline,PriceChart,SalesList,CardView,ReviewList,ReviewItem,JobTile,RunsTable}.tsx`.
- `apps/web/app/search/page.tsx`, `apps/web/app/search/loading.tsx`.
- `apps/web/e2e/shots.spec.ts`, `apps/web/playwright.config.ts`.
- `packages/db/migrations/0004_home.sql`.

Modify: `apps/web/app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `app/card/[id]/page.tsx`, `app/(public)/admin-login/page.tsx`, `app/admin/layout.tsx`, `app/admin/review/page.tsx`, `app/admin/health/page.tsx`, `app/manifest.ts`, `lib/search.ts`, `lib/card-data.ts`, `components/SearchBox.tsx` (replaced by `SearchField`), `package.json`, `.gitignore`.

Delete: `components/PriceGrid.tsx`, `components/SoldList.tsx`, `components/ResultCard.tsx`, `components/ReviewRow.tsx`, `components/SearchBox.tsx`, `test/card-data.test.ts` (replaced by `test/grades.test.ts`).

---

### Task 1: Foundation — packages, tokens, font, layout shell

**Files:**
- Modify: `apps/web/package.json`, `apps/web/app/globals.css`, `apps/web/app/layout.tsx`, `apps/web/app/manifest.ts`, `apps/web/.gitignore`
- Create: `apps/web/components.json`, `apps/web/lib/utils.ts`, `apps/web/components/ui/*`

**Interfaces:**
- Produces: Tailwind colour classes `bg-ground bg-surface bg-sunk text-ink text-ink-2 text-mute border-line border-line-2 text-teal bg-teal text-teal-ink bg-teal-soft text-gold bg-gold-badge bg-gold-fill border-gold-line text-good bg-good-fill text-warn bg-warn-fill text-bad bg-bad-fill bg-bar text-bar-ink text-bar-mute border-bar-line bg-bar-field shadow-object`; font utilities `font-sans` (Archivo) and CSS classes `.wdth-112 .wdth-104 .wdth-96 .wdth-92 .wdth-82`; `cn()`.

- [ ] **Step 1: Branch and install packages**

```bash
git checkout -b feat/ui-redesign
cd apps/web
pnpm dlx shadcn@latest init -d --base-color neutral
pnpm dlx shadcn@latest add button input badge select popover drawer tabs dialog
pnpm add lucide-react
pnpm add -D @playwright/test
pnpm exec playwright install chromium
cd ../..
```
Expected: `apps/web/components.json`, `apps/web/lib/utils.ts`, `apps/web/components/ui/{button,input,badge,select,popover,drawer,tabs,dialog}.tsx` exist; `package.json` gained `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/*`, `vaul`, `lucide-react`, `@playwright/test`. If `init` asks about the CSS file, answer `app/globals.css`; if it asks for an import alias, keep `@/components` and `@/lib/utils`.

- [ ] **Step 2: Replace `globals.css` with the token system**

Overwrite `apps/web/app/globals.css`:

```css
@import "tailwindcss";

:root {
  --ground:#F4F6F8; --surface:#FFFFFF; --sunk:#E9EDF1; --ink:#16212D; --ink-2:#3C4855; --muted:#56616E; --line:#D3D9E0; --line-2:#E4E8EC;
  --accent:#0B5D75; --accent-ink:#FFFFFF; --accent-soft:#DDEFF3;
  --gold:#8F6400; --gold-badge:#F2C24E; --gold-fill:#FBF1D2; --gold-line:#E2BE5A; --gold-deep:#5E4100;
  --good:#1E7F4F; --good-fill:#E3F4EA; --warn:#A65E00; --warn-fill:#FBEFD9; --bad:#B42318; --bad-fill:#FBE4E1;
  --bar:#16212D; --bar-ink:#F4F6F8; --bar-mute:#98A5B3; --bar-line:#2A3644; --bar-field:#243040;
  --focus:#0B5D75; --shadow:0 10px 30px -12px rgba(22,33,45,.35);
  --badge-ink:#16212D;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ground:#0E1318; --surface:#161C23; --sunk:#1B222A; --ink:#EAEEF2; --ink-2:#C6CED6; --muted:#9AA5B1; --line:#334050; --line-2:#222B34;
    --accent:#63C3DA; --accent-ink:#0B1B21; --accent-soft:#12303A;
    --gold:#E4B84B; --gold-badge:#E9B93E; --gold-fill:#2A2410; --gold-line:#7A6224; --gold-deep:#F3D68A;
    --good:#5BC98C; --good-fill:#12301F; --warn:#F0B35B; --warn-fill:#33250D; --bad:#F08A80; --bad-fill:#3A1512;
    --bar:#0A0E13; --bar-ink:#EAEEF2; --bar-mute:#8E9AA7; --bar-line:#1F2830; --bar-field:#161D26;
    --focus:#63C3DA; --shadow:0 10px 30px -12px rgba(0,0,0,.7);
  }
}

@theme inline {
  --font-sans: var(--font-archivo), "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Segoe UI", system-ui, sans-serif;

  /* project tokens */
  --color-ground: var(--ground); --color-surface: var(--surface); --color-sunk: var(--sunk);
  --color-ink: var(--ink); --color-ink-2: var(--ink-2); --color-mute: var(--muted);
  --color-line: var(--line); --color-line-2: var(--line-2);
  --color-teal: var(--accent); --color-teal-ink: var(--accent-ink); --color-teal-soft: var(--accent-soft);
  --color-gold: var(--gold); --color-gold-badge: var(--gold-badge); --color-gold-fill: var(--gold-fill); --color-gold-line: var(--gold-line); --color-gold-deep: var(--gold-deep);
  --color-good: var(--good); --color-good-fill: var(--good-fill); --color-warn: var(--warn); --color-warn-fill: var(--warn-fill); --color-bad: var(--bad); --color-bad-fill: var(--bad-fill);
  --color-bar: var(--bar); --color-bar-ink: var(--bar-ink); --color-bar-mute: var(--bar-mute); --color-bar-line: var(--bar-line); --color-bar-field: var(--bar-field);
  --color-badge-ink: var(--badge-ink);
  --shadow-object: var(--shadow);

  /* shadcn aliases so generated components pick up our tokens */
  --color-background: var(--ground); --color-foreground: var(--ink);
  --color-card: var(--surface); --color-card-foreground: var(--ink);
  --color-popover: var(--surface); --color-popover-foreground: var(--ink);
  --color-primary: var(--ink); --color-primary-foreground: var(--ground);
  --color-secondary: var(--sunk); --color-secondary-foreground: var(--ink);
  --color-muted: var(--sunk); --color-muted-foreground: var(--muted);
  --color-accent: var(--sunk); --color-accent-foreground: var(--ink);
  --color-destructive: var(--bad); --color-border: var(--line-2); --color-input: var(--line); --color-ring: var(--focus);
  --radius: 10px;
}

* { box-sizing: border-box; }
html { font-variation-settings: "wdth" 100; -webkit-font-smoothing: antialiased; }
body { margin: 0; background: var(--ground); color: var(--ink); font-family: var(--font-sans); font-size: 15px; line-height: 1.5; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.wdth-112 { font-variation-settings: "wdth" 112; }
.wdth-100 { font-variation-settings: "wdth" 100; }
.wdth-104 { font-variation-settings: "wdth" 104; }
.wdth-105 { font-variation-settings: "wdth" 105; }
.wdth-96 { font-variation-settings: "wdth" 96; }
.wdth-92 { font-variation-settings: "wdth" 92; }
.wdth-82 { font-variation-settings: "wdth" 82; }
.tnum { font-variant-numeric: tabular-nums; }
.no-scrollbar::-webkit-scrollbar { height: 0; width: 0; }
.no-scrollbar { scrollbar-width: none; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
}
```

- [ ] **Step 3: Root layout with Archivo and the shell**

Overwrite `apps/web/app/layout.tsx`:

```tsx
import "./globals.css";
import { Archivo } from "next/font/google";
const archivo = Archivo({ subsets: ["latin", "latin-ext"], weight: "variable", axes: ["wdth"], variable: "--font-archivo", display: "swap" });
export const metadata = { title: "PCG Markets", description: "What PCG-graded Pokémon cards actually sold for", manifest: "/manifest.webmanifest" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}><body className="min-h-screen bg-ground text-ink font-sans flex flex-col">{children}</body></html>
  );
}
```
Headers and footers move into each page in later tasks (public pages render `AppHeader` + `SiteFooter`; admin layout renders the admin header).

- [ ] **Step 4: Manifest colours and gitignore**

In `apps/web/app/manifest.ts` change `background_color: "#fafafa"` to `"#F4F6F8"` and `theme_color: "#18181b"` to `"#16212D"`.
Append to `apps/web/.gitignore`:
```
/.shots/
/test-results/
/playwright-report/
```

- [ ] **Step 5: Restyle the generated primitives to the tokens**

Edit only the class strings in `components/ui`:
- `button.tsx`: base classes → `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-bold text-[14.5px] min-h-11 px-[18px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed`; variants `default: "bg-ink text-ground border border-ink"`, `outline: "bg-surface text-ink border border-line"`, `ghost: "text-mute bg-transparent"`, `danger: "text-bad bg-transparent"` (add `danger` to the variants map); size `sm: "min-h-9 px-3 text-[13.5px] rounded-lg"`.
- `input.tsx`: `w-full min-h-11 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-[15px] font-medium text-ink placeholder:text-mute placeholder:font-normal focus-visible:border-teal focus-visible:ring-[3px] focus-visible:ring-teal-soft outline-none`.
- `popover.tsx` content: `z-50 rounded-[14px] border border-line bg-surface p-1.5 shadow-object`.
- `drawer.tsx` content: `fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[390px] rounded-t-[20px] bg-surface px-3 pt-2 pb-[calc(16px+env(safe-area-inset-bottom,0px))] shadow-object`; overlay: `fixed inset-0 z-50 bg-[rgba(10,14,19,.55)]`; keep the handle element and give it `mx-auto mt-1 mb-2.5 h-1 w-10 rounded-sm bg-line`.
- `tabs.tsx`: list → `inline-flex gap-0.5 rounded-[10px] bg-sunk p-[3px]`; trigger → `min-h-8 rounded-lg px-3 text-[13.5px] font-semibold text-mute data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-[0_1px_2px_rgba(0,0,0,.08)]`.
- `select.tsx` trigger → same as input classes plus `justify-between`; content → same as popover content; item → `min-h-10 rounded-lg px-2.5 text-[15px] font-bold data-[highlighted]:bg-sunk data-[state=checked]:bg-sunk`.
- `dialog.tsx` content → `rounded-2xl border border-line-2 bg-surface p-5 shadow-object max-w-lg`.
- `badge.tsx` is unused for grade badges (Task 2 has its own); leave default.
Remove any `dark:` classes the generator added; the tokens switch by themselves.

- [ ] **Step 6: Verify build and typecheck**

```bash
pnpm typecheck && pnpm --filter @pcg/web build
```
Expected: both pass. The pages still render the old markup, now without the old header; that is fine until Task 3.

- [ ] **Step 7: Commit**

```bash
git add -A apps/web
git commit -m "feat(web): design tokens, Archivo font, shadcn primitives restyled to tokens"
```

---

### Task 2: Shared display primitives and formatting

**Files:**
- Modify: `apps/web/lib/format.ts`
- Create: `apps/web/components/{SlabMark,GradeBadge,Price,Chip,StatusPill,Delta,SectionHead,Segmented,SiteFooter}.tsx`
- Test: `apps/web/test/format.test.ts` (extend)

**Interfaces:**
- Produces: `fmtUsd(n)`, `fmtNative(amount, currency)`, `fmtDateLong(iso) → "19 Sept 2026"`, `fmtDateShort(iso) → "19 Sept"`, `relativeTime(iso, now) → "2 h ago" | "3 d ago" | "in 3 h 40 m"`, `fmtDuration(ms) → "4 m 12 s"`; components `GradeBadge {grade,size?,tier?}`, `Price {value,currency?,size?,secondary?,bestOffer?,className?}`, `Chip {variant?,pressed?,asChild?}`, `StatusPill {tone,children}`, `Delta {pct: number|null}`, `SectionHead {title,aside?,children?}`, `Segmented {value,options,onChange}`, `SiteFooter {credit?: boolean}`, `SlabMark`.

- [ ] **Step 1: Write failing format tests**

Append to `apps/web/test/format.test.ts`:

```ts
import { fmtNative, fmtDateLong, fmtDateShort, relativeTime, fmtDuration } from "../lib/format";
describe("format additions", () => {
  it("native prices", () => { expect(fmtNative(62000, "JPY")).toBe("¥62,000"); expect(fmtNative(640, "USD")).toBe("$640"); expect(fmtNative(640.5, "USD")).toBe("$640.50"); });
  it("dates", () => { expect(fmtDateLong("2026-09-19T10:00:00Z")).toBe("19 Sept 2026"); expect(fmtDateShort("2026-09-19T10:00:00Z")).toBe("19 Sept"); });
  it("relative time", () => {
    const now = new Date("2026-09-21T12:00:00Z");
    expect(relativeTime("2026-09-21T10:00:00Z", now)).toBe("2 h ago");
    expect(relativeTime("2026-09-18T10:00:00Z", now)).toBe("3 d ago");
    expect(relativeTime("2026-09-21T11:58:00Z", now)).toBe("2 m ago");
    expect(relativeTime("2026-09-21T15:40:00Z", now)).toBe("in 3 h 40 m");
  });
  it("durations", () => { expect(fmtDuration(252000)).toBe("4 m 12 s"); expect(fmtDuration(6000)).toBe("6 s"); expect(fmtDuration(665000)).toBe("11 m 05 s"); });
});
```

- [ ] **Step 2: Run to verify failure**

`pnpm --filter @pcg/web test -- format` → FAIL: `fmtDateLong is not a function` (and friends).

- [ ] **Step 3: Implement `lib/format.ts`**

```ts
export const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export function fmtNative(amount: number, currency: string) {
  if (currency === "JPY") return `¥${Math.round(amount).toLocaleString("en-US")}`;
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
}
const long = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const short = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const fmtDateLong = (iso: string) => long.format(new Date(iso));
export const fmtDateShort = (iso: string) => short.format(new Date(iso));
export const fmtDate = (iso: string) => iso.slice(0, 10);
export function relativeTime(iso: string, now = new Date()): string {
  const diff = new Date(iso).getTime() - now.getTime(); const abs = Math.abs(diff);
  const m = Math.round(abs / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (diff > 0) return h >= 1 ? `in ${h} h ${String(m % 60).padStart(2, "0").replace(/^0/, "")} m`.replace(/ 0 m$/, "") : `in ${m} m`;
  if (d >= 1) return `${d} d ago`;
  if (h >= 1) return `${h} h ago`;
  return `${Math.max(m, 1)} m ago`;
}
export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000), m = Math.floor(s / 60);
  if (m === 0) return `${s} s`;
  return `${m} m ${String(s % 60).padStart(2, "0")} s`;
}
export function gradeLabelText(value: number | null, label: string | null) {
  if (value == null) return label ?? "—";
  return label && label !== "any" ? `${value} ${label}` : String(value);
}
```
Note on `relativeTime` future branch: `"in 3 h 40 m"` for 3h40m; `"in 3 h"` when minutes are zero. Adjust the test expectation only if the spec's example output differs from what this produces; the spec example is `in 3 h 40 m`.

- [ ] **Step 4: Run tests**

`pnpm --filter @pcg/web test -- format` → PASS (fix the `fmtDuration` zero-pad: `11 m 05 s` is expected, `4 m 12 s` too).

- [ ] **Step 5: Create the primitives**

`components/SlabMark.tsx`:
```tsx
export function SlabMark({ className = "h-[22px] w-[22px]" }: { className?: string }) {
  return (<svg viewBox="0 0 24 24" className={className} aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2" /><rect x="7" y="5" width="10" height="4" rx="1" fill="var(--gold-badge)" /><rect x="7.5" y="11" width="9" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".55" /></svg>);
}
```

`components/GradeBadge.tsx`:
```tsx
import { cn } from "@/lib/utils";
const sizes = { sm: "h-[22px] min-w-[26px] px-[5px] text-[12.5px] rounded-md", md: "h-7 min-w-8 px-[7px] text-[15px] rounded-lg", lg: "h-10 min-w-[46px] px-2.5 text-[22px] rounded-[11px]" } as const;
export function GradeBadge({ grade, size = "md", tier, tierClass }: { grade: number; size?: keyof typeof sizes; tier?: string | null; tierClass?: string }) {
  const ten = grade === 10;
  const badge = <span className={cn("inline-flex items-center justify-center font-extrabold wdth-92 tnum leading-none tracking-[-0.01em] shrink-0", sizes[size], ten ? "bg-gold-badge text-badge-ink" : "bg-ink text-ground")}>{grade}</span>;
  if (!tier) return badge;
  return <span className="inline-flex items-center gap-[7px] whitespace-nowrap">{badge}<span className={cn("text-[12.5px] font-bold text-gold tracking-[0.01em]", tierClass)}>{tier}</span></span>;
}
```

`components/Price.tsx`:
```tsx
import { cn } from "@/lib/utils";
import { fmtNative, fmtUsd } from "@/lib/format";
export function Price({ value, currency = "USD", secondary = false, bestOffer = false, className }: { value: number | string; currency?: string; secondary?: boolean; bestOffer?: boolean; className?: string }) {
  const text = typeof value === "string" ? value : currency === "USD" && secondary ? fmtUsd(value) : fmtNative(value, currency);
  return <span className={cn("tnum leading-none", secondary ? "font-semibold text-mute" : "font-extrabold wdth-112 tracking-[-0.02em]", className)}>{bestOffer ? "≤ " : ""}{text}</span>;
}
```

`components/Chip.tsx`:
```tsx
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
type Variant = "default" | "number" | "lang" | "button";
const base = "inline-flex items-center gap-[5px] rounded-full px-2.5 py-[3px] text-[12.5px] font-semibold leading-[1.4] whitespace-nowrap";
const variants: Record<Variant, string> = {
  default: "bg-sunk text-ink-2",
  number: "bg-ink text-ground rounded-md px-2 py-0.5 text-[13px] font-extrabold wdth-82 tnum tracking-[0.01em]",
  lang: "bg-sunk text-ink-2 uppercase text-[11px] tracking-[0.06em]",
  button: "bg-surface text-ink border border-line min-h-9 md:min-h-9 px-3.5 py-0 aria-pressed:bg-ink aria-pressed:text-ground aria-pressed:border-ink transition-colors",
};
export function Chip({ variant = "default", className, ...rest }: ComponentProps<"span"> & { variant?: Variant }) { return <span className={cn(base, variants[variant], className)} {...rest} />; }
export function ChipButton({ className, ...rest }: ComponentProps<"button">) { return <button type="button" className={cn(base, variants.button, "cursor-pointer", className)} {...rest} />; }
export function ChipLink({ className, ...rest }: ComponentProps<"a">) { return <a className={cn(base, variants.button, "no-underline", className)} {...rest} />; }
```

`components/StatusPill.tsx`:
```tsx
import { cn } from "@/lib/utils";
const tones = { ok: "text-good bg-good-fill", warn: "text-warn bg-warn-fill", bad: "text-bad bg-bad-fill", mute: "text-mute bg-sunk" } as const;
export type Tone = keyof typeof tones;
export function StatusPill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full py-0.5 pl-[7px] pr-[9px] text-[13px] font-bold", tones[tone], className)}><span className="h-[7px] w-[7px] rounded-full bg-current" />{children}</span>;
}
```

`components/Delta.tsx`:
```tsx
import { ChevronDown, ChevronUp } from "lucide-react";
export function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="inline-flex items-center rounded-md bg-sunk px-[7px] py-0.5 text-[13px] font-bold text-mute">too few sales</span>;
  const dir = pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat";
  const cls = dir === "up" ? "text-good bg-good-fill" : dir === "down" ? "text-bad bg-bad-fill" : "text-mute bg-sunk";
  return <span className={`inline-flex items-center gap-[3px] rounded-md px-[7px] py-0.5 text-[13px] font-bold tnum ${cls}`}>{dir === "up" && <ChevronUp size={12} strokeWidth={3} />}{dir === "down" && <ChevronDown size={12} strokeWidth={3} />}{Math.abs(Math.round(pct))}%</span>;
}
```

`components/SectionHead.tsx`:
```tsx
export function SectionHead({ title, aside, children }: { title: React.ReactNode; aside?: React.ReactNode; children?: React.ReactNode }) {
  return <div className="mb-3.5 flex items-center justify-between gap-3"><h2 className="text-[22px] font-extrabold tracking-[-0.02em] m-0">{title}</h2>{children ?? (aside && <span className="text-[13.5px] font-medium text-mute">{aside}</span>)}</div>;
}
```

`components/Segmented.tsx` (shadcn Tabs):
```tsx
"use client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (<Tabs value={value} onValueChange={(v) => onChange(v as T)}><TabsList aria-label={label}>{options.map((o) => <TabsTrigger key={o.value} value={o.value}>{o.label}</TabsTrigger>)}</TabsList></Tabs>);
}
```

`components/SiteFooter.tsx`:
```tsx
export function SiteFooter({ credit = true }: { credit?: boolean }) {
  return (<footer className="mx-auto flex w-full max-w-[1120px] flex-wrap gap-y-1.5 gap-x-6 border-t border-line-2 px-5 pt-4 pb-6 text-xs leading-[1.55] text-mute">
    <span className="min-w-[240px] flex-1">Not affiliated with eBay or LY Corporation. Prices are observed sales, not offers.</span>
    {credit && <span className="min-w-[240px] flex-1">Card images © The Pokémon Company / Nintendo / Creatures / GAME FREAK, served from TCGdex.</span>}
  </footer>);
}
```

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm typecheck && pnpm --filter @pcg/web test
git add -A apps/web && git commit -m "feat(web): shared primitives (GradeBadge, Price, Chip, StatusPill, Delta, Segmented, SiteFooter) and formatters"
```

---

### Task 3: AppHeader and SearchField, `/search` route skeleton

**Files:**
- Create: `apps/web/components/AppHeader.tsx`, `apps/web/components/SearchField.tsx`, `apps/web/app/search/page.tsx`, `apps/web/app/search/loading.tsx`
- Delete: `apps/web/components/SearchBox.tsx`
- Modify: `apps/web/app/page.tsx` (temporary: header + hero search only; full home in Task 7)

**Interfaces:**
- Produces: `AppHeader {variant:"public"|"admin"; search?: {value?: string; show?: boolean}; admin?: {email:string; reviewCount:number; current:"review"|"health"}}`; `SearchField {variant:"hero"|"compact"|"header"; initialQuery?: string; placeholder?: string; autoFocus?: boolean}` which navigates to `/search?q=` on submit, and to `redirectTo` when the API says so.

- [ ] **Step 1: SearchField**

`components/SearchField.tsx`:
```tsx
"use client";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
const wrap = { hero: "min-h-[62px] rounded-[14px] pl-4 pr-1.5 shadow-object", compact: "min-h-[42px] rounded-[10px] pl-3 pr-1", header: "min-h-[42px] rounded-[10px] pl-3 pr-1 bg-bar-field border-bar-line text-bar-ink" } as const;
export function SearchField({ variant, initialQuery = "", placeholder = "Number, name or cert", autoFocus, className }: { variant: keyof typeof wrap; initialQuery?: string; placeholder?: string; autoFocus?: boolean; className?: string }) {
  const [q, setQ] = useState(initialQuery); const router = useRouter();
  async function go(e: React.FormEvent) {
    e.preventDefault(); const query = q.trim(); if (query.length < 2) return;
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`); const out = await res.json();
    router.push("redirectTo" in out ? out.redirectTo : `/search?q=${encodeURIComponent(query)}`);
  }
  const header = variant === "header";
  return (
    <form role="search" onSubmit={go} className={cn("flex items-center gap-2 border border-line bg-surface focus-within:border-teal focus-within:ring-[3px] focus-within:ring-teal-soft", wrap[variant], className)}>
      <Search size={variant === "hero" ? 18 : 16} className={header ? "text-bar-mute shrink-0" : "text-mute shrink-0"} aria-hidden="true" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} inputMode="search" aria-label="Search cards" autoFocus={autoFocus}
        className={cn("min-w-0 flex-1 bg-transparent py-2 font-medium outline-none placeholder:font-normal", variant === "hero" ? "text-[19px]" : "text-[15px]", header ? "text-bar-ink placeholder:text-bar-mute" : "text-ink placeholder:text-mute")} />
      <button type="submit" className={cn("rounded-[7px] font-bold", variant === "hero" ? "min-h-12 rounded-[10px] px-5 text-[15px]" : "min-h-8 px-3.5 text-sm", header ? "bg-gold-badge text-badge-ink" : "bg-ink text-ground")}>Search</button>
    </form>
  );
}
```

- [ ] **Step 2: AppHeader**

`components/AppHeader.tsx`:
```tsx
import Link from "next/link";
import { SlabMark } from "./SlabMark";
import { SearchField } from "./SearchField";
import { cn } from "@/lib/utils";
type Admin = { email: string; reviewCount: number; current: "review" | "health" };
export function AppHeader({ variant, search, admin }: { variant: "public" | "admin"; search?: { value?: string; show?: boolean }; admin?: Admin }) {
  return (
    <header className="bg-bar text-bar-ink">
      <div className="mx-auto flex min-h-[60px] max-w-[1120px] items-center gap-[18px] px-5 py-3">
        <Link href="/" className="inline-flex items-center gap-[9px] whitespace-nowrap text-lg font-extrabold tracking-[-0.01em] wdth-105 no-underline"><SlabMark /><span className={cn(variant === "admin" && "max-md:hidden")}>PCG Markets</span></Link>
        {variant === "public" && search?.show !== false && <SearchField variant="header" initialQuery={search?.value} placeholder={search?.value ? undefined : "Search another card"} className="hidden md:flex flex-1 max-w-[460px]" />}
        {variant === "admin" && admin && (
          <nav className="ml-auto flex items-center gap-1 text-sm" aria-label="Admin">
            <NavLink href="/admin/review" current={admin.current === "review"}>Review <span className="rounded-full bg-gold-badge px-[7px] py-px text-[11.5px] font-extrabold text-badge-ink tnum">{admin.reviewCount}</span></NavLink>
            <NavLink href="/admin/health" current={admin.current === "health"}>Health</NavLink>
            <span className="hidden px-2 text-[13px] text-bar-mute md:inline whitespace-nowrap">{admin.email}</span>
            <NavLink href="/auth/signout">Sign out</NavLink>
          </nav>)}
      </div>
    </header>);
}
function NavLink({ href, current, children }: { href: string; current?: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={current ? "page" : undefined} className={cn("inline-flex min-h-10 items-center gap-[7px] rounded-lg px-2 md:px-2.5 font-medium no-underline", current ? "bg-bar-field text-bar-ink" : "text-bar-mute")}>{children}</Link>;
}
```
`/auth/signout` does not exist yet; add `apps/web/app/auth/signout/route.ts`:
```ts
import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/admin";
export async function GET(req: Request) { const sb = await sessionClient(); await sb.auth.signOut(); return NextResponse.redirect(new URL("/admin-login", req.url)); }
```

- [ ] **Step 3: `/search` skeleton and home stub**

`app/search/page.tsx` (temporary body; Task 6 completes it):
```tsx
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SearchField } from "@/components/SearchField";
import { anonClient } from "@/lib/supabase-server";
import { searchProducts } from "@/lib/search";
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const out = q.trim().length >= 2 ? await searchProducts(anonClient(), q.trim()) : { results: [] };
  if ("redirectTo" in out) redirect(out.redirectTo);
  return (<>
    <AppHeader variant="public" search={{ value: q }} />
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10">
      <SearchField variant="compact" initialQuery={q} className="mb-[18px] md:hidden" />
      <pre className="text-xs">{JSON.stringify(out.results, null, 1)}</pre>
    </main>
    <SiteFooter />
  </>);
}
```
`app/search/loading.tsx`:
```tsx
export default function Loading() {
  return <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10"><div className="mb-3.5 h-8 w-48 rounded-lg bg-sunk" />{[0, 1, 2].map((i) => <div key={i} className="mb-2 h-[104px] rounded-[14px] border border-line-2 bg-surface" />)}</main>;
}
```
`app/page.tsx` temporary:
```tsx
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SearchField } from "@/components/SearchField";
export default function Home() {
  return (<><AppHeader variant="public" search={{ show: false }} /><main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10"><SearchField variant="hero" autoFocus className="max-w-[680px]" /></main><SiteFooter /></>);
}
```
Delete `components/SearchBox.tsx` and `components/ResultCard.tsx` (ResultCard is still imported by `ReviewRow.tsx`; leave `ReviewRow.tsx` compiling by changing its import to `import type { SearchResult } from "@/lib/search";` only — it already imports that; just delete the ResultCard file and confirm nothing else imports it with `grep -rn ResultCard apps/web`).

- [ ] **Step 4: Verify in the browser**

```bash
pnpm web
```
Open http://localhost:3000, type `205/165`, press Enter → lands on `/search?q=205%2F165` showing JSON. Header search on that page is visible at ≥768px only; the compact field shows below 768px. Then:
```bash
pnpm typecheck && pnpm --filter @pcg/web lint
git add -A apps/web && git commit -m "feat(web): AppHeader, SearchField, /search route skeleton, sign-out route"
```

---

### Task 4: Database views for the home page

**Files:**
- Create: `packages/db/migrations/0004_home.sql`

**Interfaces:**
- Produces: view `public_recent_sales(id, product_id, name_en, name_ja, number_printed, image_url, set_code, set_name_en, set_name_ja, language, grade_value, grade_label, price, currency, price_usd, sold_at, source)`; view `set_sale_counts(id, name_en, name_ja, printed_code, language, sale_count)`; both selectable by `anon`.

- [ ] **Step 1: Write the migration**

```sql
-- 0004_home.sql: read-only views for the home page (Just sold, Browse by set).
create view public_recent_sales as
select s.id, s.product_id, p.name_en, p.name_ja, p.number_printed, p.image_url,
       st.printed_code as set_code, st.name_en as set_name_en, st.name_ja as set_name_ja, p.language,
       s.grade_value, s.grade_label, s.price, s.currency, s.price_usd, s.sold_at, s.source
from public_sales s
join products p on p.id = s.product_id
join sets st on st.id = p.set_id
where s.is_best_offer = false and s.sold_at is not null and s.grade_value is not null;

create view set_sale_counts as
select st.id, st.name_en, st.name_ja, st.printed_code, st.language, sum(c.sale_count)::int as sale_count
from product_sale_counts c
join products p on p.id = c.product_id
join sets st on st.id = p.set_id
group by st.id, st.name_en, st.name_ja, st.printed_code, st.language;

grant select on public_recent_sales to anon, authenticated;
grant select on set_sale_counts to anon, authenticated;
```

- [ ] **Step 2: Apply and check**

Apply the file to the local/scratch Supabase project the same way the earlier migrations were applied (SQL editor or `psql "$DATABASE_URL" -f packages/db/migrations/0004_home.sql`). Then:
```sql
select count(*) from public_recent_sales; select * from set_sale_counts order by sale_count desc limit 3;
```
Expected: no errors; rows appear if the smoke seed has been run (`pnpm --filter @pcg/ingest smoke`).

- [ ] **Step 3: Commit**

```bash
git add packages/db/migrations/0004_home.sql && git commit -m "feat(db): public_recent_sales and set_sale_counts views for the home page"
```

---

### Task 5: Search API returns per-grade medians

**Files:**
- Modify: `apps/web/lib/search.ts`, `apps/web/test/search.test.ts`, `apps/web/components/ReviewRow.tsx` (only the `pcg10Median` reference, if any; it uses `nameEn/nameJa/setName/numberPrinted/language` which stay)

**Interfaces:**
- Produces:
```ts
export interface PricePeek { medianUsd: number; nSales: number }
export interface SearchResult { id: string; nameEn: string | null; nameJa: string | null; setName: string; setCode: string | null; numberPrinted: string; language: "ja" | "en"; imageUrl: string | null; grades: { g10: PricePeek | null; g95: PricePeek | null; g9: PricePeek | null }; saleCount: number }
export type SearchOutcome = { results: SearchResult[] } | { redirectTo: string };
```
Cert redirects become `/card/{id}?cert={gradedId}&cg={finalGrade}&ct={tier}`.

- [ ] **Step 1: Update the test**

Replace the first test in `apps/web/test/search.test.ts`:
```ts
function db(rpcResult: unknown[], products: unknown[], points: unknown[] = []) {
  return {
    rpc: vi.fn(async () => ({ data: rpcResult, error: null })),
    from: vi.fn((t: string) => ({
      select: () => ({
        in: async () => ({ data: t === "products" ? products : points, error: null }),
        eq: () => ({ eq: () => ({ in: () => ({ in: async () => ({ data: points, error: null }) }) }) }),
      }),
    })),
  } as never;
}
it("number-shaped input calls search_products_by_number and hydrates per-grade medians", async () => {
  const d = db([{ id: "SV1a-073", sale_count: 4 }],
    [{ id: "SV1a-073", name_en: null, name_ja: "デカヌチャン", number_printed: "073/073", language: "ja", image_url: null, sets: { name_en: null, name_ja: "トリプレットビート", printed_code: "SV1a" } }],
    [{ product_id: "SV1a-073", grade_value: 10, median_usd: 42, n_sales: 3 }, { product_id: "SV1a-073", grade_value: 9, median_usd: 12, n_sales: 1 }]);
  const r = await searchProducts(d, "073/073");
  expect(r).toEqual({ results: [{ id: "SV1a-073", nameEn: null, nameJa: "デカヌチャン", setName: "トリプレットビート", setCode: "SV1a", numberPrinted: "073/073", language: "ja", imageUrl: null,
    grades: { g10: { medianUsd: 42, nSales: 3 }, g95: null, g9: { medianUsd: 12, nSales: 1 } }, saleCount: 4 }] });
  expect((d as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("search_products_by_number", { p_num: 73, p_denom: 73, p_suffix: null, lim: 30 });
});
```

- [ ] **Step 2: Run to verify failure**

`pnpm --filter @pcg/web test -- search` → FAIL on the `toEqual`.

- [ ] **Step 3: Implement**

In `lib/search.ts` replace the interfaces and `hydrate`:
```ts
export interface PricePeek { medianUsd: number; nSales: number }
export interface SearchResult { id: string; nameEn: string | null; nameJa: string | null; setName: string; setCode: string | null; numberPrinted: string; language: "ja" | "en"; imageUrl: string | null; grades: { g10: PricePeek | null; g95: PricePeek | null; g9: PricePeek | null }; saleCount: number }
export type SearchOutcome = { results: SearchResult[] } | { redirectTo: string };

async function hydrate(db: SupabaseClient, hits: { id: string; sale_count: number }[]): Promise<SearchResult[]> {
  if (hits.length === 0) return [];
  const ids = hits.map((h) => h.id);
  const { data: products } = await db.from("products").select("id,name_en,name_ja,number_printed,language,image_url,sets(name_en,name_ja,printed_code)").in("id", ids);
  const { data: points } = await db.from("price_points").select("product_id,grade_value,median_usd,n_sales").eq("grade_label", "any").eq("window", "90d").in("grade_value", [10, 9.5, 9]).in("product_id", ids);
  const peek = new Map<string, PricePeek>();
  for (const p of (points ?? []) as { product_id: string; grade_value: number; median_usd: number; n_sales: number }[]) peek.set(`${p.product_id}|${Number(p.grade_value)}`, { medianUsd: Number(p.median_usd), nSales: p.n_sales });
  const byId = new Map((products ?? []).map((p: Record<string, unknown>) => [p.id as string, p]));
  return hits.flatMap((h) => {
    const p = byId.get(h.id) as { name_en: string | null; name_ja: string | null; number_printed: string; language: "ja" | "en"; image_url: string | null; sets: { name_en: string | null; name_ja: string | null; printed_code: string | null } } | undefined;
    if (!p) return [];
    return [{ id: h.id, nameEn: p.name_en, nameJa: p.name_ja, setName: p.sets?.name_en ?? p.sets?.name_ja ?? "", setCode: p.sets?.printed_code ?? null, numberPrinted: p.number_printed, language: p.language, imageUrl: p.image_url,
      grades: { g10: peek.get(`${h.id}|10`) ?? null, g95: peek.get(`${h.id}|9.5`) ?? null, g9: peek.get(`${h.id}|9`) ?? null }, saleCount: h.sale_count }];
  });
}
```
In the cert branch change the redirect to:
```ts
const tier = ["Flawless", "Pristine", "Gem Mint"].includes(cert.grade) ? cert.grade : "";
if (first) return { redirectTo: `/card/${encodeURIComponent(first.id)}?cert=${cert.gradedId}${cert.finalGrade != null ? `&cg=${cert.finalGrade}` : ""}${tier ? `&ct=${encodeURIComponent(tier)}` : ""}` };
```

- [ ] **Step 4: Run tests, typecheck, commit**

```bash
pnpm --filter @pcg/web test && pnpm typecheck
git add -A apps/web && git commit -m "feat(web): search results carry PCG 10 / 9.5 / 9 medians and set code; cert redirect passes grade"
```

---

### Task 6: Search results page

**Files:**
- Create: `apps/web/lib/constants.ts`, `apps/web/components/ResultRow.tsx`, `apps/web/components/ResultsList.tsx`
- Modify: `apps/web/app/search/page.tsx`

**Interfaces:**
- Consumes: `SearchResult` (Task 5), `GradeBadge`, `Price`, `Chip`, `ChipButton`, `ChipLink`, `SearchField`, `AppHeader`, `SiteFooter`.
- Produces: `ResultsList {results, query}` (client, language filter) and `ResultRow {r}`.

- [ ] **Step 1: ResultRow**

`components/ResultRow.tsx`:
```tsx
import Link from "next/link";
import Image from "next/image";
import type { SearchResult, PricePeek } from "@/lib/search";
import { GradeBadge } from "./GradeBadge";
import { Price } from "./Price";
import { Chip } from "./Chip";
function GradeCell({ grade, peek, dim }: { grade: number; peek: PricePeek | null; dim?: boolean }) {
  return (<div className={`flex items-center gap-2 ${dim ? "max-md:hidden" : ""}`}>
    <GradeBadge grade={grade} size={dim ? "sm" : "md"} />
    <div><Price value={peek ? peek.medianUsd : "—"} className={dim ? "text-[20px] !font-bold !wdth-100 text-mute" : "text-[20px]"} /><span className="mt-0.5 block text-[11.5px] font-medium text-mute">{peek ? `${peek.nSales} sale${peek.nSales === 1 ? "" : "s"}` : "none"}</span></div>
  </div>);
}
export function ResultRow({ r }: { r: SearchResult }) {
  const primary = r.language === "ja" ? r.nameJa ?? r.nameEn : r.nameEn ?? r.nameJa; const alt = r.language === "ja" ? r.nameEn : r.nameJa;
  return (
    <li><Link href={`/card/${encodeURIComponent(r.id)}`} className="grid grid-cols-[56px_1fr] items-center gap-3.5 rounded-[14px] border border-line-2 bg-surface p-3 px-3.5 no-underline transition-[border-color,transform] duration-150 ease-out hover:-translate-y-px hover:border-line md:grid-cols-[56px_1fr_auto]">
      {r.imageUrl ? <Image src={r.imageUrl} alt="" width={56} height={78} className="h-[78px] w-14 rounded-md object-cover" /> : <div className="h-[78px] w-14 rounded-md border border-dashed border-line bg-sunk" />}
      <div className="min-w-0">
        <div className="text-lg font-extrabold leading-[1.2] tracking-[-0.015em]">{primary}{alt && alt !== primary && <span className="ml-[7px] text-[14.5px] font-medium text-mute">{alt}</span>}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-mute"><span>{r.setName}</span>{r.setCode && <Chip>{r.setCode}</Chip>}<Chip variant="number">{r.numberPrinted}</Chip><Chip variant="lang">{r.language}</Chip></div>
      </div>
      <div className="col-span-full mt-0.5 flex gap-[18px] border-t border-line-2 pt-2.5 md:col-span-1 md:mt-0 md:gap-[26px] md:border-0 md:pt-0">
        <GradeCell grade={10} peek={r.grades.g10} /><GradeCell grade={9.5} peek={r.grades.g95} dim /><GradeCell grade={9} peek={r.grades.g9} dim />
      </div>
    </Link></li>);
}
```

- [ ] **Step 2: ResultsList with language filter and empty state**

`lib/constants.ts`:
```ts
export const TRY = ["205/165", "ナンジャモ", "Umbreon ex 161", "cert 000412873"];
```
`components/ResultsList.tsx`:
```tsx
"use client";
import { useState } from "react";
import type { SearchResult } from "@/lib/search";
import { ResultRow } from "./ResultRow";
import { ChipButton, ChipLink } from "./Chip";
import { TRY } from "@/lib/constants";
const LANGS = [{ v: "all", l: "All" }, { v: "ja", l: "Japanese" }, { v: "en", l: "English" }] as const;
export function ResultsList({ results, query }: { results: SearchResult[]; query: string }) {
  const [lang, setLang] = useState<"all" | "ja" | "en">("all");
  const shown = results.filter((r) => lang === "all" || r.language === lang);
  const n = results.length;
  return (<>
    <div className="mb-3.5 flex flex-wrap items-center gap-x-[18px] gap-y-2">
      <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em]">{query}<span className="ml-2.5 text-base font-semibold tracking-normal text-mute">{n === 0 ? "no matches" : `${n} printing${n === 1 ? "" : "s"}`}</span></h1>
      {n > 0 && <div className="ml-auto flex gap-1.5">{LANGS.map((o) => <ChipButton key={o.v} aria-pressed={lang === o.v} onClick={() => setLang(o.v)}>{o.l}</ChipButton>)}</div>}
    </div>
    {n === 0 ? (<div className="text-[15px] text-ink-2"><p className="m-0 mb-3.5">Nothing matched. Try the number as printed on the card, like 205/165, or the card name.</p><div className="flex flex-wrap items-center gap-1.5 text-[13.5px] text-mute"><span className="mr-1">Try</span>{TRY.map((t) => <ChipLink key={t} href={`/search?q=${encodeURIComponent(t)}`}>{t}</ChipLink>)}</div></div>)
    : (<><ul className="m-0 flex list-none flex-col gap-2 p-0">{shown.map((r) => <ResultRow key={r.id} r={r} />)}</ul>
      <p className="mt-3.5 text-[13.5px] text-mute">Medians over the last 90 days. Looking for another printing? Add the set code, like <a className="font-semibold text-teal" href={`/search?q=${encodeURIComponent(`${results[0]?.setCode ?? "SV2a"} ${results[0]?.numberPrinted.split("/")[0] ?? "205"}`)}`}>{results[0]?.setCode ?? "SV2a"} {results[0]?.numberPrinted.split("/")[0] ?? "205"}</a>, or search by name.</p></>)}
  </>);
}
```

- [ ] **Step 3: Page**

Replace the `<pre>` in `app/search/page.tsx` with `<ResultsList results={out.results} query={q} />` (import it). Keep the phone-only compact `SearchField` above it.

- [ ] **Step 4: Verify against the prototype**

Run `pnpm web`, open `/search?q=205/165` at 1280 and 390 wide, compare with the prototype's "Search results" tab on Desktop and Phone: heading + grey count, chips right on desktop, rows with 56×78 art, grade cells (only the 10 on phone). Test `/search?q=zzzz` shows the empty state with Try chips. Then:
```bash
pnpm typecheck && pnpm --filter @pcg/web lint && git add -A apps/web && git commit -m "feat(web): search results page with per-grade medians and language filter"
```

---

### Task 7: Home page

**Files:**
- Create: `apps/web/lib/home-data.ts`, `apps/web/components/StripCard.tsx`
- Modify: `apps/web/app/page.tsx`
- Test: `apps/web/test/home-data.test.ts`

**Interfaces:**
- Consumes: views from Task 4; `GradeBadge`, `Price`, `ChipLink`, `SectionHead`, `SearchField`, `AppHeader`, `SiteFooter`, `fmtDateShort`, `relativeTime`, `TRY` from `lib/constants.ts`.
- Produces: `loadHome(db) → { recent: RecentSale[]; sets: SetRow[]; setTotal: number; updatedAt: string | null }`; `RecentSale { id, productId, name, setLine, imageUrl, gradeValue, gradeLabel, priceUsd, source, soldAt }`; `sourceName(source)`.

- [ ] **Step 1: Failing test for the pure mappers**

`test/home-data.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { toRecentSale, sourceName, setLine } from "../lib/home-data";
describe("home-data", () => {
  it("maps a recent sale row", () => {
    const s = toRecentSale({ id: "1", product_id: "sv2a-205", name_en: "Mew ex", name_ja: "ミュウex", number_printed: "205/165", image_url: null, set_code: "SV2a", set_name_en: null, set_name_ja: "ポケモンカード151", language: "ja", grade_value: 10, grade_label: "Gem Mint", price: 62000, currency: "JPY", price_usd: 418.2, sold_at: "2026-09-19T00:00:00Z", source: "soldcomps" });
    expect(s).toEqual({ id: "1", productId: "sv2a-205", name: "ミュウex", setLine: "SV2a 205/165 · 19 Sept", imageUrl: null, gradeValue: 10, gradeLabel: "Gem Mint", priceUsd: 418.2, source: "eBay", soldAt: "2026-09-19T00:00:00Z" });
  });
  it("names sources", () => { expect(sourceName("yahoo_auc")).toBe("Yahoo!"); expect(sourceName("thecardapi")).toBe("eBay"); });
  it("falls back to set name when there is no code", () => { expect(setLine({ set_code: null, set_name_en: "Paldean Fates", set_name_ja: null, number_printed: "006/091", sold_at: "2026-09-16T00:00:00Z" })).toBe("Paldean Fates 006/091 · 16 Sept"); });
});
```
Run `pnpm --filter @pcg/web test -- home-data` → FAIL (module missing).

- [ ] **Step 2: Implement `lib/home-data.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtDateShort } from "./format";
export interface RecentRow { id: string; product_id: string; name_en: string | null; name_ja: string | null; number_printed: string; image_url: string | null; set_code: string | null; set_name_en: string | null; set_name_ja: string | null; language: "ja" | "en"; grade_value: number; grade_label: string | null; price: number; currency: string; price_usd: number | null; sold_at: string; source: string }
export interface RecentSale { id: string; productId: string; name: string; setLine: string; imageUrl: string | null; gradeValue: number; gradeLabel: string | null; priceUsd: number | null; source: string; soldAt: string }
export interface SetRow { id: string; name_en: string | null; name_ja: string | null; printed_code: string | null; language: "ja" | "en"; sale_count: number }
const SOURCES: Record<string, string> = { thecardapi: "eBay", soldcomps: "eBay", yahoo_auc: "Yahoo!" };
export const sourceName = (s: string) => SOURCES[s] ?? s;
export function setLine(r: Pick<RecentRow, "set_code" | "set_name_en" | "set_name_ja" | "number_printed" | "sold_at">) {
  const head = r.set_code ?? r.set_name_en ?? r.set_name_ja ?? ""; return `${head} ${r.number_printed} · ${fmtDateShort(r.sold_at)}`;
}
export function toRecentSale(r: RecentRow): RecentSale {
  return { id: r.id, productId: r.product_id, name: (r.language === "ja" ? r.name_ja ?? r.name_en : r.name_en ?? r.name_ja) ?? r.product_id, setLine: setLine(r), imageUrl: r.image_url,
    gradeValue: Number(r.grade_value), gradeLabel: r.grade_label && r.grade_label !== "any" ? r.grade_label : null, priceUsd: r.price_usd == null ? null : Number(r.price_usd), source: sourceName(r.source), soldAt: r.sold_at };
}
export async function loadHome(db: SupabaseClient) {
  const [{ data: recent }, { data: sets }, { count }] = await Promise.all([
    db.from("public_recent_sales").select("*").order("sold_at", { ascending: false }).limit(12),
    db.from("set_sale_counts").select("*").order("sale_count", { ascending: false }).limit(6),
    db.from("sets").select("id", { count: "exact", head: true }),
  ]);
  const rows = ((recent ?? []) as RecentRow[]).map(toRecentSale);
  let setRows = (sets ?? []) as SetRow[];
  if (setRows.length === 0) { const { data } = await db.from("sets").select("id,name_en,name_ja,printed_code,language").order("release_date", { ascending: false }).limit(6); setRows = ((data ?? []) as Omit<SetRow, "sale_count">[]).map((s) => ({ ...s, sale_count: 0 })); }
  return { recent: rows, sets: setRows, setTotal: count ?? 0, updatedAt: rows[0]?.soldAt ?? null };
}
```
Run the test → PASS.

- [ ] **Step 3: StripCard**

`components/StripCard.tsx`:
```tsx
import Link from "next/link";
import Image from "next/image";
import type { RecentSale } from "@/lib/home-data";
import { GradeBadge } from "./GradeBadge";
import { Price } from "./Price";
export function StripCard({ s }: { s: RecentSale }) {
  return (<li className="w-[158px] shrink-0 snap-start"><Link href={`/card/${encodeURIComponent(s.productId)}`} className="block no-underline transition-transform duration-[180ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1">
    <div className="relative">
      {s.imageUrl ? <Image src={s.imageUrl} alt="" width={158} height={221} className="block aspect-[63/88] w-full rounded-[10px] object-cover shadow-object" /> : <div className="aspect-[63/88] w-full rounded-[10px] border border-dashed border-line bg-sunk" />}
      <span className="absolute -right-2 -top-2 shadow-[0_2px_6px_rgba(0,0,0,.25)] rounded-lg"><GradeBadge grade={s.gradeValue} /></span>
      <span className="absolute -left-1.5 bottom-3 -rotate-3 rounded-[7px] bg-surface px-[9px] pt-[5px] pb-1 text-ink shadow-[0_3px_10px_rgba(0,0,0,.22)]"><Price value={s.priceUsd ?? "—"} className="text-lg" /><span className="mt-px block text-[10px] font-bold tracking-[0.02em] text-mute">{[s.gradeLabel, s.source].filter(Boolean).join(" · ")}</span></span>
    </div>
    <div className="mt-3 truncate text-[14.5px] font-bold leading-[1.25] tracking-[-0.01em]">{s.name}</div>
    <div className="mt-0.5 truncate text-[12.5px] text-mute">{s.setLine}</div>
  </Link></li>);
}
```

- [ ] **Step 4: Home page**

`app/page.tsx`:
```tsx
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SearchField } from "@/components/SearchField";
import { SectionHead } from "@/components/SectionHead";
import { StripCard } from "@/components/StripCard";
import { ChipLink } from "@/components/Chip";
import { TRY } from "@/lib/constants";
import { anonClient } from "@/lib/supabase-server";
import { loadHome } from "@/lib/home-data";
import { relativeTime } from "@/lib/format";
export const revalidate = 900;
export default async function Home() {
  const { recent, sets, setTotal, updatedAt } = await loadHome(anonClient());
  return (<>
    <AppHeader variant="public" search={{ show: false }} />
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10">
      <section className="max-w-[760px] pt-[30px] pb-1.5">
        <h1 className="m-0 mb-3.5 text-[clamp(34px,5.6vw,56px)] font-extrabold leading-none tracking-[-0.03em] wdth-104 text-balance">What&apos;s your PCG slab <b className="font-extrabold text-gold">actually</b> worth?</h1>
        <p className="m-0 mb-[22px] max-w-[52ch] text-[17px] text-ink-2">Real sold prices for PCG-graded Pokémon cards, pulled from eBay and Yahoo! Auctions and matched to the exact printing. No asking prices, no guesses.</p>
        <SearchField variant="hero" autoFocus className="max-w-[680px]" />
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5 text-[13.5px] text-mute"><span className="mr-1">Try</span>{TRY.map((t) => <ChipLink key={t} href={`/search?q=${encodeURIComponent(t)}`}>{t}</ChipLink>)}</div>
      </section>
      <section className="mt-11">
        <SectionHead title="Just sold" aside={updatedAt ? `Updated ${relativeTime(updatedAt)}` : undefined} />
        {recent.length === 0 ? <p className="m-0 text-[13.5px] text-mute">No PCG sales recorded yet. Search a card to see its catalogue entry.</p>
          : <ul className="no-scrollbar -mx-5 -mt-2 flex list-none snap-x snap-mandatory gap-[18px] overflow-x-auto px-7 pt-3.5 pb-4 [scroll-padding-inline:28px]">{recent.map((s) => <StripCard key={s.id} s={s} />)}</ul>}
      </section>
      <div className="mt-9 grid grid-cols-1 gap-9 md:grid-cols-[3fr_2fr] md:gap-14">
        <section>
          <SectionHead title="Browse by set" aside="Most sales first" />
          <ul className="m-0 grid list-none grid-cols-1 gap-1.5 p-0 md:grid-cols-2">
            {sets.map((s) => (<li key={s.id}><a href={`/search?q=${encodeURIComponent(s.printed_code ?? s.name_en ?? s.name_ja ?? "")}`} className="grid grid-cols-[1fr_auto] items-center gap-x-2.5 rounded-[10px] border border-line-2 bg-surface px-3 py-2.5 no-underline transition-colors hover:border-line">
              <span className="text-[15px] font-bold leading-[1.25]">{s.name_ja ?? s.name_en}</span>
              {s.sale_count > 0 && <span className="col-start-2 row-span-2 rounded-full bg-sunk px-[9px] py-0.5 text-[12.5px] font-bold text-ink-2 tnum">{s.sale_count}</span>}
              <span className="text-[12.5px] text-mute">{[s.printed_code, s.language === "ja" ? "Japanese" : "English"].filter(Boolean).join(" · ")}</span>
            </a></li>))}
            <li className="md:col-span-2"><a href="/search" className="block px-3 py-2.5 text-[13.5px] font-semibold text-teal no-underline">All {setTotal.toLocaleString("en-US")} sets →</a></li>
          </ul>
        </section>
        <section>
          <SectionHead title="How it works" />
          <div className="grid gap-3.5 text-sm text-mute">
            <div><b className="mb-0.5 block font-bold text-ink">Medians, not asking prices</b>Every number is the median of real PCG slab sales matched to this exact printing.</div>
            <div><b className="mb-0.5 block font-bold text-ink">Yen and dollars, one number</b>Yen sales are converted to USD at the ECB rate on the day they sold.</div>
            <div><b className="mb-0.5 block font-bold text-ink">You see the confidence</b>A green dot means enough sales to trust the median. Grey means one or two.</div>
          </div>
        </section>
      </div>
    </main>
    <SiteFooter />
  </>);
}
```
Set names: the prototype shows the Japanese name for JA sets and the English name for EN sets; `s.name_ja ?? s.name_en` gives that.

- [ ] **Step 5: Verify and commit**

Compare `/` at 1280 and 390 against the prototype Home tab (hero, strip with stickers and badges overlapping the art, 28px strip gutter on phone, two-column browse tiles on desktop). Then:
```bash
pnpm --filter @pcg/web test && pnpm typecheck && pnpm --filter @pcg/web lint
git add -A apps/web && git commit -m "feat(web): home page with hero, just-sold strip, browse by set"
```

---

### Task 8: Grade logic (pure functions) and card data loader

**Files:**
- Create: `apps/web/lib/grades.ts`, `apps/web/test/grades.test.ts`
- Modify: `apps/web/lib/card-data.ts` (drop `gridColumns`, keep `loadCard`, add `rarity`, `release_date`, `card_count`, `printed_code` to the selects)
- Delete: `apps/web/test/card-data.test.ts`

**Interfaces:**
- Produces:
```ts
export type Window = "30d" | "90d" | "180d" | "all";
export const WINDOWS: { value: Window; label: string; days: number | null; text: string }[]; // labels 30d/90d/180d/All; text "30 days"/"90 days"/"180 days"/"all time"
export type GradeKey = string; // "10fl" | "10pr" | "10gm" | "10" | "95" | "9" | "85" | "8" | ...
export interface GradeOption { key: GradeKey; gradeValue: number; tier: string | null; label: string; nSales: number; medianUsd: number; minUsd: number; maxUsd: number; confidence: "high" | "med" | "low"; lastSoldAt: string }
export function gradeKey(gradeValue: number, tier: string | null): GradeKey
export function gradeLabel(gradeValue: number, tier: string | null): string // "PCG 10 Gem Mint", "PCG 10 · all tiers", "PCG 9.5"
export function gradeOptions(points: PricePointRow[], window: Window): GradeOption[]
export function defaultGradeKey(options: GradeOption[]): GradeKey | null
export function salesFor(sales: SaleRow[], opt: GradeOption, window: Window, now: Date): SaleRow[] // newest first
export function deltaPct(sales: SaleRow[], opt: GradeOption, window: Window, now: Date): number | null
export function rollingMedian(sales: SaleRow[]): { t: number; v: number }[] // oldest first, t = ms since epoch, non-best-offer only
export function niceStep(max: number): number
```
`PricePointRow` and `SaleRow` are the existing types in `lib/card-data.ts`.

- [ ] **Step 1: Failing tests**

`test/grades.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { gradeOptions, defaultGradeKey, salesFor, deltaPct, rollingMedian, niceStep, gradeKey, gradeLabel } from "../lib/grades";
import type { PricePointRow, SaleRow } from "../lib/card-data";
const pt = (grade_value: number, grade_label: string, n_sales: number, window = "90d"): PricePointRow => ({ product_id: "x", grade_value, grade_label, window, n_sales, median_usd: 100, min_usd: 90, max_usd: 110, last_sold_at: "2026-09-01", confidence: "med" });
const now = new Date("2026-09-21T00:00:00Z");
const sale = (daysAgo: number, usd: number, grade: number, label: string | null = null, bo = false): SaleRow => ({ id: `${daysAgo}-${usd}`, grade_value: grade, grade_label: label, price: usd, currency: "USD", price_usd: usd, sold_at: new Date(now.getTime() - daysAgo * 86400000).toISOString(), source: "soldcomps", url: "#", is_best_offer: bo });

describe("grade options", () => {
  it("orders 10 tiers first, includes 'all tiers' only when unlabelled 10s exist, then lower grades", () => {
    const opts = gradeOptions([pt(10, "any", 5), pt(10, "Gem Mint", 3), pt(10, "Pristine", 1), pt(9.5, "any", 4), pt(9, "any", 0), pt(8, "any", 2)], "90d");
    expect(opts.map((o) => o.key)).toEqual(["10pr", "10gm", "10", "95", "8"]);
    expect(opts[2]!.label).toBe("PCG 10 · all tiers"); expect(opts[2]!.nSales).toBe(5);
  });
  it("omits 'all tiers' when every 10 is labelled", () => {
    expect(gradeOptions([pt(10, "any", 3), pt(10, "Gem Mint", 3)], "90d").map((o) => o.key)).toEqual(["10gm"]);
  });
  it("ignores other windows", () => { expect(gradeOptions([pt(10, "any", 3, "30d")], "90d")).toEqual([]); });
  it("defaults to 10gm, then 10, then most sales", () => {
    expect(defaultGradeKey(gradeOptions([pt(10, "any", 2), pt(10, "Gem Mint", 1), pt(9, "any", 9)], "90d"))).toBe("10gm");
    expect(defaultGradeKey(gradeOptions([pt(10, "any", 2), pt(9, "any", 9)], "90d"))).toBe("10");
    expect(defaultGradeKey(gradeOptions([pt(9.5, "any", 2), pt(9, "any", 9)], "90d"))).toBe("9");
    expect(defaultGradeKey([])).toBeNull();
  });
  it("keys and labels", () => { expect(gradeKey(9.5, null)).toBe("95"); expect(gradeKey(10, "Gem Mint")).toBe("10gm"); expect(gradeLabel(9.5, null)).toBe("PCG 9.5"); expect(gradeLabel(10, "Flawless")).toBe("PCG 10 Flawless"); });
});
describe("sales filtering and delta", () => {
  const opt = gradeOptions([pt(10, "Gem Mint", 4)], "90d")[0]!;
  const sales = [sale(5, 400, 10, "Gem Mint"), sale(50, 420, 10, "Gem Mint"), sale(80, 380, 10, "Gem Mint", true), sale(100, 300, 10, "Gem Mint"), sale(120, 310, 10, "Gem Mint"), sale(150, 290, 10, "Gem Mint"), sale(10, 200, 9.5)];
  it("filters by grade, tier and window, newest first", () => { expect(salesFor(sales, opt, "90d", now).map((s) => s.price_usd)).toEqual([400, 420, 380]); });
  it("'all tiers' option takes every 10 in the window", () => {
    const all = gradeOptions([pt(10, "any", 4)], "90d")[0]!; expect(salesFor([...sales, sale(3, 999, 10, null)], all, "90d", now)).toHaveLength(4);
  });
  it("delta compares medians of this window and the previous one, ignoring best offers, null under 3 sales", () => {
    expect(deltaPct(sales, opt, "90d", now)).toBeNull(); // this window has only 2 non-best-offer sales
    const more = [...sales, sale(20, 410, 10, "Gem Mint")];
    expect(deltaPct(more, opt, "90d", now)).toBeCloseTo(((410 - 300) / 300) * 100, 5);
    expect(deltaPct(more, opt, "all", now)).toBeNull();
  });
  it("rolling median uses up to 4 points, oldest first, skipping best offers", () => {
    const r = rollingMedian([sale(1, 500, 10), sale(2, 100, 10, null, true), sale(3, 300, 10), sale(4, 200, 10)]);
    expect(r.map((p) => p.v)).toEqual([200, 250, 300]);
    expect(r[0]!.t).toBeLessThan(r[1]!.t);
  });
  it("nice steps", () => { expect(niceStep(418)).toBe(200); expect(niceStep(1240)).toBe(500); expect(niceStep(74)).toBe(25); });
});
```
Run `pnpm --filter @pcg/web test -- grades` → FAIL (module missing).

- [ ] **Step 2: Implement `lib/grades.ts`**

```ts
import type { PricePointRow, SaleRow } from "./card-data";
export type Window = "30d" | "90d" | "180d" | "all";
export const WINDOWS: { value: Window; label: string; days: number | null; text: string }[] = [
  { value: "30d", label: "30d", days: 30, text: "30 days" }, { value: "90d", label: "90d", days: 90, text: "90 days" }, { value: "180d", label: "180d", days: 180, text: "180 days" }, { value: "all", label: "All", days: null, text: "all time" },
];
export const isWindow = (w: unknown): w is Window => WINDOWS.some((x) => x.value === w);
export type GradeKey = string;
export interface GradeOption { key: GradeKey; gradeValue: number; tier: string | null; label: string; nSales: number; medianUsd: number; minUsd: number; maxUsd: number; confidence: "high" | "med" | "low"; lastSoldAt: string }
const TIER_KEYS: Record<string, string> = { Flawless: "fl", Pristine: "pr", "Gem Mint": "gm" };
const TIER_ORDER = ["Flawless", "Pristine", "Gem Mint"];
export const gradeKey = (g: number, tier: string | null) => `${String(g).replace(".", "")}${tier ? TIER_KEYS[tier] ?? "" : ""}`;
export const gradeLabel = (g: number, tier: string | null, allTiers = false) => tier ? `PCG ${g} ${tier}` : allTiers ? `PCG ${g} · all tiers` : `PCG ${g}`;

export function gradeOptions(points: PricePointRow[], window: Window): GradeOption[] {
  const inWin = points.filter((p) => p.window === window && p.n_sales > 0);
  const mk = (p: PricePointRow, tier: string | null, allTiers = false): GradeOption => ({ key: gradeKey(Number(p.grade_value), tier), gradeValue: Number(p.grade_value), tier, label: gradeLabel(Number(p.grade_value), tier, allTiers), nSales: p.n_sales, medianUsd: Number(p.median_usd), minUsd: Number(p.min_usd), maxUsd: Number(p.max_usd), confidence: p.confidence, lastSoldAt: p.last_sold_at });
  const out: GradeOption[] = [];
  const tens = inWin.filter((p) => Number(p.grade_value) === 10);
  for (const t of TIER_ORDER) { const p = tens.find((x) => x.grade_label === t); if (p) out.push(mk(p, t)); }
  const any10 = tens.find((p) => p.grade_label === "any");
  if (any10 && any10.n_sales > tens.filter((p) => p.grade_label !== "any").reduce((n, p) => n + p.n_sales, 0)) out.push(mk(any10, null, true));
  for (const p of inWin.filter((p) => Number(p.grade_value) < 10 && p.grade_label === "any").sort((a, b) => Number(b.grade_value) - Number(a.grade_value))) out.push(mk(p, null));
  return out;
}
export function defaultGradeKey(options: GradeOption[]): GradeKey | null {
  if (options.length === 0) return null;
  return options.find((o) => o.key === "10gm")?.key ?? options.find((o) => o.key === "10")?.key ?? [...options].sort((a, b) => b.nSales - a.nSales)[0]!.key;
}
const inRange = (s: SaleRow, from: number, to: number) => { if (!s.sold_at) return false; const t = new Date(s.sold_at).getTime(); return t > from && t <= to; };
const matches = (s: SaleRow, o: GradeOption) => Number(s.grade_value) === o.gradeValue && (o.tier == null || s.grade_label === o.tier);
function bounds(window: Window, now: Date, previous = false): [number, number] {
  const days = WINDOWS.find((w) => w.value === window)!.days;
  if (days == null) return [-Infinity, previous ? -Infinity : now.getTime()];
  const to = now.getTime() - (previous ? days : 0) * 86400000; return [to - days * 86400000, to];
}
export function salesFor(sales: SaleRow[], opt: GradeOption, window: Window, now: Date): SaleRow[] {
  const [from, to] = bounds(window, now);
  return sales.filter((s) => matches(s, opt) && inRange(s, from, to)).sort((a, b) => new Date(b.sold_at!).getTime() - new Date(a.sold_at!).getTime());
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
export function deltaPct(sales: SaleRow[], opt: GradeOption, window: Window, now: Date): number | null {
  if (window === "all") return null;
  const usd = (from: number, to: number) => sales.filter((s) => matches(s, opt) && !s.is_best_offer && s.price_usd != null && inRange(s, from, to)).map((s) => Number(s.price_usd));
  const cur = usd(...bounds(window, now)), prev = usd(...bounds(window, now, true));
  if (cur.length < 3 || prev.length < 3) return null;
  const a = median(cur), b = median(prev); return b === 0 ? null : ((a - b) / b) * 100;
}
export function rollingMedian(sales: SaleRow[]): { t: number; v: number }[] {
  const pts = sales.filter((s) => !s.is_best_offer && s.price_usd != null && s.sold_at).map((s) => ({ t: new Date(s.sold_at!).getTime(), p: Number(s.price_usd) })).sort((a, b) => a.t - b.t);
  return pts.map((p, i) => ({ t: p.t, v: median(pts.slice(Math.max(0, i - 3), i + 1).map((q) => q.p)) }));
}
export function niceStep(max: number): number { return [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((s) => s * 4 >= max * 1.15) ?? 10000; }
```
Note the "all tiers" rule: include it only when the `any` count exceeds the sum of the tier counts, which is exactly "unlabelled 10 sales exist". Check the test's first case: any=5, tiers 3+1=4 → included; second case 3 vs 3 → omitted. Also `niceStep(74)`: 25×4=100 ≥ 85.1 → 25.

- [ ] **Step 3: Run tests → PASS. Update `lib/card-data.ts`**

Remove `gridColumns`, `GridColumn`, the `TIERS` and `gradeLabelText` imports. Extend the selects:
```ts
product: { id: string; name_en: string | null; name_ja: string | null; number_printed: string; language: "ja" | "en"; image_url: string | null; rarity: string | null };
set: { id: string; name_en: string | null; name_ja: string | null; printed_code: string | null; release_date: string | null; card_count: number | null };
```
and in `loadCard` select `"id,name_en,name_ja,number_printed,language,image_url,rarity,sets(id,name_en,name_ja,printed_code,release_date,card_count)"`; raise the sales limit to 500. Delete `test/card-data.test.ts`.

- [ ] **Step 4: Commit**

```bash
pnpm --filter @pcg/web test && pnpm typecheck
git add -A apps/web && git commit -m "feat(web): grade options, window bounds, delta and rolling median as pure functions"
```

---

### Task 9: GradeSelect (popover on desktop, drawer on phone)

**Files:**
- Create: `apps/web/lib/use-media-query.ts`, `apps/web/components/GradeSelect.tsx`

**Interfaces:**
- Consumes: `GradeOption`, shadcn `Popover`/`Drawer`, `GradeBadge`.
- Produces: `GradeSelect {options, value, onChange}` (client).

- [ ] **Step 1: Hook**

`lib/use-media-query.ts`:
```ts
"use client";
import { useEffect, useState } from "react";
export function useMediaQuery(query: string, initial = false) {
  const [m, setM] = useState(initial);
  useEffect(() => { const mq = window.matchMedia(query); const on = () => setM(mq.matches); on(); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, [query]);
  return m;
}
```

- [ ] **Step 2: Component**

`components/GradeSelect.tsx`:
```tsx
"use client";
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { GradeBadge } from "./GradeBadge";
import type { GradeOption } from "@/lib/grades";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
function Option({ o, selected, onPick, tall }: { o: GradeOption; selected: boolean; onPick: () => void; tall?: boolean }) {
  return (<button type="button" role="option" aria-selected={selected} onClick={onPick} className={cn("flex w-full items-center gap-2.5 rounded-[9px] py-1.5 pl-2 pr-2.5 text-left text-[15px] font-bold text-ink hover:bg-sunk focus-visible:bg-sunk", tall && "min-h-[52px] text-base", !tall && "min-h-12", selected && "bg-sunk")}>
    <GradeBadge grade={o.gradeValue} /><span>{o.label}</span><span className="ml-auto text-[13.5px] font-medium text-mute tnum">{o.nSales} sales</span><Check size={18} className={cn("shrink-0 text-teal", !selected && "invisible")} />
  </button>);
}
export function GradeSelect({ options, value, onChange }: { options: GradeOption[]; value: string; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const desktop = useMediaQuery("(min-width: 768px)", true);
  const cur = options.find((o) => o.key === value) ?? options[0];
  if (!cur) return null;
  const pick = (k: string) => { onChange(k); setOpen(false); };
  const trigger = (<button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} className={cn("flex w-full max-w-[360px] items-center gap-2.5 rounded-xl border border-line bg-surface py-1.5 pl-2 pr-3 text-left text-[15px] font-bold text-ink shadow-[0_1px_2px_rgba(0,0,0,.06)] transition-colors min-h-[52px] hover:border-mute", open && "border-teal ring-[3px] ring-teal-soft")}>
    <GradeBadge grade={cur.gradeValue} /><span>{cur.label}</span><span className="text-[13.5px] font-medium text-mute tnum">{cur.nSales} sales</span><ChevronDown size={18} className={cn("ml-auto text-mute transition-transform duration-[180ms]", open && "rotate-180")} />
  </button>);
  if (desktop) return (<Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>{trigger}</PopoverTrigger><PopoverContent align="start" sideOffset={6} className="w-[var(--radix-popover-trigger-width)] flex flex-col gap-0.5" role="listbox" aria-label="Grade">{options.map((o) => <Option key={o.key} o={o} selected={o.key === cur.key} onPick={() => pick(o.key)} />)}</PopoverContent></Popover>);
  return (<>{trigger}<Drawer open={open} onOpenChange={setOpen}><DrawerContent>
    <div className="flex items-center justify-between px-1.5 pb-2 text-[17px] font-extrabold tracking-[-0.01em]"><DrawerTitle className="m-0 text-[17px] font-extrabold">Grade</DrawerTitle><DrawerClose className="min-h-10 px-1.5 text-[15px] font-bold text-teal">Done</DrawerClose></div>
    <div role="listbox" aria-label="Grade" className="flex flex-col gap-0.5">{options.map((o) => <Option key={o.key} o={o} tall selected={o.key === cur.key} onPick={() => pick(o.key)} />)}</div>
  </DrawerContent></Drawer></>);
}
```
The shadcn drawer content must not render its own `DrawerHeader`; keep the handle it ships with. If the generated `DrawerContent` wraps children in a `div` with padding, remove that padding so the classes from Task 1 apply.

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm typecheck && git add -A apps/web && git commit -m "feat(web): GradeSelect with popover on desktop and drawer on phone"
```

---

### Task 10: Sparkline and PriceChart (recharts)

**Files:**
- Create: `apps/web/components/Sparkline.tsx`, `apps/web/components/PriceChart.tsx` (replace existing)

**Interfaces:**
- Consumes: `rollingMedian`, `niceStep`, `SaleRow`, `Window`.
- Produces: `Sparkline {sales, gold, window}` and `PriceChart {sales, gold, window, now}` (both client). Colour: `gold` true → `var(--gold-badge)` / `var(--gold-fill)`, false → `var(--accent)` / `var(--accent-soft)`.

- [ ] **Step 1: Sparkline**

```tsx
"use client";
import { Area, AreaChart, ReferenceDot, ResponsiveContainer, YAxis } from "recharts";
import type { SaleRow } from "@/lib/card-data";
import { rollingMedian, WINDOWS, type Window } from "@/lib/grades";
export function Sparkline({ sales, gold, window }: { sales: SaleRow[]; gold: boolean; window: Window }) {
  const pts = rollingMedian(sales);
  const w = WINDOWS.find((x) => x.value === window)!;
  if (pts.length < 3) return <div className="flex h-16 items-center justify-center text-[11.5px] font-medium text-mute">Not enough sales for a trend</div>;
  const stroke = gold ? "var(--gold-badge)" : "var(--accent)", fill = gold ? "var(--gold-fill)" : "var(--accent-soft)";
  const last = pts[pts.length - 1]!; const lo = Math.min(...pts.map((p) => p.v)) * 0.94, hi = Math.max(...pts.map((p) => p.v)) * 1.06;
  const first = new Date(pts[0]!.t).toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  return (<div>
    <div className="h-16"><ResponsiveContainer width="100%" height="100%"><AreaChart data={pts} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
      <YAxis hide domain={[lo, hi]} /><Area type="monotone" dataKey="v" stroke={stroke} strokeWidth={2.5} fill={fill} fillOpacity={1} dot={false} isAnimationActive={false} />
      <ReferenceDot x={pts.length - 1} y={last.v} r={4} fill={stroke} stroke="var(--surface)" strokeWidth={2} ifOverflow="visible" />
    </AreaChart></ResponsiveContainer></div>
    <div className="mt-1 flex justify-between text-[11.5px] font-medium text-mute"><span>{first}</span><span>vs previous {w.text}</span><span>Today</span></div>
  </div>);
}
```
`ReferenceDot x` uses the category index because `AreaChart` without an `XAxis` treats data as categorical. If the dot does not land on the line, add `<XAxis hide dataKey="t" type="number" domain={["dataMin","dataMax"]} />` and set `x={last.t}`.

- [ ] **Step 2: PriceChart**

Overwrite `components/PriceChart.tsx`:
```tsx
"use client";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, XAxis, YAxis, LabelList } from "recharts";
import type { SaleRow } from "@/lib/card-data";
import { niceStep, rollingMedian, WINDOWS, type Window } from "@/lib/grades";
import { fmtUsd } from "@/lib/format";
const label = { fontSize: 11, fontWeight: 600, fill: "var(--muted)", fontFamily: "inherit" } as const;
export function PriceChart({ sales, gold, window, now }: { sales: SaleRow[]; gold: boolean; window: Window; now: Date }) {
  const usable = sales.filter((s) => s.sold_at && s.price_usd != null);
  if (usable.length === 0) return null;
  const c = gold ? "var(--gold-badge)" : "var(--accent)";
  const days = WINDOWS.find((x) => x.value === window)!.days;
  const t0 = days == null ? Math.min(...usable.map((s) => new Date(s.sold_at!).getTime())) : now.getTime() - days * 86400000;
  const dots = usable.map((s) => ({ t: new Date(s.sold_at!).getTime(), v: Number(s.price_usd), bo: s.is_best_offer })).sort((a, b) => a.t - b.t);
  const line = rollingMedian(usable);
  const step = niceStep(Math.max(...dots.map((d) => d.v))); const maxY = step * 4;
  const last = dots[dots.length - 1]!;
  const months: number[] = []; for (const d = new Date(t0); d.getTime() < now.getTime(); d.setUTCMonth(d.getUTCMonth() + 1, 1)) if (d.getTime() > t0) months.push(d.getTime());
  const ticks = [t0, ...months, now.getTime()];
  const tick = (t: number) => t === t0 ? new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : t === now.getTime() ? "Today" : new Date(t).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return (<div className="h-[190px] md:h-[230px]"><ResponsiveContainer width="100%" height="100%">
    <ComposedChart margin={{ top: 14, right: 12, bottom: 4, left: 0 }}>
      <CartesianGrid vertical={false} stroke="var(--line-2)" />
      <XAxis dataKey="t" type="number" domain={[t0, now.getTime()]} ticks={ticks} tickFormatter={tick} tick={label} axisLine={false} tickLine={false} />
      <YAxis dataKey="v" type="number" domain={[0, maxY]} ticks={[0, step, step * 2, step * 3, maxY]} tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 ? 2 : 0).replace(/\.?0+$/, "")}k` : `$${v}`} tick={label} axisLine={false} tickLine={false} width={44} />
      <Line data={line} dataKey="v" type="linear" stroke={c} strokeWidth={2.5} dot={false} isAnimationActive={false} />
      <Scatter data={dots.filter((d) => !d.bo)} dataKey="v" fill={c} stroke="var(--ground)" strokeWidth={1.5} isAnimationActive={false} shape={(p: { cx: number; cy: number; payload: { t: number } }) => <circle cx={p.cx} cy={p.cy} r={p.payload.t === last.t ? 6 : 4.5} fill={c} stroke="var(--ground)" strokeWidth={1.5} />}>
        <LabelList dataKey="v" content={(p: { x?: number; y?: number; value?: number; index?: number }) => p.index === dots.filter((d) => !d.bo).length - 1 && !last.bo ? <text x={(p.x ?? 0) + 2} y={(p.y ?? 0) + 24} textAnchor="end" fontSize={14} fontWeight={800} fill="var(--ink)">{fmtUsd(p.value ?? 0)}</text> : null} />
      </Scatter>
      <Scatter data={dots.filter((d) => d.bo)} dataKey="v" isAnimationActive={false} shape={(p: { cx: number; cy: number }) => <circle cx={p.cx} cy={p.cy} r={4.5} fill="var(--surface)" stroke={c} strokeWidth={2} />} />
    </ComposedChart>
  </ResponsiveContainer></div>);
}
```
`Line` and `Scatter` each take their own `data`; the `ComposedChart` has none. Both share the numeric `t` axis.

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm typecheck && git add -A apps/web && git commit -m "feat(web): recharts Sparkline and PriceChart styled to the prototype"
```

---

### Task 11: Card page assembly

**Files:**
- Create: `apps/web/components/GuideBox.tsx`, `apps/web/components/SalesList.tsx`, `apps/web/components/CardView.tsx`
- Modify: `apps/web/app/card/[id]/page.tsx`
- Delete: `apps/web/components/PriceGrid.tsx`, `apps/web/components/SoldList.tsx`

**Interfaces:**
- Consumes: `loadCard`, `gradeOptions`, `defaultGradeKey`, `salesFor`, `deltaPct`, `WINDOWS`, `isWindow`, `GradeSelect`, `Sparkline`, `PriceChart`, `Segmented`, `GradeBadge`, `Price`, `Chip`, `Delta`, `SectionHead`, `fmtDateLong`, `fmtNative`.
- Produces: `CardView {data, initialGrade, initialWindow, cert}` (client) which owns `?g=` and `?w=`.

- [ ] **Step 1: GuideBox**

`components/GuideBox.tsx`:
```tsx
"use client";
import type { GradeOption, Window } from "@/lib/grades";
import { WINDOWS, deltaPct, salesFor } from "@/lib/grades";
import type { SaleRow } from "@/lib/card-data";
import { GradeBadge } from "./GradeBadge";
import { Price } from "./Price";
import { Delta } from "./Delta";
import { Sparkline } from "./Sparkline";
import { fmtDateLong, fmtNative, fmtUsd } from "@/lib/format";
export function GuideBox({ opt, sales, allOptions, window, now }: { opt: GradeOption; sales: SaleRow[]; allOptions: GradeOption[]; window: Window; now: Date }) {
  const w = WINDOWS.find((x) => x.value === window)!;
  const mine = salesFor(sales, opt, window, now); const last = mine[0];
  const most = [...allOptions].sort((a, b) => b.nSales - a.nSales)[0]?.key === opt.key;
  const dotCls = opt.confidence === "high" ? "bg-good" : opt.confidence === "med" ? "bg-warn" : "bg-line";
  return (<div className="grid grid-cols-1 gap-4 rounded-[18px] border border-line-2 bg-surface px-[22px] py-5 shadow-object md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
    <div>
      <div className="flex flex-wrap items-center gap-2.5 text-sm font-semibold text-ink-2"><GradeBadge grade={opt.gradeValue} size="lg" tier={opt.tier} tierClass="text-sm" />{!opt.tier && opt.label.includes("all tiers") && <span className="text-sm font-bold text-gold">all tiers</span>}{most && <span className="font-medium text-mute">most traded grade</span>}</div>
      <div className="mt-2.5 flex flex-wrap items-baseline gap-3"><Price value={opt.medianUsd} className="text-[clamp(44px,7vw,64px)]" /><Delta pct={deltaPct(sales, opt, window, now)} /></div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13.5px] text-mute">
        <span><i className={`mr-[5px] inline-block h-[7px] w-[7px] rounded-full align-[1px] ${dotCls}`} />{opt.nSales} sale{opt.nSales === 1 ? "" : "s"} in {w.text}</span>
        <span>Range {fmtUsd(opt.minUsd)}–{Math.round(opt.maxUsd).toLocaleString("en-US")}</span>
        {last?.sold_at && <span>Last sold {fmtDateLong(last.sold_at)} for {fmtNative(Number(last.price), last.currency)}</span>}
      </div>
    </div>
    <Sparkline sales={mine} gold={opt.gradeValue === 10} window={window} />
  </div>);
}
```

- [ ] **Step 2: SalesList**

`components/SalesList.tsx`:
```tsx
"use client";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { SaleRow } from "@/lib/card-data";
import type { GradeOption } from "@/lib/grades";
import { GradeBadge } from "./GradeBadge";
import { Price } from "./Price";
import { fmtDateLong } from "@/lib/format";
const srcName: Record<string, string> = { thecardapi: "eBay", soldcomps: "eBay", yahoo_auc: "Yahoo! Auctions" };
const src = (s: SaleRow) => `${srcName[s.source] ?? s.source}${s.is_best_offer ? ", best offer" : ""}`;
export function SalesList({ sales, opt }: { sales: SaleRow[]; opt: GradeOption }) {
  const [all, setAll] = useState(false);
  if (sales.length === 0) return <p className="m-0 text-[13.5px] text-mute">No {opt.label} sales in this window yet.</p>;
  const shown = all ? sales : sales.slice(0, 6);
  const usd = (s: SaleRow) => s.price_usd == null ? "—" : Number(s.price_usd);
  return (<>
    <table className="hidden w-full border-collapse text-[14.5px] md:table"><thead><tr className="text-left text-[12.5px] font-semibold text-mute"><th className="border-b-2 border-ink pb-2 font-semibold">Sold</th><th className="border-b-2 border-ink pb-2 pl-3.5 text-right font-semibold">Price</th><th className="border-b-2 border-ink pb-2 pl-3.5 text-right font-semibold">USD</th><th className="border-b-2 border-ink pb-2 pl-3.5 font-semibold">Source</th><th className="border-b-2 border-ink pb-2" /></tr></thead>
      <tbody>{shown.map((s) => (<tr key={s.id}><td className="border-b border-line-2 py-2.5 text-[13px] text-mute">{s.sold_at ? fmtDateLong(s.sold_at) : "—"}</td><td className="border-b border-line-2 py-2.5 pl-3.5 text-right"><Price value={Number(s.price)} currency={s.currency} bestOffer={s.is_best_offer} className="text-[19px]" /></td><td className="border-b border-line-2 py-2.5 pl-3.5 text-right"><Price value={usd(s)} secondary bestOffer={s.is_best_offer} className="text-[15px]" /></td><td className="border-b border-line-2 py-2.5 pl-3.5 text-[13px] text-mute">{src(s)}</td><td className="border-b border-line-2 py-2.5 pl-3.5 text-right"><a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-[3px] whitespace-nowrap text-[13px] font-semibold text-teal no-underline">Listing<ArrowUpRight size={13} /></a></td></tr>))}</tbody></table>
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0 md:hidden">{shown.map((s) => (<li key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-xl border border-line-2 bg-surface px-3 py-2.5 no-underline">
      <span className="row-span-2"><GradeBadge grade={opt.gradeValue} /></span>
      <span className="text-[13.5px] font-semibold">{[opt.tier, src(s)].filter(Boolean).join(" · ")}</span>
      <span className="row-span-2 text-right"><Price value={Number(s.price)} currency={s.currency} bestOffer={s.is_best_offer} className="text-[19px]" />{s.currency !== "USD" && s.price_usd != null && <span className="mt-[3px] block text-xs font-semibold text-mute tnum">{`$${Math.round(Number(s.price_usd)).toLocaleString("en-US")}`}</span>}</span>
      <span className="text-[12.5px] text-mute">{s.sold_at ? fmtDateLong(s.sold_at) : "—"}</span>
    </a></li>))}</ul>
    {sales.length > 6 && <p className="mt-3 text-[13px] text-mute">Showing {shown.length} of {sales.length}. {!all && <button type="button" onClick={() => setAll(true)} className="font-semibold text-teal">Show all</button>}</p>}
  </>);
}
```

- [ ] **Step 3: CardView (client, owns URL state)**

`components/CardView.tsx`:
```tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import type { CardPageData } from "@/lib/card-data";
import { WINDOWS, gradeOptions, defaultGradeKey, salesFor, isWindow, type Window } from "@/lib/grades";
import { GradeSelect } from "./GradeSelect";
import { GuideBox } from "./GuideBox";
import { SalesList } from "./SalesList";
import { PriceChart } from "./PriceChart";
import { Segmented } from "./Segmented";
import { SectionHead } from "./SectionHead";
export function CardView({ data, now }: { data: CardPageData; now: string }) {
  const router = useRouter(); const sp = useSearchParams();
  const window: Window = isWindow(sp.get("w")) ? (sp.get("w") as Window) : "90d";
  const options = gradeOptions(data.points, window);
  const key = options.some((o) => o.key === sp.get("g")) ? sp.get("g")! : defaultGradeKey(options);
  const opt = options.find((o) => o.key === key);
  const nowD = new Date(now);
  const set = (k: string, v: string) => { const q = new URLSearchParams(sp.toString()); q.set(k, v); router.replace(`?${q.toString()}`, { scroll: false }); };
  const w = WINDOWS.find((x) => x.value === window)!;
  const sales = opt ? salesFor(data.sales, opt, window, nowD) : [];
  return (<>
    <section>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3"><h2 className="m-0 text-[22px] font-extrabold tracking-[-0.02em]">Guide price</h2><Segmented label="Window" value={window} options={WINDOWS.map((x) => ({ value: x.value, label: x.label }))} onChange={(v) => set("w", v)} /></div>
      {opt ? (<>
        <div className="mb-3"><GradeSelect options={options} value={opt.key} onChange={(k) => set("g", k)} /></div>
        <GuideBox opt={opt} sales={data.sales} allOptions={options} window={window} now={nowD} />
        <p className="mt-3 max-w-[70ch] text-[13px] leading-[1.55] text-mute">Median of {opt.nSales} matched {opt.label} sales in the last {w.text}, in USD. Yen sales are converted at the ECB rate on the day they sold. Best-offer sales are listed but left out of the median.</p>
      </>) : <div className="rounded-[18px] border border-line-2 bg-surface p-6 text-mute">No PCG sales recorded in this window yet.</div>}
    </section>
    {opt && (<section className="mt-10"><SectionHead title={`${opt.label} sales`} aside={`${sales.length} in this window`} /><SalesList sales={sales} opt={opt} /></section>)}
    {opt && sales.length > 0 && (<section className="mt-10"><SectionHead title="Over time" aside={`Last ${w.text}, USD`} /><PriceChart sales={sales} gold={opt.gradeValue === 10} window={window} now={nowD} />
      <div className="flex flex-wrap gap-4 pt-2 text-[12.5px] font-medium text-mute"><span><i className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full" style={{ background: opt.gradeValue === 10 ? "var(--gold-badge)" : "var(--accent)" }} />{opt.label} sales</span><span><i className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full bg-surface" style={{ boxShadow: `inset 0 0 0 2px ${opt.gradeValue === 10 ? "var(--gold-badge)" : "var(--accent)"}` }} />Best offer, not in median</span><span className="ml-auto">Line is the rolling median</span></div></section>)}
  </>);
}
```
The two inline `style` colours are `var(--…)` references, not hex; allowed.

- [ ] **Step 4: Page**

Overwrite `app/card/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import Image from "next/image";
import { Check } from "lucide-react";
import { Suspense } from "react";
import { anonClient } from "@/lib/supabase-server";
import { loadCard } from "@/lib/card-data";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Chip } from "@/components/Chip";
import { CardView } from "@/components/CardView";
import { fmtDateLong } from "@/lib/format";
export const revalidate = 900;
export default async function CardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cert?: string; cg?: string; ct?: string }> }) {
  const { id } = await params; const { cert, cg, ct } = await searchParams;
  const data = await loadCard(anonClient(), decodeURIComponent(id)); if (!data) notFound();
  const { product, set } = data; const ja = product.language === "ja";
  const name = (ja ? product.name_ja ?? product.name_en : product.name_en ?? product.name_ja) ?? product.id;
  const alt = ja ? product.name_en : product.name_ja; const setName = set.name_ja ?? set.name_en ?? set.id;
  const sub = [alt, product.rarity].filter(Boolean).join(" · ");
  return (<>
    <AppHeader variant="public" />
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10">
      <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium text-mute"><a className="font-semibold text-teal no-underline" href={`/search?q=${encodeURIComponent(set.printed_code ?? setName)}`}>{setName}</a><span>/</span><span>{ja ? "Japanese" : "English"}</span></div>
      <div className="mt-2.5 flex flex-col gap-3">
        <h1 className="m-0 text-[clamp(32px,5vw,48px)] font-extrabold leading-none tracking-[-0.03em] wdth-104 text-balance">{name}{sub && <i className="mt-2 block text-[0.45em] font-semibold not-italic tracking-[-0.01em] text-mute wdth-100">{sub}</i>}</h1>
        <div className="flex flex-wrap gap-1.5"><Chip variant="number" className="!rounded-lg !px-2.5 !py-1 !text-base">{product.number_printed}</Chip>{set.printed_code && <Chip>{set.printed_code}</Chip>}<Chip variant="lang">{ja ? "Japanese" : "English"}</Chip>{set.release_date && <Chip>Released {fmtDateLong(set.release_date)}</Chip>}</div>
        {cert && <div className="inline-flex items-center gap-2 self-start rounded-full bg-teal-soft py-1.5 pl-2.5 pr-3 text-sm font-semibold text-teal"><Check size={16} strokeWidth={2.4} />Cert {cert} is this card{cg ? `, graded PCG ${cg}${ct ? ` ${ct}` : ""}` : ""}</div>}
      </div>
      <div className="mt-[26px] grid grid-cols-1 gap-7 md:grid-cols-[250px_minmax(0,1fr)] md:gap-12">
        <aside className="flex justify-center md:sticky md:top-4 md:block md:self-start">{product.image_url ? <Image src={product.image_url} alt={`${name} card art`} width={250} height={349} priority className="block aspect-[63/88] w-[min(250px,72vw)] rounded-xl object-cover shadow-object md:w-full" /> : <div className="aspect-[63/88] w-[min(250px,72vw)] rounded-xl border border-dashed border-line bg-sunk md:w-full" />}</aside>
        <div className="min-w-0"><Suspense><CardView data={data} now={new Date().toISOString()} /></Suspense></div>
      </div>
    </main>
    <SiteFooter />
  </>);
}
```
`CardView` uses `useSearchParams`, hence the `Suspense`. Delete `PriceGrid.tsx` and `SoldList.tsx`.

- [ ] **Step 5: Verify against the prototype and commit**

Open a card with sales (from the smoke seed: `/card/SMK1-010`) at 1280 and 390. Check: masthead chips, sticky art on desktop and centred 250px art on phone, grade select opens a popover (desktop) or drawer (phone), changing grade rewrites `?g=` and refilters sales and chart, window segmented control rewrites `?w=`, best offers show hollow dots and `≤`. Then:
```bash
pnpm --filter @pcg/web test && pnpm typecheck && pnpm --filter @pcg/web lint
git add -A apps/web && git commit -m "feat(web): card page with grade select, guide price box, filtered sales and chart"
```

---

### Task 12: Admin sign-in page and admin layout header

**Files:**
- Modify: `apps/web/app/(public)/admin-login/page.tsx`, `apps/web/app/admin/layout.tsx`

**Interfaces:**
- Consumes: `AppHeader`, `SiteFooter`, shadcn `Input`, `Button`, `requireAdmin`.
- Produces: admin layout renders `AppHeader variant="admin"` with the live review count.

- [ ] **Step 1: Sign-in page**

```tsx
"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export default function Login() {
  const [email, setEmail] = useState(""); const [state, setState] = useState<"idle" | "sent" | "error">("idle"); const [err, setErr] = useState("");
  const denied = useSearchParams().get("denied") === "1";
  const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  async function send(e?: React.FormEvent) { e?.preventDefault(); const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback?next=/admin/review` } }); if (error) { setErr(error.message); setState("error"); } else setState("sent"); }
  return (<>
    <AppHeader variant="public" search={{ show: false }} />
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10"><div className="mx-auto mt-8 max-w-[420px]">
      <h1 className="m-0 mb-1.5 text-[34px] font-extrabold tracking-[-0.03em]">Sign in to admin</h1>
      <p className="m-0 mb-[22px] text-[15px] text-mute">We email you a link. There is no password.</p>
      {denied && <div className="mb-4 rounded-xl bg-bad-fill px-3.5 py-3 text-sm font-medium text-bad">That address is not an admin on this project.</div>}
      {state === "error" && <div className="mb-4 rounded-xl bg-bad-fill px-3.5 py-3 text-sm font-medium text-bad">{err}</div>}
      <form onSubmit={send} className="flex flex-col gap-4 rounded-2xl border border-line-2 bg-surface p-[22px] shadow-object">
        <div className="flex flex-col gap-1.5"><label htmlFor="login-email" className="text-[13px] font-semibold text-ink-2">Email</label><Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required /><span className="text-[12.5px] text-mute">Only the admin address on this project receives a link.</span></div>
        <Button type="submit" className="w-full">Email me a sign-in link</Button>
      </form>
      {state === "sent" && <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-good-fill px-3.5 py-3 text-sm text-good"><Check size={18} strokeWidth={2.4} className="mt-px shrink-0" /><div>Link sent. Open it on this device within 10 minutes. Nothing arrived? Check spam, then <button type="button" onClick={() => send()} className="font-semibold text-teal underline">send another</button>.</div></div>}
    </div></main>
    <SiteFooter credit={false} />
  </>);
}
```
Wrap the page export in `Suspense` (a tiny `export default function Page(){ return <Suspense><Login/></Suspense> }`) because of `useSearchParams`.

- [ ] **Step 2: Admin layout**

`app/admin/layout.tsx`:
```tsx
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/admin";
import { serviceClient } from "@/lib/supabase-server";
import { AppHeader } from "@/components/AppHeader";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireAdmin();
  const { count } = await serviceClient().from("listing_matches").select("raw_listing_id", { count: "exact", head: true }).eq("state", "needs_review");
  const path = (await headers()).get("x-pathname") ?? "";
  return (<><AppHeader variant="admin" admin={{ email, reviewCount: count ?? 0, current: path.includes("/health") ? "health" : "review" }} /><main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10">{children}</main></>);
}
```
In `middleware.ts`, after creating `res`, add `res.headers.set("x-pathname", req.nextUrl.pathname);` so the layout knows the current page.

- [ ] **Step 3: Verify and commit**

Visit `/admin-login` at 390 and 1280; submit a bogus address to see the error panel; visit `/admin-login?denied=1`. Then:
```bash
pnpm typecheck && git add -A apps/web && git commit -m "feat(web): admin sign-in page and admin header with review count"
```

---

### Task 13: Review queue

**Files:**
- Create: `apps/web/lib/review.ts`, `apps/web/test/review.test.ts`, `apps/web/components/ReviewList.tsx`, `apps/web/components/ReviewItem.tsx`
- Modify: `apps/web/app/admin/review/page.tsx`
- Delete: `apps/web/components/ReviewRow.tsx`

**Interfaces:**
- Consumes: `resolveListing`, `rejectListing` (existing server actions), `SearchResult`, `GradeBadge`, `Price`, `ChipLink`, `StatusPill`, `SearchField`-style input (plain `Input`), shadcn `Select`, `Button`.
- Produces: `reasonLabel(reason) → string`, `extractedRows(extracted) → {label, value|null}[]`, `ReviewItem { id, title, description, price, currency, priceUsd, url, imageUrls, reason, extracted, source, endedAt }`.

- [ ] **Step 1: Failing tests**

`test/review.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { reasonLabel, extractedRows, sourceLine } from "../lib/review";
describe("review helpers", () => {
  it("labels reasons in plain words", () => {
    expect(reasonLabel("no_card_number")).toBe("No card number"); expect(reasonLabel("ambiguous_set")).toBe("Ambiguous set"); expect(reasonLabel("lot")).toBe("Possible lot");
    expect(reasonLabel("grader_missing")).toBe("Grader unclear"); expect(reasonLabel("ambiguous_grader")).toBe("Grader unclear"); expect(reasonLabel("possible_pcgs")).toBe("Other"); expect(reasonLabel(null)).toBe("Other");
  });
  it("turns extracted fields into labelled rows with missing markers", () => {
    expect(extractedRows({ grader: "PCG", grade: 10, set: "SV4a", language: "Japanese" })).toEqual([
      { label: "Grader", value: "PCG" }, { label: "Grade", value: "10" }, { label: "Tier", value: null, missing: "not stated" }, { label: "Set", value: "SV4a" }, { label: "Number", value: null, missing: "none found" }, { label: "Language", value: "Japanese" }]);
  });
  it("source line", () => { expect(sourceLine("yahoo_auc", "2026-09-20T00:00:00Z", "ended")).toBe("Yahoo! Auctions · ended 20 Sept"); expect(sourceLine("soldcomps", "2026-09-18T00:00:00Z", "sold")).toBe("eBay · sold 18 Sept"); });
});
```
Run → FAIL.

- [ ] **Step 2: Implement `lib/review.ts`**

```ts
import { fmtDateShort } from "./format";
const LABELS: Record<string, string> = { no_card_number: "No card number", ambiguous_set: "Ambiguous set", no_grade: "No grade", lot: "Possible lot", grader_missing: "Grader unclear", ambiguous_grader: "Grader unclear", no_set_code: "No set code", no_metadata: "No metadata" };
export const reasonLabel = (r: string | null | undefined) => (r && LABELS[r]) || "Other";
export const reasonFilterKey = (r: string | null | undefined) => (r && LABELS[r] ? r : "other");
const FIELDS: { key: string; label: string; missing: string }[] = [{ key: "grader", label: "Grader", missing: "not stated" }, { key: "grade", label: "Grade", missing: "not stated" }, { key: "gradeLabel", label: "Tier", missing: "not stated" }, { key: "set", label: "Set", missing: "not stated" }, { key: "cardNumber", label: "Number", missing: "none found" }, { key: "language", label: "Language", missing: "not stated" }];
export function extractedRows(x: Record<string, unknown>): { label: string; value: string | null; missing?: string }[] {
  return FIELDS.map((f) => { const v = x[f.key]; return v == null || v === "" ? { label: f.label, value: null, missing: f.missing } : { label: f.label, value: String(v) }; });
}
const SRC: Record<string, string> = { thecardapi: "eBay", soldcomps: "eBay", yahoo_auc: "Yahoo! Auctions" };
export const sourceLine = (source: string, at: string | null, verb: "sold" | "ended") => `${SRC[source] ?? source}${at ? ` · ${verb} ${fmtDateShort(at)}` : ""}`;
export interface ReviewItemData { id: string; title: string; description: string | null; price: number; currency: string; priceUsd: number | null; url: string; imageUrls: string[]; reason: string | null; extracted: Record<string, unknown>; source: string; at: string | null; kind: "sold" | "ended" }
```
Check what keys the matcher writes into `extracted` (`grep -n "extracted" packages/domain/src/matcher.ts`) and align `FIELDS[].key` with them; the test's keys are the expected names, adjust the test only if the matcher provably uses different keys.

- [ ] **Step 3: ReviewItem**

`components/ReviewItem.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import Image from "next/image";
import { Search } from "lucide-react";
import { resolveListing, rejectListing } from "@/app/admin/review/actions";
import type { SearchResult } from "@/lib/search";
import { extractedRows, reasonLabel, sourceLine, type ReviewItemData } from "@/lib/review";
import { Price } from "./Price";
import { StatusPill } from "./StatusPill";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
const GRADES = ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6", "5", "4", "3", "2", "1", "authentic"];
export function ReviewItem({ item, active, onDone, onSkip }: { item: ReviewItemData; active: boolean; onDone: () => void; onSkip: () => void }) {
  const [q, setQ] = useState(""); const [hits, setHits] = useState<SearchResult[]>([]); const [pick, setPick] = useState<SearchResult | null>(null);
  const [grade, setGrade] = useState(String(item.extracted.grade ?? "10")); const [tier, setTier] = useState("none"); const [pending, start] = useTransition();
  async function search(v: string) { setQ(v); if (v.trim().length < 2) return setHits([]); const r = await fetch(`/api/search?q=${encodeURIComponent(v)}`); const o = await r.json(); setHits("results" in o ? o.results : []); }
  const assign = () => pick && start(async () => { await resolveListing(item.id, { productId: pick.id, gradeValue: grade === "authentic" ? null : Number(grade), gradeLabel: grade === "authentic" ? "Authentic" : tier === "none" ? null : tier }); onDone(); });
  const reject = () => start(async () => { await rejectListing(item.id); onDone(); });
  const name = (h: SearchResult) => h.language === "ja" ? h.nameJa ?? h.nameEn : h.nameEn ?? h.nameJa;
  return (<article data-review-item data-assign={pick ? "1" : "0"} className={cn("grid grid-cols-1 gap-4 rounded-2xl border border-line-2 bg-surface p-4 md:grid-cols-[minmax(0,1fr)_300px] md:gap-8 md:p-5", active && "border-teal ring-[3px] ring-teal-soft")}>
    <div className="grid min-w-0 grid-cols-[76px_1fr] gap-3.5">
      {item.imageUrls[0] ? <Image src={item.imageUrls[0]} alt="" width={76} height={76} unoptimized className="h-[76px] w-[76px] rounded-[10px] object-cover" /> : <div className="h-[76px] w-[76px] rounded-[10px] bg-sunk" />}
      <div className="min-w-0">
        <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="line-clamp-2 text-base font-bold leading-[1.3] tracking-[-0.01em] text-ink no-underline hover:underline">{item.title}</a>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px] text-mute"><span><Price value={item.price} currency={item.currency} className="text-base" />{item.priceUsd != null && item.currency !== "USD" && <Price value={item.priceUsd} secondary className="ml-1.5 text-[13px]" />}</span><span>{sourceLine(item.source, item.at, item.kind)}</span><StatusPill tone="warn">{reasonLabel(item.reason)}</StatusPill></div>
      </div>
      <dl className="col-span-full m-0 mt-1 grid grid-cols-[repeat(auto-fill,minmax(105px,1fr))] gap-x-3 gap-y-2 border-t border-line-2 pt-3 text-[13.5px]">{extractedRows(item.extracted).map((r) => <div key={r.label}><dt className="text-xs font-medium text-mute">{r.label}</dt><dd className={cn("m-0 mt-px", r.value ? "font-bold" : "font-medium text-mute")}>{r.value ?? r.missing}</dd></div>)}</dl>
      {item.description && <details className="col-span-full text-[13px] text-mute"><summary className="cursor-pointer font-semibold text-teal">Seller description</summary><p className="mt-1.5 whitespace-pre-wrap">{item.description}</p></details>}
    </div>
    <div className="flex flex-col gap-3 border-t border-line-2 pt-3.5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
      <span className="text-[13px] font-semibold text-ink-2">Assign to</span>
      {pick ? (<div className="grid grid-cols-[34px_1fr_auto] items-center gap-2.5 rounded-[10px] bg-sunk px-2.5 py-2 text-[13.5px]">{pick.imageUrl ? <Image src={pick.imageUrl} alt="" width={34} height={47} className="h-[47px] w-[34px] rounded object-cover" /> : <div className="h-[47px] w-[34px] rounded bg-surface" />}<div><b className="block text-[14.5px] font-bold">{name(pick)} {pick.numberPrinted}</b><span className="text-[12.5px] text-mute">{pick.setName}{pick.setCode ? ` ${pick.setCode}` : ""} · {pick.language === "ja" ? "Japanese" : "English"}</span></div><button type="button" onClick={() => setPick(null)} className="min-h-9 px-1 text-[13px] font-bold text-teal">Change</button></div>)
      : (<><div className="flex min-h-[42px] items-center gap-2 rounded-[10px] border border-line bg-surface pl-3 pr-1 focus-within:border-teal focus-within:ring-[3px] focus-within:ring-teal-soft"><Search size={16} className="text-mute" /><input value={q} onChange={(e) => search(e.target.value)} placeholder="Number or name" aria-label="Find card" className="min-w-0 flex-1 bg-transparent py-2 text-[15px] font-medium outline-none placeholder:font-normal placeholder:text-mute" /></div>
        {hits.length > 0 && <ul className="m-0 flex list-none flex-col gap-1 p-0">{hits.slice(0, 6).map((h) => <li key={h.id}><button type="button" onClick={() => { setPick(h); setHits([]); }} className="grid w-full grid-cols-[30px_1fr] items-center gap-2.5 rounded-lg border border-line-2 px-2 py-1.5 text-left text-[13.5px] hover:bg-sunk">{h.imageUrl ? <Image src={h.imageUrl} alt="" width={30} height={42} className="h-[42px] w-[30px] rounded-[3px] object-cover" /> : <div className="h-[42px] w-[30px] rounded-[3px] border border-dashed border-line bg-sunk" />}<span><b className="block font-bold">{name(h)}</b><span className="text-[12.5px] text-mute">{h.setName} · {h.numberPrinted} · {h.language === "ja" ? "Japanese" : "English"}</span></span></button></li>)}</ul>}</>)}
      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">Grade<Select value={grade} onValueChange={setGrade}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{GRADES.map((g) => <SelectItem key={g} value={g}>{g === "authentic" ? "Authentic" : g}</SelectItem>)}</SelectContent></Select></label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">Tier<Select value={tier} onValueChange={setTier} disabled={grade !== "10"}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not stated</SelectItem><SelectItem value="Flawless">Flawless</SelectItem><SelectItem value="Pristine">Pristine</SelectItem><SelectItem value="Gem Mint">Gem Mint</SelectItem></SelectContent></Select></label>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5"><Button data-action="assign" className="flex-1" disabled={!pick || pending} onClick={assign}>Assign</Button><Button data-action="reject" variant="danger" disabled={pending} onClick={reject}>Reject</Button><Button data-action="skip" variant="ghost" onClick={onSkip}>Skip</Button></div>
    </div>
  </article>);
}
```

- [ ] **Step 4: ReviewList with keyboard shortcuts**

`components/ReviewList.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewItemData } from "@/lib/review";
import { ReviewItem } from "./ReviewItem";
export function ReviewList({ items, total }: { items: ReviewItemData[]; total: number }) {
  const [active, setActive] = useState(0); const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement; if (t.closest("input, textarea, select, [role=combobox], [contenteditable]")) return;
      const k = e.key.toLowerCase(); const el = document.querySelectorAll("[data-review-item]")[active] as HTMLElement | undefined;
      if (k === "j") setActive((a) => Math.min(a + 1, items.length - 1)); else if (k === "k") setActive((a) => Math.max(a - 1, 0));
      else if (k === "a") (el?.querySelector("[data-action=assign]") as HTMLButtonElement | null)?.click(); else if (k === "r") (el?.querySelector("[data-action=reject]") as HTMLButtonElement | null)?.click(); else if (k === "s") setActive((a) => Math.min(a + 1, items.length - 1)); else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [active, items.length]);
  useEffect(() => { (document.querySelectorAll("[data-review-item]")[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" }); }, [active]);
  if (items.length === 0) return <p className="m-0 text-[15px] text-mute">Queue is empty. Nothing needs a decision right now.</p>;
  return (<><div className="flex flex-col gap-3">{items.map((it, i) => <ReviewItem key={it.id} item={it} active={i === active} onDone={() => router.refresh()} onSkip={() => setActive(Math.min(i + 1, items.length - 1))} />)}</div>
    <p className="mt-3.5 text-[13px] text-mute">Showing {items.length} of {total}. Decisions here override the matcher on every future run.</p></>);
}
```

- [ ] **Step 5: Page**

`app/admin/review/page.tsx`:
```tsx
import { serviceClient } from "@/lib/supabase-server";
import { ReviewList } from "@/components/ReviewList";
import { ChipLink } from "@/components/Chip";
import { reasonLabel, reasonFilterKey, type ReviewItemData } from "@/lib/review";
export const dynamic = "force-dynamic";
export default async function Review({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams; const db = serviceClient();
  const { data: counts } = await db.from("listing_matches").select("review_reason").eq("state", "needs_review");
  const byReason = new Map<string, number>(); for (const c of counts ?? []) { const k = reasonFilterKey(c.review_reason); byReason.set(k, (byReason.get(k) ?? 0) + 1); }
  const total = counts?.length ?? 0;
  let qy = db.from("listing_matches").select("raw_listing_id,review_reason,extracted,raw_listings(id,title,description,price,currency,url,image_urls,source,sold_at,ended_at,kind)").eq("state", "needs_review").order("updated_at", { ascending: false }).limit(50);
  if (reason && reason !== "other") qy = qy.eq("review_reason", reason); else if (reason === "other") qy = qy.not("review_reason", "in", `(${["no_card_number","ambiguous_set","no_grade","lot","grader_missing","ambiguous_grader","no_set_code","no_metadata"].join(",")})`);
  const { data: rows } = await qy;
  const { data: fx } = await db.from("fx_rates").select("base,rate").eq("quote", "USD").order("date", { ascending: false }).limit(20);
  const rate = new Map((fx ?? []).map((f: { base: string; rate: number }) => [f.base, Number(f.rate)]));
  const items: ReviewItemData[] = (rows ?? []).map((r) => { const l = r.raw_listings as unknown as { id: string; title: string; description: string | null; price: number; currency: string; url: string; image_urls: string[]; source: string; sold_at: string | null; ended_at: string | null; kind: "sold" | "ended" };
    return { id: l.id, title: l.title, description: l.description, price: Number(l.price), currency: l.currency, priceUsd: l.currency === "USD" ? Number(l.price) : rate.has(l.currency) ? Number(l.price) * rate.get(l.currency)! : null, url: l.url, imageUrls: l.image_urls ?? [], reason: r.review_reason, extracted: (r.extracted ?? {}) as Record<string, unknown>, source: l.source, at: l.sold_at ?? l.ended_at, kind: l.kind }; });
  const shown = reason ? (byReason.get(reason) ?? 0) : total;
  const chips = [["", "All", total], ...[...byReason.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, reasonLabel(k), n] as const)] as [string, string, number][];
  return (<>
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2"><h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em]">{shown} listing{shown === 1 ? "" : "s"}<span className="ml-2 text-base font-semibold tracking-normal text-mute">{shown === 1 ? "needs" : "need"} a decision</span></h1>
      <span className="ml-auto hidden text-[12.5px] font-medium text-mute md:block"><kbd className="rounded border border-line border-b-2 bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">J</kbd> <kbd className="rounded border border-line border-b-2 bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">K</kbd> move &nbsp; <kbd className="rounded border border-line border-b-2 bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">A</kbd> assign &nbsp; <kbd className="rounded border border-line border-b-2 bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">R</kbd> reject &nbsp; <kbd className="rounded border border-line border-b-2 bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">S</kbd> skip</span></div>
    <div className="no-scrollbar -mx-5 mb-4 flex gap-1.5 overflow-x-auto px-5 pb-1">{chips.map(([k, l, n]) => <ChipLink key={k} href={k ? `/admin/review?reason=${k}` : "/admin/review"} aria-pressed={(reason ?? "") === k} className="shrink-0 gap-[7px]">{l} <b className={`font-extrabold ${(reason ?? "") === k ? "text-gold-badge" : "text-mute"}`}>{n}</b></ChipLink>)}</div>
    <ReviewList items={items} total={shown} />
  </>);
}
```
Delete `components/ReviewRow.tsx`.

- [ ] **Step 6: Verify and commit**

Sign in, open `/admin/review` at 1280 and 390. Check chips filter via `?reason=`, J/K move the outline, Assign is disabled until a card is picked, Tier is disabled unless Grade is 10, Reject and Assign refresh the list. Then:
```bash
pnpm --filter @pcg/web test && pnpm typecheck && pnpm --filter @pcg/web lint
git add -A apps/web && git commit -m "feat(web): review queue with reason chips, labelled fields, resolution panel and keyboard triage"
```

---

### Task 14: Health page

**Files:**
- Create: `apps/web/lib/schedule.ts`, `apps/web/lib/health.ts`, `apps/web/test/schedule.test.ts`, `apps/web/test/health.test.ts`, `apps/web/components/JobTile.tsx`, `apps/web/components/RunsTable.tsx`
- Modify: `apps/web/app/admin/health/page.tsx`

**Interfaces:**
- Produces: `nextRun(cron: string, now: Date) → Date` for the three project patterns (`m h * * *`, `m */n * * *`, `m h * * d`); `SCHEDULE = [{ cron, label }]`; `formatCursor(cursor: unknown) → string`; `runTone(status) → Tone`; `resultLine(run) → string`; `JobSummary { job, status, at, note, err, stack }`; `summarise(runs) → JobSummary[]` (latest run per job, failed → suspect → ok, most recent first within a group).

- [ ] **Step 1: Failing tests**

`test/schedule.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { nextRun } from "../lib/schedule";
describe("nextRun", () => {
  const now = new Date("2026-09-21T06:20:00Z");
  it("every 6 hours at :05", () => { expect(nextRun("5 */6 * * *", now).toISOString()).toBe("2026-09-21T12:05:00.000Z"); });
  it("daily at 03:35", () => { expect(nextRun("35 3 * * *", now).toISOString()).toBe("2026-09-22T03:35:00.000Z"); });
  it("weekly on Monday 03:50 (21 Sept 2026 is a Monday)", () => { expect(nextRun("50 3 * * 1", now).toISOString()).toBe("2026-09-28T03:50:00.000Z"); });
});
```
`test/health.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatCursor, summarise, resultLine } from "../lib/health";
const run = (job: string, status: "ok" | "failed" | "suspect" | "running", started_at: string, extra: Partial<{ items_seen: number; items_new: number; errors: unknown[]; finished_at: string | null }> = {}) => ({ id: `${job}-${started_at}`, job, status, started_at, finished_at: started_at, items_seen: 0, items_new: 0, items_updated: 0, errors: [], ...extra });
describe("health helpers", () => {
  it("formats cursors", () => {
    expect(formatCursor({ page: 3, since: "2026-09-21T06:10:00Z" })).toBe("page 3 · 2026-09-21T06:10Z");
    expect(formatCursor("2026-09-20T18:00:00.000Z")).toBe("2026-09-20T18:00Z"); expect(formatCursor(null)).toBe("—");
  });
  it("summarises latest run per job, failures first", () => {
    const s = summarise([run("prices", "ok", "2026-09-21T06:09:00Z"), run("ebay:sold", "failed", "2026-09-21T02:03:00Z", { errors: [{ message: "thecardapi 401: key expired" }] }), run("ebay:sold", "ok", "2026-09-20T20:00:00Z"), run("yahoo:auctions", "suspect", "2026-09-21T02:01:00Z")]);
    expect(s.map((x) => x.job)).toEqual(["ebay:sold", "yahoo:auctions", "prices"]); expect(s[0]!.err).toBe("thecardapi 401: key expired");
  });
  it("result lines", () => {
    expect(resultLine(run("ebay:sold-comps", "ok", "x", { items_seen: 312, items_new: 41 }))).toBe("OK · 312 seen, 41 new");
    expect(resultLine(run("catalog:tcgdex", "ok", "x", { items_seen: 512, items_new: 38940 }))).toBe("OK · 512 sets, 38,940 cards");
    expect(resultLine(run("yahoo:auctions", "suspect", "x", { items_seen: 0 }))).toBe("Suspect: 0 seen, 0 new");
  });
});
```
Run both → FAIL.

- [ ] **Step 2: Implement `lib/schedule.ts` and `lib/health.ts`**

`lib/schedule.ts`:
```ts
export const SCHEDULE = [{ cron: "5 */6 * * *", label: "ebay:sold-comps, then match and prices" }, { cron: "35 3 * * *", label: "fx:daily" }, { cron: "50 3 * * 1", label: "catalog:tcgdex" }];
export function nextRun(cron: string, now: Date): Date {
  const [m, h, , , dow] = cron.split(" "); const minute = Number(m);
  const hourOk = (x: number) => h === "*" ? true : h.startsWith("*/") ? x % Number(h.slice(2)) === 0 : x === Number(h);
  const dowOk = (d: number) => dow === "*" || d === Number(dow);
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0));
  for (let i = 0; i < 24 * 8; i++, t.setUTCHours(t.getUTCHours() + 1)) {
    const cand = new Date(t); cand.setUTCMinutes(minute);
    if (cand.getTime() > now.getTime() && hourOk(cand.getUTCHours()) && dowOk(cand.getUTCDay())) return cand;
  }
  throw new Error(`no run within 8 days for ${cron}`);
}
```
`lib/health.ts`:
```ts
import type { Tone } from "@/components/StatusPill";
export interface Run { id: string; job: string; status: "running" | "ok" | "failed" | "suspect"; started_at: string; finished_at: string | null; items_seen: number; items_new: number; items_updated: number; errors: unknown[] }
export interface JobSummary { job: string; status: Run["status"]; at: string; note: string; err: string | null; stack: string | null }
const short = (iso: string) => iso.replace(/:\d\d(\.\d+)?Z$/, "Z");
export function formatCursor(c: unknown): string {
  if (c == null) return "—"; if (typeof c === "string") return short(c);
  if (typeof c === "object") { const o = c as Record<string, unknown>; const parts: string[] = []; if (o.page != null) parts.push(`page ${o.page}`); for (const k of ["since", "until", "cursor", "updated", "ts"]) if (typeof o[k] === "string") { parts.push(short(o[k] as string)); break; } return parts.length ? parts.join(" · ") : JSON.stringify(c); }
  return String(c);
}
export const runTone = (s: Run["status"]): Tone => s === "ok" ? "ok" : s === "failed" ? "bad" : s === "suspect" ? "warn" : "mute";
export const statusWord = (s: Run["status"]) => ({ ok: "OK", failed: "Failed", suspect: "Suspect", running: "Running" }[s]);
const n = (x: number) => x.toLocaleString("en-US");
export function resultLine(r: Run): string {
  if (r.status === "failed") return `Failed: ${firstError(r) ?? "unknown error"}`;
  if (r.status === "suspect") return `Suspect: ${n(r.items_seen)} seen, ${n(r.items_new)} new`;
  if (r.job === "catalog:tcgdex") return `OK · ${n(r.items_seen)} sets, ${n(r.items_new)} cards`;
  if (r.job === "match") return `OK · ${n(r.items_new)} matched, ${n(r.items_updated)} sent to review`;
  return `${statusWord(r.status)} · ${n(r.items_seen)} seen, ${n(r.items_new)} new`;
}
export const firstError = (r: Run): string | null => { const e = r.errors?.[0] as { message?: string } | string | undefined; return e == null ? null : typeof e === "string" ? e : e.message ?? JSON.stringify(e); };
export function summarise(runs: Run[]): JobSummary[] {
  const latest = new Map<string, Run>(); for (const r of [...runs].sort((a, b) => b.started_at.localeCompare(a.started_at))) if (!latest.has(r.job)) latest.set(r.job, r);
  const rank = { failed: 0, suspect: 1, running: 2, ok: 3 } as const;
  return [...latest.values()].sort((a, b) => rank[a.status] - rank[b.status] || b.started_at.localeCompare(a.started_at)).map((r) => ({ job: r.job, status: r.status, at: r.started_at, note: resultLine(r), err: r.status === "failed" ? firstError(r) : null, stack: r.status === "failed" && r.errors.length ? JSON.stringify(r.errors, null, 2) : null }));
}
```
`match` job stats: `items_new` = matched and `items_updated` = sent to review is how `apps/ingest/src/jobs/match.ts` reports today; confirm with `grep -n "items_" apps/ingest/src/jobs/match.ts` and adjust the mapping if it differs. Run tests → PASS.

- [ ] **Step 3: JobTile, RunsTable, page**

`components/JobTile.tsx`:
```tsx
"use client";
import { useState } from "react";
import type { JobSummary } from "@/lib/health";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
export function JobTile({ j, now }: { j: JobSummary; now: string }) {
  const [open, setOpen] = useState(false);
  return (<li className={cn("grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-line-2 bg-surface px-3.5 py-3", j.status === "failed" && "border-bad", j.status === "suspect" && "border-gold-line")}>
    <span className="text-[15px] font-extrabold tracking-[-0.01em] wdth-96">{j.job}</span><span className="text-right text-[12.5px] text-mute tnum">{relativeTime(j.at, new Date(now))}</span>
    <span className={cn("col-span-full text-[13.5px] text-ink-2", j.status === "failed" && "font-medium text-bad")}>{j.note}{j.stack && <button type="button" onClick={() => setOpen(true)} className="pl-2 text-[13px] font-bold text-teal">Show stack</button>}</span>
    {j.stack && <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle className="text-base font-extrabold">{j.job} errors</DialogTitle><pre className="max-h-[60vh] overflow-auto rounded-lg bg-sunk p-3 text-xs">{j.stack}</pre></DialogContent></Dialog>}
  </li>);
}
```
`components/RunsTable.tsx`:
```tsx
"use client";
import { useState } from "react";
import type { Run } from "@/lib/health";
import { runTone, statusWord, firstError } from "@/lib/health";
import { StatusPill } from "./StatusPill";
import { fmtDuration } from "@/lib/format";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
const started = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).replace(",", "");
export function RunsTable({ runs }: { runs: Run[] }) {
  const [stack, setStack] = useState<string | null>(null);
  const th = "whitespace-nowrap border-b border-line bg-sunk px-3 py-2.5 text-left text-[12.5px] font-semibold text-mute";
  const td = "whitespace-nowrap border-t border-line-2 px-3 py-[9px] tnum";
  return (<div className="overflow-x-auto rounded-xl border border-line-2 bg-surface"><table className="w-full min-w-[680px] border-collapse text-sm"><thead><tr><th className={th}>Job</th><th className={th}>Status</th><th className={th}>Started</th><th className={`${th} text-right`}>Took</th><th className={`${th} text-right`}>Seen</th><th className={`${th} text-right`}>New</th><th className={th}>Errors</th></tr></thead>
    <tbody>{runs.map((r) => (<tr key={r.id}><td className={`${td} font-bold`}>{r.job}</td><td className={td}><StatusPill tone={runTone(r.status)}>{statusWord(r.status)}</StatusPill></td><td className={td}>{started(r.started_at)}</td><td className={`${td} text-right`}>{r.finished_at ? fmtDuration(new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) : "—"}</td><td className={`${td} text-right`}>{r.items_seen.toLocaleString("en-US")}</td><td className={`${td} text-right`}>{r.items_new.toLocaleString("en-US")}</td><td className={`${td} max-w-[320px] whitespace-normal text-[13px] font-medium text-bad`}>{firstError(r)}{r.errors.length > 0 && <button type="button" onClick={() => setStack(JSON.stringify(r.errors, null, 2))} className="pl-2 font-bold text-teal">Show stack</button>}</td></tr>))}</tbody></table>
    <Dialog open={stack != null} onOpenChange={(o) => !o && setStack(null)}><DialogContent><DialogTitle className="text-base font-extrabold">Errors</DialogTitle><pre className="max-h-[60vh] overflow-auto rounded-lg bg-sunk p-3 text-xs">{stack}</pre></DialogContent></Dialog></div>);
}
```
`app/admin/health/page.tsx`:
```tsx
import { serviceClient } from "@/lib/supabase-server";
import { summarise, formatCursor, type Run } from "@/lib/health";
import { SCHEDULE, nextRun } from "@/lib/schedule";
import { JobTile } from "@/components/JobTile";
import { RunsTable } from "@/components/RunsTable";
import { StatusPill } from "@/components/StatusPill";
import { SectionHead } from "@/components/SectionHead";
import { relativeTime } from "@/lib/format";
export const dynamic = "force-dynamic";
const SRC: Record<string, string> = { "soldcomps/sold": "eBay sold · SoldComps", "thecardapi/sold": "eBay sold · The Card API", "yahoo_auc/ended": "Yahoo! Auctions ended", "yahoo_auc/sold": "Yahoo! Auctions sold" };
const SWITCHES = [["The Card API", "CONNECTOR_THECARDAPI"], ["Yahoo! Auctions", "CONNECTOR_YAHOO_AUC"], ["SoldComps", "CONNECTOR_SOLDCOMPS"]] as const;
export default async function Health() {
  const db = serviceClient(); const now = new Date();
  const [{ data: runs }, { data: state }, { data: bySource }, { data: byState }] = await Promise.all([
    db.from("ingest_runs").select("*").order("started_at", { ascending: false }).limit(40), db.from("connector_state").select("*"), db.from("raw_listings").select("source,kind"), db.from("listing_matches").select("state")]);
  const tally = <T,>(rows: T[] | null, key: (r: T) => string) => { const m = new Map<string, number>(); for (const r of rows ?? []) m.set(key(r), (m.get(key(r)) ?? 0) + 1); return m; };
  const src = tally(bySource as { source: string; kind: string }[] | null, (r) => `${r.source}/${r.kind}`); const st = tally(byState as { state: string }[] | null, (r) => r.state);
  const jobs = summarise((runs ?? []) as Run[]); const failed = jobs.filter((j) => j.status === "failed").length, suspect = jobs.filter((j) => j.status === "suspect").length;
  const next = SCHEDULE.map((s) => ({ ...s, at: nextRun(s.cron, now) })).sort((a, b) => a.at.getTime() - b.at.getTime())[0]!;
  const kv = "border-b border-line-2 py-[9px]";
  return (<>
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2"><h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em]">Ingest health</h1>{failed > 0 && <StatusPill tone="bad">{failed} failed</StatusPill>}{suspect > 0 && <StatusPill tone="warn">{suspect} suspect</StatusPill>}</div>
    <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2">{jobs.map((j) => <JobTile key={j.job} j={j} now={now.toISOString()} />)}
      <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-line-2 bg-surface px-3.5 py-3"><span className="text-[15px] font-extrabold text-mute wdth-96">Next run</span><span className="text-right text-[12.5px] text-mute tnum">{relativeTime(next.at.toISOString(), now)}</span><span className="col-span-full text-[13.5px] text-ink-2">{next.label}</span></li></ul>
    <div className="mt-9 grid grid-cols-1 gap-7 md:grid-cols-2 md:gap-12">
      <section><SectionHead title="Listings" /><table className="w-full border-collapse text-[14.5px]"><tbody>
        {[...src.entries()].map(([k, v]) => <tr key={k}><td className={`${kv} font-medium text-ink-2`}>{SRC[k] ?? k}</td><td className={`${kv} text-right font-bold tnum`}>{v.toLocaleString("en-US")}</td></tr>)}
        <tr><td className="border-b-2 border-ink py-[9px] font-extrabold">Matched</td><td className="border-b-2 border-ink py-[9px] text-right font-extrabold tnum">{(st.get("matched") ?? 0).toLocaleString("en-US")}</td></tr>
        <tr><td className={`${kv} font-medium text-ink-2`}>Needs review</td><td className={`${kv} text-right font-bold tnum`}>{st.get("needs_review") ?? 0}</td></tr><tr><td className={`${kv} font-medium text-ink-2`}>Rejected</td><td className={`${kv} text-right font-bold tnum`}>{(st.get("rejected") ?? 0).toLocaleString("en-US")}</td></tr></tbody></table></section>
      <section><SectionHead title="Connectors" /><table className="w-full border-collapse text-[14.5px]"><tbody>
        {((state ?? []) as { connector: string; cursor: unknown }[]).map((c) => <tr key={c.connector}><td className={`${kv} font-medium text-ink-2`}>{c.connector} cursor</td><td className={`${kv} text-right text-[13px] text-mute`}>{formatCursor(c.cursor)}</td></tr>)}
        {SWITCHES.map(([label, env]) => <tr key={env}><td className={`${kv} font-medium text-ink-2`}>{label}</td><td className={`${kv} text-right`}><StatusPill tone={process.env[env] === "off" ? "bad" : "ok"}>{process.env[env] === "off" ? "Off" : "On"}</StatusPill></td></tr>)}</tbody></table></section>
    </div>
    <section className="mt-9"><SectionHead title="Recent runs" aside="Last 40" /><RunsTable runs={(runs ?? []) as Run[]} /></section>
  </>);
}
```

- [ ] **Step 4: Verify and commit**

Open `/admin/health` at 1280 and 390: failed/suspect tiles first with coloured borders, "Show stack" opens a dialog, runs table scrolls sideways on phone. Then:
```bash
pnpm --filter @pcg/web test && pnpm typecheck && pnpm --filter @pcg/web lint
git add -A apps/web && git commit -m "feat(web): health page with job board, plain-language results, cursors and runs table"
```

---

### Task 15: Playwright screenshots and final verification

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/shots.spec.ts`
- Modify: `apps/web/package.json` (scripts)

- [ ] **Step 1: Config and spec**

`apps/web/playwright.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", outputDir: "./test-results", timeout: 60_000,
  use: { baseURL: process.env.SHOTS_BASE_URL ?? "http://localhost:3000", storageState: process.env.PW_STORAGE || undefined },
  webServer: process.env.SHOTS_BASE_URL ? undefined : { command: "pnpm dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: "phone-light", use: { ...devices["iPhone 13"], colorScheme: "light" } }, { name: "phone-dark", use: { ...devices["iPhone 13"], colorScheme: "dark" } },
    { name: "desktop-light", use: { viewport: { width: 1280, height: 900 }, colorScheme: "light" } }, { name: "desktop-dark", use: { viewport: { width: 1280, height: 900 }, colorScheme: "dark" } },
  ],
});
```
`apps/web/e2e/shots.spec.ts`:
```ts
import { test } from "@playwright/test";
const CARD = process.env.SHOTS_CARD_ID ?? "SMK1-010";
const pages: [string, string][] = [["home", "/"], ["search", "/search?q=010/050"], ["card", `/card/${encodeURIComponent(CARD)}?g=10gm&w=90d`], ["login", "/admin-login"]];
if (process.env.PW_STORAGE) pages.push(["review", "/admin/review"], ["health", "/admin/health"]);
for (const [name, path] of pages) test(name, async ({ page }, info) => {
  await page.goto(path); await page.waitForLoadState("networkidle"); await page.waitForTimeout(300);
  await page.screenshot({ path: `.shots/${name}-${info.project.name}.png`, fullPage: true });
  if (name === "card") { await page.getByRole("button", { name: /PCG/ }).first().click(); await page.waitForTimeout(300); await page.screenshot({ path: `.shots/${name}-select-${info.project.name}.png`, fullPage: false }); }
});
```
Add scripts to `apps/web/package.json`: `"shots": "playwright test"`.

To capture the admin pages once: sign in through the browser, export the storage state with `pnpm exec playwright codegen --save-storage=.auth.json http://localhost:3000/admin/review` (`.auth.json` is gitignored via `.env*`? No: add `/.auth.json` to `apps/web/.gitignore`), then run `PW_STORAGE=.auth.json pnpm --filter @pcg/web shots`.

- [ ] **Step 2: Run everything**

```bash
pnpm --filter @pcg/ingest smoke        # seed (scratch project only)
pnpm test && pnpm typecheck && pnpm --filter @pcg/web lint
pnpm --filter @pcg/web shots
```
Open each PNG in `apps/web/.shots/` next to the prototype at the same width and theme. Every page must match the prototype's layout and type; differences allowed only in the recharts drawings (agreed) and in data.

- [ ] **Step 3: Commit**

```bash
git add -A apps/web && git commit -m "test(web): Playwright screenshot script for desktop and phone, light and dark"
```

---

## Self-review against the spec

- §2 packages: Task 1 (shadcn, lucide, Playwright, Archivo), recharts kept in Task 10. ✔
- §3 tokens, type, radii, spacing, elevation, motion, focus: Task 1 CSS plus class usage in Tasks 2–14; reduced motion in `globals.css`. ✔
- §4 components: SlabMark/GradeBadge/Price/Chip/StatusPill/Delta/SectionHead/Segmented/SiteFooter (Task 2), AppHeader/SearchField (3), GradeSelect (9), charts (10), Ledger styles inline in SalesList (11). ✔
- §5.1 Home (7), §5.2 Results incl. empty and loading (3, 6), §5.3 Card incl. cert pass-through (5, 11), §5.4 Sign-in incl. denied and error (12), §5.5 Review incl. filters, keyboard, load-more (13; "Load more" is covered by the 50-row page plus the count line — if more than 50 rows exist the implementer adds a `?page=` param in Task 13 step 5, same query with `.range(page*50, page*50+49)` and a "Load more" `ChipLink`), §5.6 Health (14). ✔
- §6 data: views (4), search shape (5), grade functions (8), cert redirect (5), schedule and cursors (14). ✔
- §7 tests and Playwright: Tasks 2, 5, 7, 8, 13, 14, 15. ✔
- Manifest colours: Task 1. ✔
