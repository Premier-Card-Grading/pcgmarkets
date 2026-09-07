import type { SupabaseClient } from "@supabase/supabase-js";
import { TIERS } from "@pcg/domain";
import { gradeLabelText } from "./format";

export interface PricePointRow { product_id: string; grade_value: number; grade_label: string; window: string; n_sales: number; median_usd: number; min_usd: number; max_usd: number; last_sold_at: string; confidence: "high" | "med" | "low" }
export interface SaleRow { id: string; grade_value: number | null; grade_label: string | null; price: number; currency: string; price_usd: number | null; sold_at: string | null; source: string; url: string; is_best_offer: boolean }
export interface CardPageData {
  product: { id: string; name_en: string | null; name_ja: string | null; number_printed: string; language: "ja" | "en"; image_url: string | null };
  set: { id: string; name_en: string | null; name_ja: string | null; printed_code: string | null };
  points: PricePointRow[];
  sales: SaleRow[];
}
export interface GridColumn { title: string; point: PricePointRow }

export async function loadCard(db: SupabaseClient, id: string): Promise<CardPageData | null> {
  const { data: product } = await db.from("products").select("id,name_en,name_ja,number_printed,language,image_url,sets(id,name_en,name_ja,printed_code)").eq("id", id).maybeSingle();
  if (!product) return null;
  const [{ data: points }, { data: sales }] = await Promise.all([
    db.from("price_points").select("*").eq("product_id", id),
    db.from("public_sales").select("id,grade_value,grade_label,price,currency,price_usd,sold_at,source,url,is_best_offer").eq("product_id", id).order("sold_at", { ascending: false }).limit(200),
  ]);
  const { sets, ...p } = product as unknown as CardPageData["product"] & { sets: CardPageData["set"] };
  return { product: p, set: sets, points: (points ?? []) as PricePointRow[], sales: (sales ?? []) as SaleRow[] };
}

export function gridColumns(points: PricePointRow[], window: string): GridColumn[] {
  const inWin = points.filter((p) => p.window === window);
  const cols: GridColumn[] = [];
  for (const p of inWin) {
    if (p.grade_label === "any") cols.push({ title: gradeLabelText(Number(p.grade_value), "any"), point: p });
    else if (Number(p.grade_value) === 10 && (TIERS as string[]).includes(p.grade_label) && p.n_sales >= 2) cols.push({ title: gradeLabelText(10, p.grade_label), point: p });
  }
  const tierRank = (l: string) => (l === "any" ? 3 : TIERS.indexOf(l as (typeof TIERS)[number]));
  return cols.sort((a, b) => Number(b.point.grade_value) - Number(a.point.grade_value) || tierRank(a.point.grade_label) - tierRank(b.point.grade_label));
}
