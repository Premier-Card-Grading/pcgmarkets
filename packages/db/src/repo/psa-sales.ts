import type { Db } from "../client";
import { must } from "../client";

/** One PSA slab sale identified from its label. Private: the service role is the only reader. */
export interface PsaSaleRow {
  source_item_id: string; source: "soldcomps"; product_id: string; grade_value: number; grade_words: string | null; cert: string | null;
  price_usd: number | null; is_best_offer: boolean; sold_at: string; item_location: string | null; url: string;
  read: "ocr" | "vision"; evidence: string[];
}

export async function upsertPsaSales(db: Db, rows: PsaSaleRow[]): Promise<number> {
  for (let i = 0; i < rows.length; i += 500) must(await db.from("psa_sales").upsert(rows.slice(i, i + 500), { onConflict: "source_item_id" }));
  return rows.length;
}
