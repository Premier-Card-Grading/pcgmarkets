// apps/ingest/src/jobs/pricecharting-csv.ts
import type { Job } from "../run";
import { downloadPcCsv, parsePcCsv, checkImport } from "@pcg/connectors";
import { lastOkImport, startImport, finishImport, upsertPcProducts, deleteStalePcProducts, snapshotPcPrices } from "@pcg/db";
import { linkMapped } from "./pricecharting-link";

export function pricechartingCsvJob(deps: { download: (token: string) => Promise<string> } = { download: downloadPcCsv }): Job {
  return async ({ db, log }) => {
    const token = process.env.PRICECHARTING_TOKEN;
    if (!token) throw new Error("PRICECHARTING_TOKEN is required (Legendary subscription → API/Download)");
    const { rows, missing, malformed } = parsePcCsv(await deps.download(token));
    if (malformed > 0) log(`skipped ${malformed} malformed CSV rows`);
    const last = await lastOkImport(db);
    const check = checkImport(rows.length, missing, last?.row_count ?? null, malformed);
    const importId = await startImport(db, rows.length);
    if (!check.ok) {
      await finishImport(db, importId, "suspect", check.reason);
      log(`suspect, previous data kept: ${check.reason}`);
      return { items_seen: rows.length, items_new: 0, items_updated: 0, suspect: true };
    }
    await upsertPcProducts(db, importId, rows);
    await deleteStalePcProducts(db, importId);
    await finishImport(db, importId, "ok", null);
    // PriceCharting serves today's file only: our dated copies are the only history there will be.
    log(`price history: ${await snapshotPcPrices(db, importId)} card(s) changed`);
    // note: if linkMapped fails after this point the import stays committed; re-run `pricecharting:link`
    log(`imported ${rows.length} PriceCharting rows`);
    const { linked, review } = await linkMapped(db, log);
    return { items_seen: rows.length, items_new: linked, items_updated: review };
  };
}
