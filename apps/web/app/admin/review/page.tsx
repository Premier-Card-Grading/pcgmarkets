import { serviceClient } from "@/lib/supabase-server";
import { ReviewList } from "@/components/ReviewList";
import { ChipLink } from "@/components/Chip";
import { reasonLabel, reasonFilterKey, type ReviewItemData } from "@/lib/review";

export const dynamic = "force-dynamic";

const KNOWN_REASONS = ["no_card_number", "ambiguous_set", "no_grade", "lot", "grader_missing", "ambiguous_grader", "no_set_code", "no_metadata"];

export default async function Review({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const db = serviceClient();
  const { data: counts } = await db.from("listing_matches").select("review_reason").eq("state", "needs_review");
  const byReason = new Map<string, number>();
  for (const c of counts ?? []) {
    const k = reasonFilterKey(c.review_reason);
    byReason.set(k, (byReason.get(k) ?? 0) + 1);
  }
  const total = counts?.length ?? 0;

  let qy = db
    .from("listing_matches")
    .select("raw_listing_id,review_reason,extracted,raw_listings(id,title,description,price,currency,url,image_urls,source,sold_at,ended_at,kind)")
    .eq("state", "needs_review")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (reason && reason !== "other") qy = qy.eq("review_reason", reason);
  else if (reason === "other") qy = qy.or(`review_reason.is.null,review_reason.not.in.(${KNOWN_REASONS.join(",")})`);
  const { data: rows } = await qy;

  const { data: fx } = await db.from("fx_rates").select("base,rate").eq("quote", "USD").order("date", { ascending: false }).limit(20);
  const rate = new Map((fx ?? []).map((f: { base: string; rate: number }) => [f.base, Number(f.rate)]));

  const items: ReviewItemData[] = (rows ?? []).map((r) => {
    const l = r.raw_listings as unknown as {
      id: string;
      title: string;
      description: string | null;
      price: number;
      currency: string;
      url: string;
      image_urls: string[];
      source: string;
      sold_at: string | null;
      ended_at: string | null;
      kind: "sold" | "ended";
    };
    return {
      id: l.id,
      title: l.title,
      description: l.description,
      price: Number(l.price),
      currency: l.currency,
      priceUsd: l.currency === "USD" ? Number(l.price) : rate.has(l.currency) ? Number(l.price) * rate.get(l.currency)! : null,
      url: l.url,
      imageUrls: l.image_urls ?? [],
      reason: r.review_reason,
      extracted: (r.extracted ?? {}) as Record<string, unknown>,
      source: l.source,
      at: l.sold_at ?? l.ended_at,
      kind: l.kind,
    };
  });

  const shown = reason ? byReason.get(reason) ?? 0 : total;
  const chips = [["", "All", total], ...[...byReason.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, reasonLabel(k), n] as const)] as [string, string, number][];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em]">
          {shown} listing{shown === 1 ? "" : "s"}
          <span className="ml-2 text-base font-semibold tracking-normal text-mute">{shown === 1 ? "needs" : "need"} a decision</span>
        </h1>
        <span className="ml-auto hidden text-[12.5px] font-medium text-mute md:block">
          <kbd className="rounded border border-line border-b-2 bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">J</kbd>{" "}
          <kbd className="rounded border border-line border-b-2 bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">K</kbd> move &nbsp;
          <kbd className="rounded border border-line border-b-2 bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">A</kbd> assign &nbsp;
          <kbd className="rounded border border-line border-b-2 bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">R</kbd> reject &nbsp;
          <kbd className="rounded border border-line border-b-2 bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">S</kbd> skip
        </span>
      </div>
      <div className="no-scrollbar -mx-5 mb-4 flex gap-1.5 overflow-x-auto px-5 pb-1">
        {chips.map(([k, l, n]) => (
          <ChipLink key={k} href={k ? `/admin/review?reason=${k}` : "/admin/review"} aria-pressed={(reason ?? "") === k} className="shrink-0 gap-[7px]">
            {l} <b className={`font-extrabold ${(reason ?? "") === k ? "text-gold-badge" : "text-mute"}`}>{n}</b>
          </ChipLink>
        ))}
      </div>
      <ReviewList items={items} total={shown} />
    </>
  );
}
