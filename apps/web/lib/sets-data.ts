import type { SupabaseClient } from "@supabase/supabase-js";
import { ESTIMATE_MAX_AGE_DAYS } from "./grades";

export type Lang = "en" | "ja";
export const asLang = (v: string | undefined): Lang => (v === "ja" ? "ja" : "en");

export interface SetTile { id: string; code: string | null; nameEn: string | null; nameJa: string | null; displayName: string; releaseDate: string | null; cardCount: number | null; officialCount: number | null; hasCards: boolean; logoUrl: string | null; series: string | null; saleCount: number; aliases: string[] }
export interface SeriesGroup { series: string; sets: SetTile[] }
export interface SetCard { id: string; number_printed: string; number_num: number | null; number_denom: number | null; number_suffix: string | null; name_en: string | null; name_ja: string | null; rarity: string | null; image_url: string | null; pcg10_median_usd: number | null; pcg10_n_sales: number | null; est10_usd: number | null; est10_as_of: string | null; sale_count: number }
export type TilePrice = { kind: "pcg"; usd: number; nSales: number } | { kind: "estimate"; usd: number } | { kind: "none" };

interface SetDbRow { id: string; printed_code: string | null; name_en: string | null; name_ja: string | null; release_date: string | null; card_count: number | null; logo_url: string | null; series: string | null; aliases: string[] | null; language: Lang; products: { count: number }[] }
const SET_COLS = "id,printed_code,name_en,name_ja,release_date,card_count,logo_url,series,aliases,language,products(count)";

const byDateDesc = (a: string | null, b: string | null) => (b ?? "").localeCompare(a ?? "");

function toTile(r: SetDbRow, sales: Map<string, number>): SetTile {
  const count = r.products?.[0]?.count ?? 0;
  return { id: r.id, code: r.printed_code, nameEn: r.name_en, nameJa: r.name_ja, displayName: r.name_en ?? r.name_ja ?? r.id, releaseDate: r.release_date,
    cardCount: count, officialCount: r.card_count, hasCards: count > 0, logoUrl: r.logo_url, series: r.series, saleCount: sales.get(r.id) ?? 0, aliases: r.aliases ?? [] };
}

export function groupBySeries(tiles: SetTile[]): SeriesGroup[] {
  const map = new Map<string, SetTile[]>();
  for (const t of tiles) map.set(t.series ?? "Other", [...(map.get(t.series ?? "Other") ?? []), t]);
  const groups = [...map].map(([series, sets]) => ({ series, sets: [...sets].sort((a, b) => byDateDesc(a.releaseDate, b.releaseDate)) }));
  return groups.sort((a, b) => (a.series === "Other" ? 1 : b.series === "Other" ? -1 : byDateDesc(a.sets[0]?.releaseDate ?? null, b.sets[0]?.releaseDate ?? null)));
}

export function filterTiles(tiles: SetTile[], q: string): SetTile[] {
  const t = q.trim().toLowerCase();
  if (!t) return tiles;
  return tiles.filter((s) => [s.nameEn, s.nameJa, s.code, s.id, ...s.aliases].some((v) => v?.toLowerCase().includes(t)));
}

export function tilePrice(c: SetCard, now: Date): TilePrice {
  if (c.pcg10_median_usd != null && (c.pcg10_n_sales ?? 0) > 0) return { kind: "pcg", usd: Number(c.pcg10_median_usd), nSales: c.pcg10_n_sales! };
  const fresh = c.est10_as_of != null && now.getTime() - new Date(c.est10_as_of).getTime() <= ESTIMATE_MAX_AGE_DAYS * 86400000;
  if (c.est10_usd != null && fresh) return { kind: "estimate", usd: Number(c.est10_usd) };
  return { kind: "none" };
}

export function sortCards(cards: SetCard[], by: "number" | "price", now: Date): SetCard[] {
  const num = (c: SetCard) => c.number_num ?? Number.MAX_SAFE_INTEGER;
  const byNum = (a: SetCard, b: SetCard) => num(a) - num(b) || a.number_printed.localeCompare(b.number_printed);
  if (by === "number") return [...cards].sort(byNum);
  const usd = (c: SetCard) => { const p = tilePrice(c, now); return p.kind === "none" ? -1 : p.usd; };
  return [...cards].sort((a, b) => usd(b) - usd(a) || byNum(a, b));
}

/** Sale counts per set (one set when `id` is given). A failed read throws rather than showing every set as unsold. */
async function saleCounts(db: SupabaseClient, id?: string): Promise<Map<string, number>> {
  const q = db.from("set_sale_counts").select("id,sale_count");
  const { data, error } = await (id == null ? q : q.eq("id", id));
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { id: string; sale_count: number }[]).map((r) => [r.id, r.sale_count]));
}

export async function loadSetsIndex(db: SupabaseClient, lang: Lang) {
  const [sales, rows, en, ja] = await Promise.all([
    saleCounts(db),
    db.from("sets").select(SET_COLS).eq("language", lang).order("release_date", { ascending: false }).order("id").range(0, 999),
    db.from("sets").select("id", { count: "exact", head: true }).eq("language", "en"),
    db.from("sets").select("id", { count: "exact", head: true }).eq("language", "ja"),
  ]);
  for (const r of [rows, en, ja]) if (r.error) throw new Error(r.error.message);
  const tiles = ((rows.data ?? []) as unknown as SetDbRow[]).map((r) => toTile(r, sales));
  return { groups: groupBySeries(tiles), counts: { en: en.count ?? 0, ja: ja.count ?? 0 } };
}

export async function loadSetPage(db: SupabaseClient, id: string) {
  const { data: row, error } = await db.from("sets").select(SET_COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const r = row as unknown as SetDbRow;
  const sales = await saleCounts(db, id);
  const cards: SetCard[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error: e } = await db.from("public_set_cards").select("*").eq("set_id", id).order("number_num", { ascending: true, nullsFirst: false }).order("id").range(from, from + 999);
    if (e) throw new Error(e.message);
    cards.push(...((data ?? []) as SetCard[]));
    if ((data ?? []).length < 1000) break;
  }
  return { set: { ...toTile(r, sales), language: r.language }, cards };
}
