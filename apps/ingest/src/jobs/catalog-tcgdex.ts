import type { Job } from "../run";
import { tcgdex } from "@pcg/connectors";
import { resolveCardNameEn } from "@pcg/domain";
import { upsertSets, upsertProducts, loadLimitlessOwnedSetIds, loadSetProducts, type ProductRow } from "@pcg/db";

/** JA rows on TCGdex-owned sets: dictionary name, else the stored one; a stored name is only dropped with a logged reason. */
function withStoredNames(log: (m: string) => void, stored: Map<string, ProductRow>, series: string | null, rows: ProductRow[]): ProductRow[] {
  return rows.map((r) => {
    const previous = stored.get(r.id)?.name_en ?? null;
    const res = resolveCardNameEn({ nameJa: r.name_ja, limitlessEn: null, series, previous });
    if (res.note) log(`${r.id} ${r.name_ja ?? ""}: name_en ${JSON.stringify(previous)} -> ${JSON.stringify(res.nameEn)}: ${res.note}`);
    return { ...r, name_en: res.nameEn };
  });
}

/**
 * C1: TCGdex has no image -> keep the stored one (pokemontcg.io from images:en). Our own copy in storage (images:mirror)
 * is also kept over TCGdex's remote URL. Keys stay on every row: a batch upsert nulls missing keys.
 */
const isOurCopy = (url: string) => url.includes("/storage/v1/object/public/card-images/");
const withStoredImages = (stored: Map<string, ProductRow>, rows: ProductRow[]): ProductRow[] =>
  rows.map((r) => {
    const old = stored.get(r.id);
    const keep = old?.image_url != null && (r.image_url == null || isOurCopy(old.image_url));
    return keep ? { ...r, image_url: old!.image_url, image_source: old!.image_source ?? null } : r;
  });

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
      const stored = new Map((await loadSetProducts(db, id)).map((p) => [p.id, p]));
      let rows = tcgdex.toProductRows(lang, full, id);
      if (owned.has(id)) {
        // C2: Limitless owns this set row and every stored card on it; TCGdex only adds cards we do not have yet.
        rows = rows.filter((r) => !stored.has(r.id));
      } else {
        await upsertSets(db, [setRow]);
        if (lang === "ja") rows = withStoredNames(log, stored, setRow.series ?? null, rows);
        rows = withStoredImages(stored, rows);
      }
      await upsertProducts(db, rows);
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
