// apps/ingest/src/jobs/estimates.ts
import type { Job } from "../run";
import { lastOkImport, loadLinkedForEstimates, loadSetMap, loadPcgGradedPairs, replaceEstimates } from "@pcg/db";
import { computeEstimates, dropDuplicateProducts, eraFor, MAX_IMPORT_AGE_DAYS, type EstimateInput } from "@pcg/domain";

export const estimatesJob: Job = async ({ db, log }) => {
  const imp = await lastOkImport(db);
  if (!imp) throw new Error("no ok PriceCharting import yet; run `pnpm ingest pricecharting:csv` first");
  const ageDays = (Date.now() - new Date(imp.fetched_at).getTime()) / 86400000;
  if (ageDays > MAX_IMPORT_AGE_DAYS) {
    log(`suspect: latest ok import is ${ageDays.toFixed(1)} days old (max ${MAX_IMPORT_AGE_DAYS}); existing estimates kept`);
    return { items_seen: 0, items_new: 0, items_updated: 0, suspect: true };
  }
  const [linked, map, graded] = await Promise.all([loadLinkedForEstimates(db), loadSetMap(db), loadPcgGradedPairs(db)]);
  const override = new Map(map.map((m) => [m.setId, m.eraOverride]));
  const inputs: EstimateInput[] = [];
  let noEra = 0;
  for (const l of linked) {
    const era = eraFor(l.releaseDate, override.get(l.setId) ?? null);
    if (!era) { noEra++; continue; }
    inputs.push({ productId: l.productId, language: l.language, era, salesVolume: l.salesVolume, pricesUsd: l.pricesUsd });
  }
  const { unique, duplicates } = dropDuplicateProducts(inputs);
  if (duplicates.length) log(`skipped ${duplicates.length} products linked to several PriceCharting rows: ${duplicates.slice(0, 10).join(", ")}`);
  if (noEra) log(`skipped ${noEra} cards with no release date and no era_override`);
  const est = computeEstimates(unique, graded);
  const n = await replaceEstimates(db, est.map((e) => ({ product_id: e.productId, grade_value: e.gradeValue, estimate_usd: e.estimateUsd, pct: e.pct, era: e.era, import_id: imp.id, source_as_of: imp.fetched_at })));
  const byEra = new Map<string, number>();
  for (const e of est) byEra.set(e.era, (byEra.get(e.era) ?? 0) + 1);
  log(`${n} estimates for ${unique.length} cards (${[...byEra].map(([k, v]) => `${k} ${v}`).join(", ")})`);
  return { items_seen: linked.length, items_new: n, items_updated: 0 };
};
