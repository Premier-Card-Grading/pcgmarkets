import { test, expect, type Page } from "@playwright/test";

// Needs the live Supabase DB with the imported catalogue (SV11B and PMCG1 exist as set ids).
test.setTimeout(120_000);
test.use({ viewport: { width: 390, height: 844 } });

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // Remote set logos can 404 in the image optimizer; that is not a page error.
    if (/_next\/image|Failed to load resource.*404/i.test(m.text() + (m.location().url ?? ""))) return;
    errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

const tiles = (page: Page) => page.locator("main ul > li");

// The grid is a client component: a fill that lands before hydration is lost, so retry until it sticks.
async function search(page: Page, q: string, count: number) {
  await expect(async () => {
    await page.getByPlaceholder(/Card #/).fill("");
    await page.getByPlaceholder(/Card #/).fill(q);
    await expect(tiles(page)).toHaveCount(count, { timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

async function openSet(page: Page, id: string) {
  await page.goto(`/sets/${id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(tiles(page).first()).toBeVisible();
}

test("SV11B: a full card number finds exactly one card", async ({ page }) => {
  const errors = watchConsole(page);
  await openSet(page, "SV11B");
  await search(page, "069/174", 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("PMCG1: a bare number narrows to the 003 card", async ({ page }) => {
  const errors = watchConsole(page);
  await openSet(page, "PMCG1");
  const before = await tiles(page).count();
  await search(page, "3", 1);
  expect(before).toBeGreaterThan(1);
  await expect(tiles(page).first()).toContainText(/0?03/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
