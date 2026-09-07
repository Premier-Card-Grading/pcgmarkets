import type { Db } from "../client";
import { must } from "../client";
import type { PricePoint, Sale, TierLabel } from "@pcg/domain";

export async function loadMatchedSales(db: Db): Promise<Sale[]> {
  const rows = must(await db.from("public_sales").select("product_id,grade_value,grade_label,price_usd,sold_at,is_best_offer,price")) as Array<{
    product_id: string; grade_value: number | null; grade_label: string | null; price_usd: number | null; sold_at: string | null; is_best_offer: boolean; price: number;
  }>;
  return rows.filter((r) => r.grade_value != null && r.price_usd != null && r.sold_at && !r.is_best_offer && r.price > 0)
    .map((r) => ({ productId: r.product_id, gradeValue: Number(r.grade_value), gradeLabel: (r.grade_label as TierLabel | null), priceUsd: Number(r.price_usd), soldAt: new Date(r.sold_at!) }));
}

export async function replacePricePoints(db: Db, points: PricePoint[]) {
  must(await db.from("price_points").delete().neq("product_id", ""));
  for (let i = 0; i < points.length; i += 500) {
    const chunk = points.slice(i, i + 500).map((p) => ({
      product_id: p.productId, grade_value: p.gradeValue, grade_label: p.gradeLabel, window: p.window, n_sales: p.nSales,
      median_usd: p.medianUsd, min_usd: p.minUsd, max_usd: p.maxUsd, last_sold_at: p.lastSoldAt.toISOString(), confidence: p.confidence,
      computed_at: new Date().toISOString(),
    }));
    must(await db.from("price_points").insert(chunk));
  }
}
