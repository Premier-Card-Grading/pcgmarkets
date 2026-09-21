import { test } from "@playwright/test";

// The project's Supabase instance is paused while this smoke test is authored, so:
//   - `/` renders its empty-state fallback
//   - `/search?q=...` renders empty results
//   - `/card/<id>` calls loadCard, which throws -> notFound() -> a 404 page
//   - `/admin/review` and `/admin/health` redirect to `/admin-login` (auth check fails)
// The card and admin (review/health) shots are omitted from the default run below because
// they require the database resumed (card) and/or an authenticated storage state (admin).
// Once the DB is resumed, re-add a card entry (see task-15 brief for the shape) and capture
// admin pages once via:
//   pnpm exec playwright codegen --save-storage=.auth.json http://localhost:3000/admin/review
//   PW_STORAGE=.auth.json pnpm --filter @pcg/web shots
const pages: [string, string][] = [
  ["home", "/"],
  ["search", "/search?q=205/165"],
  ["login", "/admin-login"],
];

if (process.env.PW_STORAGE) {
  pages.push(["review", "/admin/review"], ["health", "/admin/health"]);
}

for (const [name, path] of pages) {
  test(name, async ({ page }, info) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `.shots/${name}-${info.project.name}.png`, fullPage: true });
  });
}
