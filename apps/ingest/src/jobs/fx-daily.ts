import type { Job } from "../run";
import { fetchRates } from "@pcg/connectors";
import { upsertFxRates, observedCurrencies } from "@pcg/db";

export const fxDaily: Job = async ({ db, log }) => {
  const bases = [...new Set(["JPY", "USD", ...(await observedCurrencies(db))])];
  const today = new Date().toISOString().slice(0, 10);
  // Backfill the last 7 days so weekend/holiday gaps and late-arriving sales resolve.
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const rows = await fetchRates(d, bases);
    await upsertFxRates(db, rows);
    n += rows.length;
  }
  log(`rates for ${bases.join(",")} through ${today}`);
  return { items_seen: n, items_new: n, items_updated: 0 };
};
