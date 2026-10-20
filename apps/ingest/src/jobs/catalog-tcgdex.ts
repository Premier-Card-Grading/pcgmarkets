import type { Job } from "../run";
import { tcgdex } from "@pcg/connectors";
import { upsertSets, upsertProducts } from "@pcg/db";

export const catalogTcgdex: Job = async ({ db, log }) => {
  let sets = 0, products = 0, skipped = 0;
  const lists = { ja: await tcgdex.listSets("ja"), en: await tcgdex.listSets("en") };
  const enIds = new Set(lists.en.map((s) => s.id));
  for (const lang of ["ja", "en"] as const) {
    log(`${lang}: ${lists[lang].length} sets`);
    for (const s of lists[lang]) {
      if (tcgdex.isMislabelledJa(lang, s.id)) { skipped += 1; continue; }
      const full = await tcgdex.getSet(lang, s.id);
      if (tcgdex.isDigitalOnly(full)) { skipped += 1; continue; }
      const id = tcgdex.catalogSetId(lang, full.id, enIds);
      await upsertSets(db, [tcgdex.toSetRow(lang, full, id)]);
      const rows = tcgdex.toProductRows(lang, full, id);
      await upsertProducts(db, rows);
      sets += 1; products += rows.length;
    }
  }
  const jaIds = new Set(lists.ja.map((s) => s.id.toLowerCase()));
  const supplement = tcgdex.JA_SUPPLEMENT_SETS.filter((s) => !jaIds.has(s.id.toLowerCase()) && !enIds.has(s.id));
  await upsertSets(db, supplement.map(tcgdex.supplementSetRow));
  sets += supplement.length;
  log(`skipped ${skipped} digital-only or mislabelled sets; added ${supplement.length} JA sets with no card list yet`);
  return { items_seen: sets, items_new: products, items_updated: 0 };
};
