import type { Db } from "../client";
import { selectAll } from "../paginate";
import { gradedKey, type Era, type EstimateSource, type PsaSale } from "@pcg/domain";

export interface EstimateRowInput { product_id: string; grade_value: number; estimate_usd: number; pct: number; era: Era | null; import_id: string | null; source_as_of: string; source: EstimateSource }

/**
 * Every (product, grade) with ANY matched PCG sale: best-offer sales and sales with no USD price included.
 * Read from public_sales (matched listing_matches joined to sold raw_listings) so ingest and the card page agree
 * on what counts as "has a PCG sale". Ordered by the unique sale id so range pages are stable.
 */
export async function loadPcgGradedPairs(db: Db): Promise<Set<string>> {
  const rows = await selectAll<{ product_id: string | null; grade_value: number | string | null }>((f, t) =>
    db.from("public_sales").select("product_id,grade_value").not("grade_value", "is", null).order("id").range(f, t));
  return new Set(rows.filter((r) => r.product_id && r.grade_value != null).map((r) => gradedKey(r.product_id!, Number(r.grade_value))));
}

/** Priced PSA slab sales (psa_sales, service role only) since a date: Best Offer sales without a known price are left out. */
export async function loadPsaSalesForEstimates(db: Db, since: Date): Promise<PsaSale[]> {
  const rows = await selectAll<{ product_id: string; grade_value: number | string; price_usd: number | string; sold_at: string }>((f, t) =>
    db.from("psa_sales").select("product_id,grade_value,price_usd,sold_at").not("price_usd", "is", null).gte("sold_at", since.toISOString()).order("source_item_id").range(f, t));
  return rows.map((r) => ({ productId: r.product_id, gradeValue: Number(r.grade_value), priceUsd: Number(r.price_usd), soldAt: new Date(r.sold_at) }));
}

export async function replaceEstimates(db: Db, rows: EstimateRowInput[]): Promise<number> {
  const { data, error } = await db.rpc("replace_price_estimates", { rows });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
