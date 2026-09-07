import { serviceClient } from "@/lib/supabase-server";
import { ReviewRow, type ReviewItem } from "@/components/ReviewRow";
export const dynamic = "force-dynamic";
export default async function Review() {
  const db = serviceClient();
  const { data: rows } = await db.from("listing_matches").select("raw_listing_id,review_reason,extracted,raw_listings(id,title,description,price,currency,url,image_urls,fetched_at)")
    .eq("state", "needs_review").order("updated_at", { ascending: false }).limit(50);
  const { data: counts } = await db.from("listing_matches").select("review_reason").eq("state", "needs_review");
  const byReason = new Map<string, number>();
  for (const c of counts ?? []) byReason.set(c.review_reason ?? "other", (byReason.get(c.review_reason ?? "other") ?? 0) + 1);
  const items: ReviewItem[] = (rows ?? []).map((r) => { const l = r.raw_listings as unknown as { id: string; title: string; description: string | null; price: number; currency: string; url: string; image_urls: string[] }; return { id: l.id, title: l.title, description: l.description, price: Number(l.price), currency: l.currency, url: l.url, imageUrls: l.image_urls ?? [], reason: r.review_reason, extracted: (r.extracted ?? {}) as Record<string, unknown> }; });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">{[...byReason.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="rounded bg-zinc-100 px-2 py-1">{k}: {v}</span>)}</div>
      {items.map((it) => <ReviewRow key={it.id} item={it} />)}
      {items.length === 0 && <div className="text-zinc-500">Queue is empty.</div>}
    </div>
  );
}
