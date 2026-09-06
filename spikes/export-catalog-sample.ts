// Coverage-gate spike (Task 15) support script for Task 18's matcher
// regression test fixture. Exports a small, real slice of the catalog
// (all sets + products from the most-recently-released JA sets) to
// packages/domain/test/fixtures/catalog-sample.json so the Task 18 test can
// exercise `matchJp`/`matchEbay` against real set/number data without a live
// DB connection.
//
// NOT run as part of Task 15 — there is no catalog in the DB yet (that lands
// in Task 16's TCGdex sync). Committed now so Task 16/18 can run it as-is.
// Usage (after Task 16 has populated `sets`/`products`):
//   set -a; source .env; set +a
//   pnpm tsx spikes/export-catalog-sample.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { createServiceClient, must } from "../packages/db/src";

const RECENT_JA_SET_LIMIT = 20;

const db = createServiceClient();

const sets = must(await db.from("sets").select("*").order("release_date", { ascending: false }));

const recentJaSetIds = sets
  .filter((s: { language: string }) => s.language === "ja")
  .slice(0, RECENT_JA_SET_LIMIT)
  .map((s: { id: string }) => s.id);

const products = recentJaSetIds.length
  ? must(await db.from("products").select("*").eq("language", "ja").in("set_id", recentJaSetIds))
  : [];

const outDir = "packages/domain/test/fixtures";
mkdirSync(outDir, { recursive: true });
const file = `${outDir}/catalog-sample.json`;
writeFileSync(file, JSON.stringify({ sets, products }, null, 2));

console.log(JSON.stringify({ file, sets: sets.length, recentJaSets: recentJaSetIds.length, products: products.length }, null, 2));
