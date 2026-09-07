import type { Language } from "@pcg/domain";
import { numberFromCatalog } from "@pcg/domain";
import type { SetRow, ProductRow } from "@pcg/db";
import { politeFetch } from "../http";

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

export function toSetRow(lang: Language, set: TcgdexSet): SetRow {
  const printed = lang === "ja" ? set.id : (set.abbreviation?.official ?? null);
  const official = set.cardCount?.official && set.cardCount.official > 0 ? set.cardCount.official : null;
  return {
    id: set.id, printed_code: printed, language: lang,
    name_en: lang === "en" ? set.name : null, name_ja: lang === "ja" ? set.name : null,
    release_date: set.releaseDate ?? null, card_count: isPromo(set.id) ? null : official,
    aliases: printed && printed !== set.id ? [printed] : [],
  };
}

export function toProductRows(lang: Language, set: TcgdexSet): ProductRow[] {
  const official = set.cardCount?.official && set.cardCount.official > 0 ? set.cardCount.official : null;
  return set.cards.map((c) => {
    const n = numberFromCatalog(c.localId, { id: set.id, cardCountOfficial: official });
    return {
      id: c.id, set_id: set.id,
      number_printed: n?.printed ?? c.localId, number_num: n?.num ?? null, number_denom: n?.denom ?? null, number_suffix: n?.suffix ?? null,
      name_en: lang === "en" ? c.name : null, name_ja: lang === "ja" ? c.name : null, rarity: null, language: lang,
      image_url: c.image ? `${c.image}/high.webp` : null,
    };
  });
}
