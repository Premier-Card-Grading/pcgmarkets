import { headers } from "next/headers";
import { requireAdmin } from "@/lib/admin";
import { serviceClient } from "@/lib/supabase-server";
import { AppHeader } from "@/components/AppHeader";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireAdmin();
  let count = 0;
  try {
    const res = await serviceClient().from("listing_matches").select("raw_listing_id", { count: "exact", head: true }).eq("state", "needs_review");
    count = res.count ?? 0;
  } catch {
    count = 0;
  }
  const path = (await headers()).get("x-pathname") ?? "";
  return (<><AppHeader variant="admin" admin={{ email, reviewCount: count, current: path.includes("/health") ? "health" : "review" }} /><main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10">{children}</main></>);
}
