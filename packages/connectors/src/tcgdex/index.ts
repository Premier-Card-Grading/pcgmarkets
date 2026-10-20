import type { Language } from "@pcg/domain";
import { numberFromCatalog } from "@pcg/domain";
import type { SetRow, ProductRow } from "@pcg/db";
import { politeFetch } from "../http";
import type { JaSupplementSet } from "./ja-supplement";
export { JA_SUPPLEMENT_SETS, type JaSupplementSet } from "./ja-supplement";

const BASE = "https://api.tcgdex.net/v2";

export interface TcgdexSetSummary { id: string; name: string; cardCount: { total: number; official: number } }
export interface TcgdexCard { id: string; localId: string; name: string; image?: string | null }
export interface TcgdexSet extends TcgdexSetSummary {
  releaseDate: string | null;
  cards: TcgdexCard[];
  abbreviation?: { official?: string };
  serie?: { id: string; name: string };
}

export async function listSets(lang: Language): Promise<TcgdexSetSummary[]> {
  const res = await politeFetch(`${BASE}/${lang}/sets`, { minIntervalMs: 250 });
  if (!res.ok) throw new Error(`tcgdex sets ${lang}: ${res.status}`);
  return (await res.json()) as TcgdexSetSummary[];
}

export async function getSet(lang: Language, id: string): Promise<TcgdexSet> {
  const res = await politeFetch(`${BASE}/${lang}/sets/${encodeURIComponent(id)}`, { minIntervalMs: 250 });
  if (!res.ok) throw new Error(`tcgdex set ${lang}/${id}: ${res.status}`);
  return (await res.json()) as TcgdexSet;
}

const isPromo = (id: string) => /-P$/i.test(id);

/** Pokémon TCG Pocket is a digital-only game; its sets are not physical cards. */
export const isDigitalOnly = (set: TcgdexSet) => set.serie?.id === "tcgp";

/** Chinese "CS…" releases that TCGdex lists under ja, all mislabelled "トリプレットビート". */
export const isMislabelledJa = (lang: Language, id: string) => lang === "ja" && /^CS/.test(id);

/** Known wrong JA set names in TCGdex, keyed by set id. */
export const JA_NAME_FIXES: Record<string, string> = { CP5: "幻・伝説ドリームキラコレクション" };

/** JA set ids that also exist in EN (e.g. neo1–neo4) get a "ja-" prefix so neither language overwrites the other. */
export const catalogSetId = (lang: Language, id: string, enIds: ReadonlySet<string>) => (lang === "ja" && enIds.has(id) ? `ja-${id}` : id);

export function toSetRow(lang: Language, set: TcgdexSet, id = set.id): SetRow {
  const printed = lang === "ja" ? set.id : (set.abbreviation?.official ?? null);
  const official = set.cardCount?.official && set.cardCount.official > 0 ? set.cardCount.official : null;
  return {
    id, printed_code: printed, language: lang,
    name_en: lang === "en" ? set.name : null, name_ja: lang === "ja" ? JA_NAME_FIXES[set.id] ?? set.name : null,
    release_date: set.releaseDate ?? null, card_count: isPromo(set.id) ? null : official,
    aliases: printed && printed !== id ? [printed] : [],
  };
}

/** A set-only row (no cards) for a Japanese set the API does not list. */
export function supplementSetRow(s: JaSupplementSet): SetRow {
  return { id: s.id, printed_code: s.id, language: "ja", name_en: null, name_ja: s.name_ja, release_date: s.release_date, card_count: s.card_count, aliases: [] };
}

export function toProductRows(lang: Language, set: TcgdexSet, setId = set.id): ProductRow[] {
  const official = set.cardCount?.official && set.cardCount.official > 0 ? set.cardCount.official : null;
  return set.cards.map((c) => {
    const n = numberFromCatalog(c.localId, { id: set.id, cardCountOfficial: official });
    return {
      id: setId === set.id ? c.id : `${setId}-${c.localId}`, set_id: setId,
      number_printed: n?.printed ?? c.localId, number_num: n?.num ?? null, number_denom: n?.denom ?? null, number_suffix: n?.suffix ?? null,
      name_en: lang === "en" ? c.name : null, name_ja: lang === "ja" ? c.name : null, rarity: null, language: lang,
      image_url: c.image ? `${c.image}/high.webp` : null,
    };
  });
}
