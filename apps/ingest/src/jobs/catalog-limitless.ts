import type { Job } from "../run";
import { limitless, PausedError } from "@pcg/connectors";
import { mergeLimitlessCards, numberFromCatalog, resolveCardNameEn } from "@pcg/domain";
import { upsertSets, upsertProducts, loadSetProducts, loadSetIds, loadSetRow, type ProductRow } from "@pcg/db";

/** Same Japanese name up to character width and whitespace (ポリゴン2 = ポリゴン ２). */
const sameJa = (a: string, b: string) => a.normalize("NFKC").replace(/\s/g, "") === b.normalize("NFKC").replace(/\s/g, "");

/**
 * The number printed on a Limitless card. Limitless labels variant prints "12a"/"12b" (the card prints 012/xxx, like
 * card 12) and basic energy "NAN1" (the card prints no number); neither label is on the card.
 */
function limitlessNumber(label: string, setId: string): Pick<ProductRow, "number_printed" | "number_num" | "number_denom" | "number_suffix"> | null {
  if (/^NAN\d*$/i.test(label)) return { number_printed: "", number_num: null, number_denom: null, number_suffix: null };
  const m = /^(\d{1,3})[a-z]?$/.exec(label);
  const n = m ? numberFromCatalog(m[1]!.padStart(3, "0"), { id: setId, cardCountOfficial: null }) : null;
  return n ? { number_printed: n.printed, number_num: n.num, number_denom: n.denom, number_suffix: n.suffix } : null;
}

/** Japanese 2010+: Limitless owns names (Japanese and English), rarity and card lists; TCGdex keeps ids. */
export const catalogLimitless: Job = async ({ db, log }) => {
  const ours = await loadSetIds(db, "ja");
  const enIds = await loadSetIds(db, "en");
  let sets = 0, created = 0, updated = 0, skippedCards = 0;
  let failed = 0, dupes = 0, corrected = 0, jaReplaced = 0;
  for (const s of await limitless.listSets()) {
    try {
      const page = await limitless.getSet(s.code);
      const cards = page.cards.filter((c) => c.number.trim() !== "").map((c) => ({ ...c, number: c.number.trim() }));
      const dropped = page.cards.length - cards.length;
      if (dropped > 0) { skippedCards += dropped; log(`${s.code}: skipped ${dropped} card(s) with an empty number`); }
      if (cards.length === 0) { log(`skip ${s.code}: no cards listed`); continue; }
      const existingId = limitless.ourSetIdFor(s.code, ours);
      const setId = existingId ?? (enIds.has(s.code) ? `ja-${s.code}` : s.code);
      const prev = existingId ? await loadSetRow(db, setId) : null;
      const series = s.series ?? prev?.series ?? null;
      const aliases = [...new Set([...(prev?.aliases ?? []), ...(setId === s.code ? [] : [s.code])])];
      await upsertSets(db, [{
        id: setId, printed_code: prev?.printed_code ?? s.code, language: "ja",
        name_en: s.nameEn ?? prev?.name_en ?? null, name_ja: limitless.bareJaSetName(page.nameJa) ?? prev?.name_ja ?? null,
        release_date: (s.releaseDate ?? page.releaseDate) ?? prev?.release_date ?? null,
        card_count: prev?.card_count ?? s.cardCount, aliases,
        series, source: "limitless", limitless_code: setId === s.code ? null : s.code,
      }]);
      const existing = existingId ? await loadSetProducts(db, setId) : [];
      const byId = new Map(existing.map((p) => [p.id, p]));
      const seen = new Set<string>();
      const patches = mergeLimitlessCards(setId, existing, cards).filter((p) => {
        if (seen.has(p.id)) { dupes += 1; log(`${s.code}: dropped duplicate ${p.id}`); return false; }
        seen.add(p.id); return true;
      });
      // Whole rows only: an upsert with missing NOT NULL columns fails even when the row exists.
      await upsertProducts(db, patches.map((p): ProductRow => {
        const old = byId.get(p.id);
        // R17: Limitless owns name_ja on its sets (TCGdex swapped M6-098/099). The same name up to width/spacing keeps our spelling.
        const nameJa = old?.name_ja && p.nameJa && sameJa(old.name_ja, p.nameJa) ? old.name_ja : p.nameJa ?? old?.name_ja ?? null;
        const jaChanged = old?.name_ja != null && old.name_ja !== nameJa;
        // R15: Limitless EN vs curated dictionary, against the name_ja the row will show. When name_ja changed, the stored
        // English name belonged to the wrong Japanese name, so it is not carried over.
        const previous = jaChanged ? null : old?.name_en ?? null;
        const res = resolveCardNameEn({ nameJa, limitlessEn: p.name_en, type: p.type, rarity: p.rarity, series, previous });
        const nameEn = res.nameEn;
        if (jaChanged) {
          jaReplaced += 1;
          log(`${p.id}: name_ja ${JSON.stringify(old.name_ja)} -> ${JSON.stringify(nameJa)} (Limitless); name_en ${JSON.stringify(old.name_en)} -> ${JSON.stringify(nameEn)}${res.note ? `: ${res.note}` : ""}`);
        } else if (res.note) { corrected += 1; log(`${p.id} ${nameJa ?? ""}: name_en ${JSON.stringify(old?.name_en ?? null)} -> ${JSON.stringify(nameEn)}: ${res.note}`); }
        // Limitless owns the card list, so it owns numbering too; the printed total comes from PRINTED_TOTALS.
        const number = limitlessNumber(p.number, setId)
          ?? { number_printed: old?.number_printed ?? p.number, number_num: old?.number_num ?? null, number_denom: old?.number_denom ?? null, number_suffix: old?.number_suffix ?? null };
        if (old) return { ...old, ...number, name_ja: nameJa, name_en: nameEn, rarity: p.rarity };
        return { id: p.id, set_id: setId, ...number,
          name_en: nameEn, name_ja: p.nameJa, rarity: p.rarity, language: "ja", image_url: null, image_source: null };
      }));
      // Cards TCGdex lists but Limitless doesn't (mostly the highest secret rares) keep their rows; their total still
      // has to be the one printed on the set's cards, not TCGdex's count.
      const renumbered = existing.filter((r) => !seen.has(r.id) && r.number_num != null).flatMap((r): ProductRow[] => {
        const n = numberFromCatalog(String(r.number_num).padStart(3, "0"), { id: setId, cardCountOfficial: r.number_denom });
        if (!n || (n.printed === r.number_printed && n.denom === r.number_denom && n.suffix === r.number_suffix)) return [];
        return [{ ...r, number_printed: n.printed, number_denom: n.denom, number_suffix: n.suffix }];
      });
      if (renumbered.length) { await upsertProducts(db, renumbered); log(`${s.code}: renumbered ${renumbered.length} card(s) Limitless doesn't list`); }
      sets += 1; created += patches.filter((p) => !byId.has(p.id)).length; updated += patches.filter((p) => byId.has(p.id)).length;
      if (!existingId) ours.add(setId);
    } catch (e) {
      if (e instanceof PausedError) throw e;
      failed += 1;
      log(`set ${s.code}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  log(`${sets} sets, ${created} new cards, ${updated} cards updated, ${skippedCards} empty-number cards skipped, ${dupes} duplicates dropped, ${corrected} names corrected or dropped, ${jaReplaced} JA names replaced by Limitless's, ${failed} sets failed`);
  return { items_seen: sets, items_new: created, items_updated: updated };
};
