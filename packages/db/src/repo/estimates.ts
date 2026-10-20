import type { Db } from "../client";
import { selectAll } from "../paginate";
import { gradedKey, type Era } from "@pcg/domain";

export interface EstimateRowInput { product_id: string; grade_value: number; estimate_usd: number; pct: number; era: Era; import_id: string; source_as_of: string }

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

export async function replaceEstimates(db: Db, rows: EstimateRowInput[]): Promise<number> {
  const { data, error } = await db.rpc("replace_price_estimates", { rows });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
