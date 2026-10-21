import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtDateShort } from "./format";
export interface RecentRow { id: string; product_id: string; name_en: string | null; name_ja: string | null; number_printed: string; image_url: string | null; set_code: string | null; set_name_en: string | null; set_name_ja: string | null; language: "ja" | "en"; grade_value: number; grade_label: string | null; price: number; currency: string; price_usd: number | null; sold_at: string; source: string }
export interface RecentSale { id: string; productId: string; name: string; setLine: string; imageUrl: string | null; gradeValue: number; gradeLabel: string | null; priceUsd: number | null; source: string; soldAt: string }
export interface SetRow { id: string; name_en: string | null; name_ja: string | null; printed_code: string | null; language: "ja" | "en"; sale_count: number }
const SOURCES: Record<string, string> = { thecardapi: "eBay", soldcomps: "eBay", yahoo_auc: "Yahoo!" };
export const sourceName = (s: string) => SOURCES[s] ?? s;
export function setLine(r: Pick<RecentRow, "set_code" | "set_name_en" | "set_name_ja" | "number_printed" | "sold_at">) {
  const head = r.set_code ?? r.set_name_en ?? r.set_name_ja ?? ""; return `${[head, r.number_printed].filter(Boolean).join(" ")} · ${fmtDateShort(r.sold_at)}`;
}
export function toRecentSale(r: RecentRow): RecentSale {
  return { id: r.id, productId: r.product_id, name: (r.name_en ?? r.name_ja) ?? r.product_id, setLine: setLine(r), imageUrl: r.image_url,
    gradeValue: Number(r.grade_value), gradeLabel: r.grade_label && r.grade_label !== "any" ? r.grade_label : null, priceUsd: r.price_usd == null ? null : Number(r.price_usd), source: sourceName(r.source), soldAt: r.sold_at };
}
export async function loadHome(db: SupabaseClient) {
  try {
    const [{ data: recent }, { data: sets }, { count }] = await Promise.all([
      db.from("public_recent_sales").select("*").order("sold_at", { ascending: false }).limit(12),
      db.from("set_sale_counts").select("*").order("sale_count", { ascending: false }).limit(6),
      db.from("sets").select("id", { count: "exact", head: true }),
    ]);
    const rows = ((recent ?? []) as RecentRow[]).map(toRecentSale);
    let setRows = (sets ?? []) as SetRow[];
    if (setRows.length === 0) { const { data } = await db.from("sets").select("id,name_en,name_ja,printed_code,language").order("release_date", { ascending: false }).limit(6); setRows = ((data ?? []) as Omit<SetRow, "sale_count">[]).map((s) => ({ ...s, sale_count: 0 })); }
    return { recent: rows, sets: setRows, setTotal: count ?? 0, updatedAt: rows[0]?.soldAt ?? null };
  } catch {
    // DB paused or views not applied yet — render the page with empty states instead of failing the build
    return { recent: [], sets: [], setTotal: 0, updatedAt: null };
  }
}
