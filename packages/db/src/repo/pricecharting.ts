import type { Db } from "../client";
import { must } from "../client";
import { selectAll } from "../paginate";
import type { Era, PcGradeKey } from "@pcg/domain";

export interface PcProductInput { pcId: string; consoleName: string; productName: string; cardNumber: string | null; salesVolume: number | null; pricesUsd: Partial<Record<PcGradeKey, number>> }
const CHUNK = 500;

export async function lastOkImport(db: Db): Promise<{ id: string; fetched_at: string; row_count: number } | null> {
  const r = must(await db.from("pc_imports").select("id,fetched_at,row_count").eq("status", "ok").order("fetched_at", { ascending: false }).limit(1)) as { id: string; fetched_at: string; row_count: number }[];
  return r[0] ?? null;
}
export async function startImport(db: Db, rowCount: number): Promise<string> {
  const row = must(await db.from("pc_imports").insert({ row_count: rowCount, status: "suspect", notes: "in progress" }).select("id").single()) as { id: string };
  return row.id;
}
export async function finishImport(db: Db, id: string, status: "ok" | "suspect", notes: string | null) {
  must(await db.from("pc_imports").update({ status, notes }).eq("id", id));
}
export async function upsertPcProducts(db: Db, importId: string, rows: PcProductInput[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({ pc_id: r.pcId, console_name: r.consoleName, product_name: r.productName, card_number: r.cardNumber, sales_volume: r.salesVolume, prices_usd: r.pricesUsd, import_id: importId }));
    must(await db.from("pc_products").upsert(chunk, { onConflict: "pc_id" }));
  }
}
/** Call only after a complete upsert, before finishImport("ok"): the cascade drops links for vanished products. */
export async function deleteStalePcProducts(db: Db, importId: string) {
  must(await db.from("pc_products").delete().neq("import_id", importId));
}
export async function loadSetMap(db: Db) {
  const rows = await selectAll<{ set_id: string; console_name: string; era_override: Era | null }>((f, t) =>
    db.from("pc_set_map").select("set_id,console_name,era_override").order("set_id").range(f, t));
  return rows.map((r) => ({ setId: r.set_id, consoleName: r.console_name, eraOverride: r.era_override }));
}
export async function loadPcProductsForConsoles(db: Db, consoles: string[]) {
  if (!consoles.length) return [];
  const rows = await selectAll<{ pc_id: string; console_name: string; product_name: string; card_number: string | null }>((f, t) =>
    db.from("pc_products").select("pc_id,console_name,product_name,card_number").in("console_name", consoles).order("pc_id").range(f, t));
  return rows.map((r) => ({ pcId: r.pc_id, consoleName: r.console_name, productName: r.product_name, cardNumber: r.card_number }));
}
export async function loadAllConsoleCounts(db: Db): Promise<Map<string, number>> {
  const rows = await selectAll<{ console_name: string }>((f, t) => db.from("pc_products").select("console_name").order("pc_id").range(f, t));
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.console_name, (m.get(r.console_name) ?? 0) + 1);
  return m;
}
export async function loadLinkCandidates(db: Db, setIds: string[]) {
  if (!setIds.length) return [];
  const rows = await selectAll<{ id: string; set_id: string; number_num: number | null; number_printed: string }>((f, t) =>
    db.from("products").select("id,set_id,number_num,number_printed").in("set_id", setIds).order("id").range(f, t));
  return rows.map((r) => ({ id: r.id, setId: r.set_id, numberNum: r.number_num, numberPrinted: r.number_printed }));
}
export async function loadOverriddenPcIds(db: Db): Promise<Set<string>> {
  const rows = await selectAll<{ pc_id: string }>((f, t) => db.from("pc_product_links").select("pc_id").eq("is_override", true).order("pc_id").range(f, t));
  return new Set(rows.map((r) => r.pc_id));
}
/** Writes is_override: false, so callers must exclude loadOverriddenPcIds results first. */
export async function upsertPcLinks(db: Db, rows: { pc_id: string; state: "linked" | "needs_review"; product_id: string | null; review_reason: string | null }[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({ ...r, is_override: false, updated_at: new Date().toISOString() }));
    must(await db.from("pc_product_links").upsert(chunk, { onConflict: "pc_id" }));
  }
}
export async function loadLinkedForEstimates(db: Db) {
  type Row = { product_id: string; pc_products: { sales_volume: number | null; prices_usd: Partial<Record<PcGradeKey, number>> } | null; products: { language: "ja" | "en"; set_id: string; sets: { release_date: string | null } | null } | null };
  const rows = await selectAll<Row>((f, t) =>
    db.from("pc_product_links").select("product_id,pc_products(sales_volume,prices_usd),products(language,set_id,sets(release_date))").eq("state", "linked").order("pc_id").range(f, t) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>);
  return rows.filter((r) => r.pc_products && r.products).map((r) => ({
    productId: r.product_id, language: r.products!.language, setId: r.products!.set_id, releaseDate: r.products!.sets?.release_date ?? null,
    salesVolume: r.pc_products!.sales_volume, pricesUsd: r.pc_products!.prices_usd ?? {},
  }));
}
