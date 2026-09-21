# UI redesign — morning handoff

Branch: `feat/ui-redesign` (18 commits off `main`). Not merged, not pushed.
Status: implementation complete, whole-branch review **APPROVED FOR MERGE**, all checks green.

## Verification (offline, DB paused)
- `pnpm typecheck` — pass (all workspaces)
- `pnpm --filter @pcg/web lint` — clean (exit 0)
- `pnpm test` — web 33/33, ingest 9/9
- `pnpm --filter @pcg/web build` — compiles, 11/11 routes
- Playwright smoke (`pnpm --filter @pcg/web shots`) — home, search, sign-in render correctly in light+dark, phone+desktop. No crashes.

## Why some things are deferred
Your Supabase project is **paused** — its REST host `nbemewketprkcyhewxos.supabase.co` returns NXDOMAIN, and no DB password is available locally. So two things could not be done tonight and wait for you:

1. **Apply the migration.** `packages/db/migrations/0004_home.sql` adds two read-only views (`public_recent_sales`, `set_sale_counts`) for the home page. It is committed but **not applied**. After resuming the project, apply it the way the other migrations were applied (Supabase SQL editor, or `supabase db query --linked` with the DB password).
2. **Data-backed smoke.** The card page and the admin pages (review, health) need live data / an auth session. Resume the project, then:
   ```
   pnpm --filter @pcg/web shots          # re-run with data for home/search/card
   # admin pages (one-time auth capture):
   pnpm exec playwright codegen --save-storage=apps/web/.auth.json http://localhost:3000/admin/review
   PW_STORAGE=.auth.json pnpm --filter @pcg/web shots
   ```

Every server data loader degrades to the spec's empty/error states while the DB is unreachable, so the app builds and renders regardless; it uses real data automatically once the project is up.

## To integrate
```
git checkout main && git merge --no-ff feat/ui-redesign
```
Or open a PR from `feat/ui-redesign`. Recommend applying `0004_home.sql` and doing the data-backed smoke before merging, since that path hasn't been exercised with real data.

## Packages added
shadcn/ui (Radix + vaul), lucide-react, @playwright/test. recharts kept. Archivo variable font via next/font.

## Whole-branch review outcome
Approved for merge. One Important admin-nav bug (x-pathname was a response header; the layout reads request headers) and one minor filter edge case were fixed in commit `9f6432e` and re-reviewed clean. Remaining minors are cosmetic/coverage only (see the commit history and the design spec for detail).

## New pages/routes
`/search` is a new route; the home search now navigates there instead of showing inline results. Everything else maps to the existing six pages.
