import type { Db } from "../client";
import { must } from "../client";
import type { RawListing } from "@pcg/domain";
import { stripSellerFields } from "../strip-seller";

export async function upsertRawListings(db: Db, listings: RawListing[]): Promise<{ inserted: number; updated: number }> {
  if (listings.length === 0) return { inserted: 0, updated: 0 };
  const keys = listings.map((l) => l.sourceItemId);
  const existing = must(await db.from("raw_listings").select("source,source_item_id").eq("source", listings[0]!.source).in("source_item_id", keys)) as { source_item_id: string }[];
  const existingIds = new Set(existing.map((e) => e.source_item_id));
  const rows = listings.map((l) => ({
    source: l.source, source_item_id: l.sourceItemId, url: l.url, title: l.title, description: l.description,
    price: l.price, currency: l.currency, kind: l.kind, sold_at: l.soldAt, ended_at: l.endedAt,
    is_best_offer: l.isBestOffer, seller_country: l.sellerCountry, external_item_id: l.externalItemId,
    image_urls: l.imageUrls, metadata: l.metadata, raw: stripSellerFields(l.raw), fetched_at: new Date().toISOString(),
  }));
  // Existing rows: only kind/sold_at/ended_at/fetched_at may change (spec §5).
  const fresh = rows.filter((r) => !existingIds.has(r.source_item_id));
  const stale = rows.filter((r) => existingIds.has(r.source_item_id));
  if (fresh.length) must(await db.from("raw_listings").insert(fresh));
  for (const r of stale) {
    must(await db.from("raw_listings").update({ kind: r.kind, sold_at: r.sold_at, ended_at: r.ended_at, fetched_at: r.fetched_at })
      .eq("source", r.source).eq("source_item_id", r.source_item_id));
  }
  return { inserted: fresh.length, updated: stale.length };
}
