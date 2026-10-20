"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { serviceClient } from "@/lib/supabase-server";

export async function linkPcRow(pcId: string, formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "").trim();
  if (!productId) throw new Error("product id is required");
  const db = serviceClient();
  const { data: p } = await db.from("products").select("id").eq("id", productId).maybeSingle();
  if (!p) throw new Error(`no product with id ${productId}`);
  const { error } = await db.from("pc_product_links").update({ state: "linked", product_id: productId, review_reason: null, is_override: true, updated_at: new Date().toISOString() }).eq("pc_id", pcId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/review/pricecharting");
}

export async function rejectPcRow(pcId: string) {
  await requireAdmin();
  const { error } = await serviceClient().from("pc_product_links").update({ state: "rejected", product_id: null, is_override: true, updated_at: new Date().toISOString() }).eq("pc_id", pcId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/review/pricecharting");
}
