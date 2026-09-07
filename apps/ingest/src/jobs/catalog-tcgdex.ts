import type { Job } from "../run";
import { tcgdex } from "@pcg/connectors";
import { upsertSets, upsertProducts } from "@pcg/db";

export const catalogTcgdex: Job = async ({ db, log }) => {
  let sets = 0, products = 0;
  for (const lang of ["ja", "en"] as const) {
    const summaries = await tcgdex.listSets(lang);
    log(`${lang}: ${summaries.length} sets`);
    for (const s of summaries) {
      const full = await tcgdex.getSet(lang, s.id);
      await upsertSets(db, [tcgdex.toSetRow(lang, full)]);
      const rows = tcgdex.toProductRows(lang, full);
      await upsertProducts(db, rows);
      sets += 1; products += rows.length;
    }
  }
  return { items_seen: sets, items_new: products, items_updated: 0 };
};
