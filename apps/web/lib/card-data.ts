import type { SupabaseClient } from "@supabase/supabase-js";

export interface PricePointRow { product_id: string; grade_value: number; grade_label: string; window: string; n_sales: number; median_usd: number; min_usd: number; max_usd: number; last_sold_at: string; confidence: "high" | "med" | "low" }
export interface SaleRow { id: string; grade_value: number | null; grade_label: string | null; price: number; currency: string; price_usd: number | null; sold_at: string | null; source: string; url: string; is_best_offer: boolean }
export interface EstimateRow { grade_value: number; estimate_usd: number; source_as_of: string }
export interface CardPageData {
  product: { id: string; name_en: string | null; name_ja: string | null; number_printed: string; language: "ja" | "en"; image_url: string | null; rarity: string | null };
  set: { id: string; name_en: string | null; name_ja: string | null; printed_code: string | null; release_date: string | null; card_count: number | null };
  points: PricePointRow[];
  sales: SaleRow[];
  estimates: EstimateRow[];
}

export async function loadCard(db: SupabaseClient, id: string): Promise<CardPageData | null> {
  const { data: product } = await db.from("products").select("id,name_en,name_ja,number_printed,language,image_url,rarity,sets(id,name_en,name_ja,printed_code,release_date,card_count)").eq("id", id).maybeSingle();
  // Cards without an image are hidden from the site.
  if (!product || !(product as { image_url: string | null }).image_url) return null;
  const [{ data: points }, { data: sales }, { data: estimates }] = await Promise.all([
    db.from("price_points").select("*").eq("product_id", id),
    db.from("public_sales").select("id,grade_value,grade_label,price,currency,price_usd,sold_at,source,url,is_best_offer").eq("product_id", id).order("sold_at", { ascending: false }).limit(500),
    db.from("public_price_estimates").select("grade_value,estimate_usd,source_as_of").eq("product_id", id),
  ]);
  const { sets, ...p } = product as unknown as CardPageData["product"] & { sets: CardPageData["set"] };
  return { product: p, set: sets, points: (points ?? []) as PricePointRow[], sales: (sales ?? []) as SaleRow[], estimates: (estimates ?? []) as EstimateRow[] };
}
