// Coverage-gate spike (Task 15): count PCG Pokemon sold listings per source
// over a trailing 30-day window and print a JSON summary + sample titles.
//
// Usage: pnpm tsx spikes/count-coverage.ts <yahoo|thecardapi>
//
// Env is expected to already be loaded into the shell (see task brief:
// `set -a; source .env; set +a`) rather than via `dotenv/config` — `spikes/`
// is intentionally not a pnpm workspace member (see pnpm-workspace.yaml), so
// it has no node_modules of its own and can't resolve a bare `dotenv`
// import. We still support a local .env for convenience via a tiny inline
// loader, but never throw if it's absent.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { yahooAuctions, theCardApi } from "../packages/connectors/src";
import { parseGradeFromText, hasPcgSetCodeNoise, hasPcgsNoise } from "../packages/domain/src";
import type { RawListing } from "../packages/domain/src";

// Minimal .env loader (KEY=VALUE per line, no expansion), only fills in
// vars not already set by the shell. Safe no-op if .env doesn't exist.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const which = process.argv[2] ?? "yahoo";
const conn = which === "yahoo" ? yahooAuctions : theCardApi;
const since = new Date(Date.now() - 30 * 86400000);
const outDir = "spikes/out"; mkdirSync(outDir, { recursive: true });
const file = `${outDir}/${which}.json`;
const seen: Record<string, RawListing> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};

for await (const page of conn.fetchSold(null)) {
  for (const l of page.listings) seen[l.sourceItemId] = l;
  if (page.listings.some((l) => l.soldAt && new Date(l.soldAt) < since)) break;
}
writeFileSync(file, JSON.stringify(seen, null, 2));

const all = Object.values(seen);
const inWindow = all.filter((l) => l.kind === "sold" && l.soldAt && new Date(l.soldAt) >= since);
const pcg = inWindow.filter((l) => {
  const t = l.title;
  if (which === "thecardapi") return /premier card grading|\bPCG\b/i.test((l.metadata as { grader?: string }).grader ?? "") || parseGradeFromText(t) != null;
  return parseGradeFromText(t) != null && !(hasPcgSetCodeNoise(t) && parseGradeFromText(t) == null) && !hasPcgsNoise(t);
});
console.log(JSON.stringify({ source: which, fetched: all.length, soldInLast30d: inWindow.length, pcgSoldInLast30d: pcg.length, withGraderAspect: inWindow.filter((l) => "grader" in l.metadata).length }, null, 2));
console.log("sample titles:\n" + pcg.slice(0, 25).map((l) => `- ${l.title}`).join("\n"));
