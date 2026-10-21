import type { Language } from "@pcg/domain";
import { numberFromCatalog, translateJaCardName } from "@pcg/domain";
import type { SetRow, ProductRow } from "@pcg/db";
import { politeFetch } from "../http";
import type { JaSupplementSet } from "./ja-supplement";
import { JA_SET_NAMES } from "./ja-set-names";
export { JA_SUPPLEMENT_SETS, type JaSupplementSet } from "./ja-supplement";

const BASE = "https://api.tcgdex.net/v2";

export interface TcgdexSetSummary { id: string; name: string; cardCount: { total: number; official: number } }
export interface TcgdexCard { id: string; localId: string; name: string; image?: string | null }
export interface TcgdexSet extends TcgdexSetSummary {
  releaseDate: string | null;
  cards: TcgdexCard[];
  abbreviation?: { official?: string };
  serie?: { id: string; name: string };
  logo?: string;
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

/** Empty duplicates TCGdex lists under ja (SM1+, sm2+ ...): 0 cards, same name and date as the real SM1p..SM5p sets. */
export const isEmptyJaDuplicate = (lang: Language, id: string) => lang === "ja" && /^SM\d\+$/i.test(id);

/** Known wrong JA set names in TCGdex, keyed by set id. */
export const JA_NAME_FIXES: Record<string, string> = { CP5: "幻・伝説ドリームキラコレクション" };

/** JA set ids that also exist in EN (e.g. neo1–neo4) get a "ja-" prefix so neither language overwrites the other. */
export const catalogSetId = (lang: Language, id: string, enIds: ReadonlySet<string>) => (lang === "ja" && enIds.has(id) ? `ja-${id}` : id);

/** Japanese TCGdex series ids -> English series names. */
export const JA_SERIES: Record<string, string> = {
  PMCG: "Original era", neo: "Neo", VS: "VS", web: "web", e: "e-Card", ADV: "ADV / PCG", PCG: "ADV / PCG",
  DP: "Diamond & Pearl", DPt: "Diamond & Pearl", L: "HeartGold & SoulSilver (LEGEND)", BW: "Black & White",
  XY: "XY", XYb: "XY", SM: "Sun & Moon", S: "Sword & Shield", SV: "Scarlet & Violet", M: "Mega",
};
export function seriesFor(lang: Language, set: TcgdexSet): string | null {
  if (!set.serie) return null;
  return lang === "en" ? set.serie.name : JA_SERIES[set.serie.id] ?? null;
}
export const logoFor = (set: TcgdexSet) => (set.logo ? `${set.logo}.png` : null);

const LIMITLESS_OWNED = ["name_en", "rarity", "image_url", "image_source", "series", "logo_url"] as const;
/** Copy of a row without the fields Limitless owns, so a TCGdex upsert never overwrites them. */
export function withoutLimitlessOwned<T extends object>(row: T, _kind: "set" | "product"): T {
  const out = { ...row } as Record<string, unknown>;
  for (const k of LIMITLESS_OWNED) delete out[k];
  return out as T;
}

export function toSetRow(lang: Language, set: TcgdexSet, id = set.id): SetRow {
  const printed = lang === "ja" ? set.id : (set.abbreviation?.official ?? null);
  const official = set.cardCount?.official && set.cardCount.official > 0 ? set.cardCount.official : null;
  return {
    id, printed_code: printed, language: lang,
    name_en: lang === "en" ? set.name : JA_SET_NAMES[id]?.name_en ?? null, name_ja: lang === "ja" ? JA_NAME_FIXES[set.id] ?? set.name : null,
    series: seriesFor(lang, set), logo_url: logoFor(set),
    release_date: set.releaseDate ?? null, card_count: isPromo(set.id) ? null : official,
    aliases: printed && printed !== id ? [printed] : [],
  };
}

/** A set-only row (no cards) for a Japanese set the API does not list. */
export function supplementSetRow(s: JaSupplementSet): SetRow {
  return { id: s.id, printed_code: s.id, language: "ja", name_en: JA_SET_NAMES[s.id]?.name_en ?? null, name_ja: s.name_ja, release_date: s.release_date, card_count: s.card_count, aliases: [], series: s.series };
}

export function toProductRows(lang: Language, set: TcgdexSet, setId = set.id): ProductRow[] {
  const official = set.cardCount?.official && set.cardCount.official > 0 ? set.cardCount.official : null;
  return set.cards.map((c) => {
    const n = numberFromCatalog(c.localId, { id: set.id, cardCountOfficial: official });
    return {
      id: setId === set.id ? c.id : `${setId}-${c.localId}`, set_id: setId,
      number_printed: n?.printed ?? c.localId, number_num: n?.num ?? null, number_denom: n?.denom ?? null, number_suffix: n?.suffix ?? null,
      name_en: lang === "en" ? c.name : translateJaCardName(c.name, { series: seriesFor(lang, set) }), name_ja: lang === "ja" ? c.name : null, rarity: null, language: lang,
      image_url: c.image ? `${c.image}/high.webp` : null, image_source: c.image ? "tcgdex" : null,
    };
  });
}
