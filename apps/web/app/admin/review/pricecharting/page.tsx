import { serviceClient } from "@/lib/supabase-server";
import { ChipLink } from "@/components/Chip";
import { linkPcRow, rejectPcRow } from "./actions";

export const dynamic = "force-dynamic";
const REASONS: Record<string, string> = { no_card_number: "No card number", variant: "Variant", no_match: "No matching card", ambiguous: "Several matching cards" };

export default async function PcReview() {
  const { data } = await serviceClient().from("pc_product_links").select("pc_id,review_reason,pc_products(console_name,product_name,card_number)").eq("state", "needs_review").order("updated_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as unknown as { pc_id: string; review_reason: string | null; pc_products: { console_name: string; product_name: string; card_number: string | null } | null }[];
  return (<>
    <div className="mb-4 flex flex-wrap items-center gap-3"><ChipLink href="/admin/review">← Listings</ChipLink><h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em]">{rows.length} PriceCharting row{rows.length === 1 ? "" : "s"}<span className="ml-2 text-base font-semibold tracking-normal text-mute">need a card</span></h1></div>
    <p className="mb-4 max-w-[70ch] text-[13.5px] text-mute">These rows did not link to exactly one card, so they produce no estimate. Link one to a product id, for example <code>sv03.5-200</code>, or reject it.</p>
    <ul className="m-0 flex list-none flex-col gap-2 p-0">{rows.map((r) => (
      <li key={r.pc_id} className="grid grid-cols-1 gap-2 rounded-xl border border-line-2 bg-surface px-3.5 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div><div className="text-[15px] font-bold">{r.pc_products?.product_name}</div><div className="text-[13px] text-mute">{r.pc_products?.console_name} · number {r.pc_products?.card_number ?? "none"} · {REASONS[r.review_reason ?? ""] ?? "Other"}</div></div>
        <div className="flex flex-wrap gap-2">
          <form action={linkPcRow.bind(null, r.pc_id)} className="flex gap-2"><input name="productId" required placeholder="product id" className="min-h-10 rounded-lg border border-line bg-surface px-2.5 text-[14px]" /><button className="min-h-10 rounded-lg bg-ink px-3 text-[14px] font-bold text-ground">Link</button></form>
          <form action={rejectPcRow.bind(null, r.pc_id)}><button className="min-h-10 rounded-lg border border-line px-3 text-[14px] font-bold text-ink-2">Reject</button></form>
        </div>
      </li>))}</ul>
  </>);
}
