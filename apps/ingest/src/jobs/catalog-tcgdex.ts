import type { Job } from "../run";
import { tcgdex } from "@pcg/connectors";
import { resolveCardNameEn } from "@pcg/domain";
import { upsertSets, upsertProducts, loadLimitlessOwnedSetIds, loadSetProducts, type ProductRow } from "@pcg/db";

/** JA rows on TCGdex-owned sets: dictionary name, else the stored one; a stored name is only dropped with a logged reason. */
async function withStoredNames(db: Parameters<Job>[0]["db"], log: (m: string) => void, setId: string, series: string | null, rows: ProductRow[]): Promise<ProductRow[]> {
  const stored = new Map((await loadSetProducts(db, setId)).map((p) => [p.id, p.name_en]));
  return rows.map((r) => {
    const previous = stored.get(r.id) ?? null;
    const res = resolveCardNameEn({ nameJa: r.name_ja, limitlessEn: null, series, previous });
    if (res.note) log(`${r.id} ${r.name_ja ?? ""}: name_en ${JSON.stringify(previous)} -> ${JSON.stringify(res.nameEn)}: ${res.note}`);
    return { ...r, name_en: res.nameEn };
  });
}

export const catalogTcgdex: Job = async ({ db, log }) => {
  let sets = 0, products = 0, skipped = 0;
  const lists = { ja: await tcgdex.listSets("ja"), en: await tcgdex.listSets("en") };
  const enIds = new Set(lists.en.map((s) => s.id));
  const owned = await loadLimitlessOwnedSetIds(db);
  for (const lang of ["ja", "en"] as const) {
    log(`${lang}: ${lists[lang].length} sets`);
    for (const s of lists[lang]) {
      if (tcgdex.isMislabelledJa(lang, s.id) || tcgdex.isEmptyJaDuplicate(lang, s.id)) { skipped += 1; continue; }
      const full = await tcgdex.getSet(lang, s.id);
      if (tcgdex.isDigitalOnly(full)) { skipped += 1; continue; }
      const id = tcgdex.catalogSetId(lang, full.id, enIds);
      const setRow = tcgdex.toSetRow(lang, full, id);
      await upsertSets(db, [owned.has(id) ? tcgdex.withoutLimitlessOwned(setRow, "set") : setRow]);
      let rows = tcgdex.toProductRows(lang, full, id);
      if (lang === "ja" && !owned.has(id)) rows = await withStoredNames(db, log, id, setRow.series ?? null, rows);
      await upsertProducts(db, owned.has(id) ? rows.map((r) => tcgdex.withoutLimitlessOwned(r, "product")) : rows);
      sets += 1; products += rows.length;
    }
  }
  const jaIds = new Set(lists.ja.map((s) => s.id.toLowerCase()));
  const supplement = tcgdex.JA_SUPPLEMENT_SETS.filter((s) => !jaIds.has(s.id.toLowerCase()) && !enIds.has(s.id) && !owned.has(s.id));
  await upsertSets(db, supplement.map(tcgdex.supplementSetRow));
  sets += supplement.length;
  log(`skipped ${skipped} digital-only or mislabelled sets; added ${supplement.length} JA sets with no card list yet`);
  return { items_seen: sets, items_new: products, items_updated: 0 };
};
