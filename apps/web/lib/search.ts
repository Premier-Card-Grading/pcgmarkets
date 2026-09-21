import type { SupabaseClient } from "@supabase/supabase-js";
import { classifySearch } from "@pcg/domain";
import { lookupCert } from "@pcg/connectors";

export interface PricePeek { medianUsd: number; nSales: number }
export interface SearchResult { id: string; nameEn: string | null; nameJa: string | null; setName: string; setCode: string | null; numberPrinted: string; language: "ja" | "en"; imageUrl: string | null; grades: { g10: PricePeek | null; g95: PricePeek | null; g9: PricePeek | null }; saleCount: number }
export type SearchOutcome = { results: SearchResult[] } | { redirectTo: string };

async function hydrate(db: SupabaseClient, hits: { id: string; sale_count: number }[]): Promise<SearchResult[]> {
  if (hits.length === 0) return [];
  const ids = hits.map((h) => h.id);
  const { data: products } = await db.from("products").select("id,name_en,name_ja,number_printed,language,image_url,sets(name_en,name_ja,printed_code)").in("id", ids);
  const { data: points } = await db.from("price_points").select("product_id,grade_value,median_usd,n_sales").eq("grade_label", "any").eq("window", "90d").in("grade_value", [10, 9.5, 9]).in("product_id", ids);
  const peek = new Map<string, PricePeek>();
  for (const p of (points ?? []) as { product_id: string; grade_value: number; median_usd: number; n_sales: number }[]) peek.set(`${p.product_id}|${Number(p.grade_value)}`, { medianUsd: Number(p.median_usd), nSales: p.n_sales });
  const byId = new Map((products ?? []).map((p: Record<string, unknown>) => [p.id as string, p]));
  return hits.flatMap((h) => {
    const p = byId.get(h.id) as { name_en: string | null; name_ja: string | null; number_printed: string; language: "ja" | "en"; image_url: string | null; sets: { name_en: string | null; name_ja: string | null; printed_code: string | null } } | undefined;
    if (!p) return [];
    return [{ id: h.id, nameEn: p.name_en, nameJa: p.name_ja, setName: p.sets?.name_en ?? p.sets?.name_ja ?? "", setCode: p.sets?.printed_code ?? null, numberPrinted: p.number_printed, language: p.language, imageUrl: p.image_url,
      grades: { g10: peek.get(`${h.id}|10`) ?? null, g95: peek.get(`${h.id}|9.5`) ?? null, g9: peek.get(`${h.id}|9`) ?? null }, saleCount: h.sale_count }];
  });
}

export async function searchProducts(db: SupabaseClient, q: string): Promise<SearchOutcome> {
  const shape = classifySearch(q);
  if (shape.kind === "cert") {
    const cert = await lookupCert(shape.cert, { timeoutMs: 3000 });
    if (cert) {
      // Resolve set+number the same way the matcher does, via the SQL number search filtered to the cert's number.
      const n = classifySearch(cert.cardNumber);
      if (n.kind === "number") {
        const { data } = await db.rpc("search_products_by_number", { p_num: n.number.num, p_denom: n.number.denom, p_suffix: n.number.suffix, lim: 5 });
        const first = (data as { id: string }[] | null)?.[0];
        const tier = ["Flawless", "Pristine", "Gem Mint"].includes(cert.grade) ? cert.grade : "";
        if (first) return { redirectTo: `/card/${encodeURIComponent(first.id)}?cert=${cert.gradedId}${cert.finalGrade != null ? `&cg=${cert.finalGrade}` : ""}${tier ? `&ct=${encodeURIComponent(tier)}` : ""}` };
      }
    }
    // Fall through to the number path (a 9-digit string may be a lot number or typo).
  }
  if (shape.kind === "number" || shape.kind === "cert") {
    const n = shape.kind === "number" ? shape.number : { num: parseInt(shape.cert, 10), denom: null, suffix: null, printed: shape.cert };
    const { data } = await db.rpc("search_products_by_number", { p_num: n.num, p_denom: n.denom, p_suffix: n.suffix, lim: 30 });
    return { results: await hydrate(db, (data as { id: string; sale_count: number }[] | null) ?? []) };
  }
  const { data } = await db.rpc("search_products_by_name", { q: shape.q, lim: 30 });
  return { results: await hydrate(db, (data as { id: string; sale_count: number }[] | null) ?? []) };
}
