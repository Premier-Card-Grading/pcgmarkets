import type { Db } from "../client";
import { must } from "../client";

export async function upsertFxRates(db: Db, rows: { date: string; base: string; quote: string; rate: number }[]) {
  if (rows.length) must(await db.from("fx_rates").upsert(rows, { onConflict: "date,base,quote" }));
}
export async function observedCurrencies(db: Db): Promise<string[]> {
  const rows = must(await db.from("raw_listings").select("currency")) as { currency: string }[];
  return [...new Set(rows.map((r) => r.currency))];
}
