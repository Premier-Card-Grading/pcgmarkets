import type { Job } from "../run";
import { limitless, PausedError } from "@pcg/connectors";
import { mergeLimitlessCards, numberFromCatalog } from "@pcg/domain";
import { upsertSets, upsertProducts, loadSetProducts, loadSetIds, loadSetRow, type ProductRow } from "@pcg/db";

/** Japanese 2010+: Limitless owns names, rarity and card lists; TCGdex keeps ids and Japanese names. */
export const catalogLimitless: Job = async ({ db, log }) => {
  const ours = await loadSetIds(db, "ja");
  const enIds = await loadSetIds(db, "en");
  let sets = 0, created = 0, updated = 0, skippedCards = 0;
  let failed = 0, dupes = 0;
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
      const aliases = [...new Set([...(prev?.aliases ?? []), ...(setId === s.code ? [] : [s.code])])];
      await upsertSets(db, [{
        id: setId, printed_code: prev?.printed_code ?? s.code, language: "ja",
        name_en: s.nameEn ?? prev?.name_en ?? null, name_ja: limitless.bareJaSetName(page.nameJa) ?? prev?.name_ja ?? null,
        release_date: (s.releaseDate ?? page.releaseDate) ?? prev?.release_date ?? null,
        card_count: prev?.card_count ?? s.cardCount, aliases,
        series: s.series ?? prev?.series ?? null, source: "limitless", limitless_code: setId === s.code ? null : s.code,
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
        if (old) return { ...old, name_en: p.name_en, rarity: p.rarity };
        const n = numberFromCatalog(/^\d{1,3}$/.test(p.number) ? p.number.padStart(3, "0") : p.number, { id: setId, cardCountOfficial: null });
        return { id: p.id, set_id: setId, number_printed: n?.printed ?? p.number, number_num: n?.num ?? null, number_denom: null, number_suffix: n?.suffix ?? null,
          name_en: p.name_en, name_ja: p.nameJa, rarity: p.rarity, language: "ja", image_url: null, image_source: null };
      }));
      sets += 1; created += patches.filter((p) => !byId.has(p.id)).length; updated += patches.filter((p) => byId.has(p.id)).length;
      if (!existingId) ours.add(setId);
    } catch (e) {
      if (e instanceof PausedError) throw e;
      failed += 1;
      log(`set ${s.code}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  log(`${sets} sets, ${created} new cards, ${updated} cards updated, ${skippedCards} empty-number cards skipped, ${dupes} duplicates dropped, ${failed} sets failed`);
  return { items_seen: sets, items_new: created, items_updated: updated };
};
