import type { Db } from "../client";
import { selectAll } from "../paginate";
import { gradedKey, type Era } from "@pcg/domain";

export interface EstimateRowInput { product_id: string; grade_value: number; estimate_usd: number; pct: number; era: Era; import_id: string; source_as_of: string }

/** Every (product, grade) with a real PCG price in ANY window. The 'all' window is the superset. */
export async function loadPcgGradedPairs(db: Db): Promise<Set<string>> {
  const rows = await selectAll<{ product_id: string; grade_value: number }>((f, t) =>
    db.from("price_points").select("product_id,grade_value").eq("window", "all").gt("n_sales", 0).order("product_id").range(f, t));
  return new Set(rows.map((r) => gradedKey(r.product_id, Number(r.grade_value))));
}

export async function replaceEstimates(db: Db, rows: EstimateRowInput[]): Promise<number> {
  const { data, error } = await db.rpc("replace_price_estimates", { rows });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
