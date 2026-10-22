// apps/ingest/src/jobs/estimates.ts
import type { Job, JobContext } from "../run";
import { lastOkImport, loadLinkedForEstimates, loadSetMap, loadPcgGradedPairs, loadPsaSalesForEstimates, replaceEstimates, type EstimateRowInput } from "@pcg/db";
import { combineEstimates, computeEstimates, dropDuplicateProducts, eraFor, psaGradePrices, FLAT_PCT, MAX_IMPORT_AGE_DAYS, PSA_WINDOW_DAYS, type Estimate, type EstimateInput } from "@pcg/domain";

/**
 * Estimated PCG prices for grades with no PCG sale, at a flat 75% of the PSA price. The PSA price comes from SoldComps
 * PSA sales (3+ in 90 days) first, else from PriceCharting's latest import (spec 2026-10-23-estimates-two-sources-design).
 */
export const estimatesJob: Job = async ({ db, log }) => {
  const now = new Date();
  const [graded, psaSales, imp] = await Promise.all([
    loadPcgGradedPairs(db), loadPsaSalesForEstimates(db, new Date(now.getTime() - PSA_WINDOW_DAYS * 86400000)), lastOkImport(db),
  ]);
  const psa = psaGradePrices(psaSales, now);

  let pc: Estimate[] = [], suspect = false;
  if (!imp) log("no PriceCharting import yet: SoldComps PSA prices only");
  else if ((now.getTime() - new Date(imp.fetched_at).getTime()) / 86400000 > MAX_IMPORT_AGE_DAYS) {
    suspect = true;
    log(`suspect: latest ok PriceCharting import is older than ${MAX_IMPORT_AGE_DAYS} days; its prices are left out`);
  } else pc = await pricechartingEstimates(db, graded, log);

  const est = combineEstimates(psa, pc, graded, FLAT_PCT);
  const rows: EstimateRowInput[] = est.map((e) => ({
    product_id: e.productId, grade_value: e.gradeValue, estimate_usd: e.estimateUsd, pct: e.pct, era: e.era, source: e.source,
    import_id: e.source === "pricecharting" ? imp!.id : null,
    source_as_of: (e.source === "pricecharting" ? new Date(imp!.fetched_at) : e.asOf!).toISOString(),
  }));
  const n = await replaceEstimates(db, rows);
  const bySource = (s: string) => est.filter((e) => e.source === s).length;
  log(`${n} estimates at ${FLAT_PCT * 100}% of the PSA price: ${bySource("soldcomps")} from SoldComps PSA sales (${psaSales.length} sales), ${bySource("pricecharting")} from PriceCharting`);
  return { items_seen: psaSales.length + pc.length, items_new: n, items_updated: 0, ...(suspect ? { suspect: true } : {}) };
};

async function pricechartingEstimates(db: JobContext["db"], graded: Set<string>, log: (m: string) => void): Promise<Estimate[]> {
  const [linked, map] = await Promise.all([loadLinkedForEstimates(db), loadSetMap(db)]);
  const override = new Map(map.map((m) => [m.setId, m.eraOverride]));
  const consoleFor = new Map(map.map((m) => [m.setId, m.consoleName]));
  const inputs: EstimateInput[] = [];
  let noEra = 0, staleLinks = 0;
  for (const l of linked) {
    // An auto link counts only while its console is still mapped to the card's set; admin overrides always count.
    if (!l.isOverride && consoleFor.get(l.setId) !== l.consoleName) { staleLinks++; continue; }
    const era = eraFor(l.releaseDate, override.get(l.setId) ?? null);
    if (!era) { noEra++; continue; }
    inputs.push({ productId: l.productId, language: l.language, era, salesVolume: l.salesVolume, pricesUsd: l.pricesUsd });
  }
  const { unique, duplicates } = dropDuplicateProducts(inputs);
  if (duplicates.length) log(`skipped ${duplicates.length} products linked to several PriceCharting rows: ${duplicates.slice(0, 10).join(", ")}`);
  if (staleLinks) log(`skipped ${staleLinks} auto links whose PriceCharting console is no longer mapped to the card's set`);
  if (noEra) log(`skipped ${noEra} cards with no release date and no era_override`);
  return computeEstimates(unique, graded, { flatPct: FLAT_PCT });
}
