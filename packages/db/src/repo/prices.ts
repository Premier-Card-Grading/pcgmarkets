import type { Db } from "../client";
import { must } from "../client";
import { selectAll } from "../paginate";
import type { PricePoint, PricedSale, PriceFlag, Sale, TierLabel } from "@pcg/domain";

export async function loadMatchedSales(db: Db): Promise<Sale[]> {
  type Row = { product_id: string; grade_value: number | null; grade_label: string | null; price_usd: number | null; sold_at: string | null; is_best_offer: boolean; price: number };
  // Paged and ordered by the unique sale id: an unpaged select stops at Supabase's 1000-row cap.
  const rows = await selectAll<Row>((f, t) =>
    db.from("public_sales").select("product_id,grade_value,grade_label,price_usd,sold_at,is_best_offer,price").order("id").range(f, t));
  return rows.filter((r) => r.grade_value != null && r.price_usd != null && r.sold_at && !r.is_best_offer && r.price > 0)
    .map((r) => ({ productId: r.product_id, gradeValue: Number(r.grade_value), gradeLabel: (r.grade_label as TierLabel | null), priceUsd: Number(r.price_usd), soldAt: new Date(r.sold_at!) }));
}

/** Priced, matched sales an admin has not confirmed by hand: the ones the price check may send to review. */
export async function loadSalesForPriceCheck(db: Db): Promise<PricedSale[]> {
  type Row = { id: string; product_id: string; grade_value: number | null; price_usd: number | null; is_best_offer: boolean };
  const [rows, overridden] = await Promise.all([
    selectAll<Row>((f, t) => db.from("public_sales").select("id,product_id,grade_value,price_usd,is_best_offer").order("id").range(f, t)),
    selectAll<{ raw_listing_id: string }>((f, t) => db.from("listing_matches").select("raw_listing_id").eq("is_override", true).order("raw_listing_id").range(f, t)),
  ]);
  const confirmed = new Set(overridden.map((r) => r.raw_listing_id));
  return rows.filter((r) => r.grade_value != null && r.price_usd != null && !r.is_best_offer && !confirmed.has(r.id))
    .map((r) => ({ id: r.id, productId: r.product_id, gradeValue: Number(r.grade_value), priceUsd: Number(r.price_usd) }));
}

/** Moves matched sales to the review queue with a reason; the sale and its match stay stored. */
export async function sendSalesToReview(db: Db, flags: Map<string, PriceFlag>) {
  for (const reason of new Set(flags.values())) {
    const ids = [...flags].filter(([, r]) => r === reason).map(([id]) => id);
    for (let i = 0; i < ids.length; i += 200)
      must(await db.from("listing_matches").update({ state: "needs_review", review_reason: reason, updated_at: new Date().toISOString() })
        .in("raw_listing_id", ids.slice(i, i + 200)).eq("state", "matched").eq("is_override", false));
  }
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
