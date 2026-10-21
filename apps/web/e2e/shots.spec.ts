import { test } from "@playwright/test";

// Needs the live Supabase DB (the sets pages read the imported catalogue).
// Admin pages (review/health) need an authenticated storage state, captured once via:
//   pnpm exec playwright codegen --save-storage=.auth.json http://localhost:3000/admin/review
//   PW_STORAGE=.auth.json pnpm --filter @pcg/web shots
const pages: [string, string][] = [
  ["home", "/"],
  ["search", "/search?q=205/165"],
  ["login", "/admin-login"],
  ["sets-en", "/sets"],
  ["sets-ja", "/sets?lang=ja"],
  ["set-sv11b", "/sets/SV11B"],
  ["set-pmcg1", "/sets/PMCG1"],
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
