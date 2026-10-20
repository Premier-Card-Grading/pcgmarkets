import type { Db } from "../client";
import { must } from "../client";
import { InMemoryCatalog, type Language, type SetRef, type ProductRef } from "@pcg/domain";

export interface SetRow { id: string; printed_code: string | null; language: Language; name_en: string | null; name_ja: string | null; release_date: string | null; card_count: number | null; aliases: string[]; logo_url?: string | null; series?: string | null; source?: "tcgdex" | "limitless"; limitless_code?: string | null }
export interface ProductRow { id: string; set_id: string; number_printed: string; number_num: number | null; number_denom: number | null; number_suffix: string | null; name_en: string | null; name_ja: string | null; rarity: string | null; language: Language; image_url: string | null; image_source?: "tcgdex" | "limitless" | "pokemontcg" | null }

const CHUNK = 500;
async function chunked<T>(rows: T[], fn: (c: T[]) => Promise<void>) {
  for (let i = 0; i < rows.length; i += CHUNK) await fn(rows.slice(i, i + CHUNK));
}

export async function upsertSets(db: Db, rows: SetRow[]) {
  await chunked(rows, async (c) => { must(await db.from("sets").upsert(c, { onConflict: "id" })); });
}
export async function upsertProducts(db: Db, rows: ProductRow[]) {
  await chunked(rows, async (c) => { must(await db.from("products").upsert(c, { onConflict: "id" })); });
}

export async function loadCatalog(db: Db): Promise<InMemoryCatalog> {
  const sets = must(await db.from("sets").select("*")) as SetRow[];
  const products: ProductRow[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must(await db.from("products").select("id,set_id,number_num,number_denom,number_suffix,language").range(from, from + 999)) as ProductRow[];
    products.push(...page);
    if (page.length < 1000) break;
  }
  const setRefs: SetRef[] = sets.map((s) => ({ id: s.id, printedCode: s.printed_code, language: s.language, cardCount: s.card_count, nameEn: s.name_en, nameJa: s.name_ja, aliases: s.aliases ?? [] }));
  const productRefs: ProductRef[] = products.map((p) => ({ id: p.id, setId: p.set_id, numberNum: p.number_num, numberDenom: p.number_denom, numberSuffix: p.number_suffix, language: p.language }));
  return new InMemoryCatalog(setRefs, productRefs);
}
