import type { Job } from "../run";
import { pokemontcg, PausedError } from "@pcg/connectors";
import { loadEnMissingImages, setCardImageFrom } from "@pcg/db";

/** Links pokemontcg.io images for English cards that have no image yet. */
export const imagesEn: Job = async ({ db, log }) => {
  const bySet = await loadEnMissingImages(db);
  let seen = 0, filled = 0;
  for (const [setId, cards] of bySet) {
    seen += cards.length;
    let theirs: pokemontcg.PtcgCard[];
    try { theirs = await pokemontcg.listCards(pokemontcg.ptcgSetId(setId)); }
    catch (e) {
      if (e instanceof PausedError) throw e;
      log(`skip ${setId}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (const m of pokemontcg.matchImages(cards, theirs)) { await setCardImageFrom(db, m.id, m.url, "pokemontcg"); filled += 1; }
  }
  log(`filled ${filled} of ${seen} missing English images`);
  return { items_seen: seen, items_new: filled, items_updated: 0 };
};
