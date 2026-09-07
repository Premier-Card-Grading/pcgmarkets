"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { serviceClient } from "@/lib/supabase-server";
import { MATCHER_VERSION } from "@pcg/domain";

export async function resolveListing(rawListingId: string, input: { productId: string; gradeValue: number | null; gradeLabel: string | null }) {
  const { email } = await requireAdmin();
  const { error } = await serviceClient().from("listing_matches").upsert({
    raw_listing_id: rawListingId, state: "matched", product_id: input.productId, grade_value: input.gradeValue,
    grade_label: input.gradeValue === 10 || input.gradeValue == null ? input.gradeLabel : null,
    match_method: "admin", review_reason: null, is_override: true, matcher_version: MATCHER_VERSION,
    resolved_by: email, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "raw_listing_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/review");
}

export async function rejectListing(rawListingId: string) {
  const { email } = await requireAdmin();
  const { error } = await serviceClient().from("listing_matches").upsert({
    raw_listing_id: rawListingId, state: "rejected", product_id: null, grade_value: null, grade_label: null,
    match_method: "admin", review_reason: "other", is_override: true, matcher_version: MATCHER_VERSION,
    resolved_by: email, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "raw_listing_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/review");
}
