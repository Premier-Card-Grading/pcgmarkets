"use client";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { SaleRow } from "@/lib/card-data";
import type { GradeOption } from "@/lib/grades";
import { GradeBadge } from "./GradeBadge";
import { Price } from "./Price";
import { fmtDateLong } from "@/lib/format";
const srcName: Record<string, string> = { thecardapi: "eBay", soldcomps: "eBay", yahoo_auc: "Yahoo! Auctions" };
const src = (s: SaleRow) => `${srcName[s.source] ?? s.source}${s.is_best_offer ? ", best offer" : ""}`;
export function SalesList({ sales, opt }: { sales: SaleRow[]; opt: GradeOption }) {
  const [all, setAll] = useState(false);
  if (sales.length === 0) return <p className="m-0 text-[13.5px] text-mute">No {opt.label} sales in this window yet.</p>;
  const shown = all ? sales : sales.slice(0, 6);
  const usd = (s: SaleRow) => s.price_usd == null ? "—" : Number(s.price_usd);
  return (<>
    <table className="hidden w-full border-collapse text-[14.5px] md:table"><thead><tr className="text-left text-[12.5px] font-semibold text-mute"><th className="border-b-2 border-ink pb-2 font-semibold">Sold</th><th className="border-b-2 border-ink pb-2 pl-3.5 text-right font-semibold">Price</th><th className="border-b-2 border-ink pb-2 pl-3.5 text-right font-semibold">USD</th><th className="border-b-2 border-ink pb-2 pl-3.5 font-semibold">Source</th><th className="border-b-2 border-ink pb-2" /></tr></thead>
      <tbody>{shown.map((s) => (<tr key={s.id}><td className="border-b border-line-2 py-2.5 text-[13px] text-mute">{s.sold_at ? fmtDateLong(s.sold_at) : "—"}</td><td className="border-b border-line-2 py-2.5 pl-3.5 text-right"><Price value={Number(s.price)} currency={s.currency} bestOffer={s.is_best_offer} className="text-[19px]" /></td><td className="border-b border-line-2 py-2.5 pl-3.5 text-right"><Price value={usd(s)} secondary bestOffer={s.is_best_offer} className="text-[15px]" /></td><td className="border-b border-line-2 py-2.5 pl-3.5 text-[13px] text-mute">{src(s)}</td><td className="border-b border-line-2 py-2.5 pl-3.5 text-right"><a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-[3px] whitespace-nowrap text-[13px] font-semibold text-teal no-underline">Listing<ArrowUpRight size={13} /></a></td></tr>))}</tbody></table>
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0 md:hidden">{shown.map((s) => (<li key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-xl border border-line-2 bg-surface px-3 py-2.5 no-underline">
      <span className="row-span-2"><GradeBadge grade={opt.gradeValue} /></span>
      <span className="text-[13.5px] font-semibold">{[opt.tier, src(s)].filter(Boolean).join(" · ")}</span>
      <span className="row-span-2 text-right"><Price value={Number(s.price)} currency={s.currency} bestOffer={s.is_best_offer} className="text-[19px]" />{s.currency !== "USD" && s.price_usd != null && <span className="mt-[3px] block text-xs font-semibold text-mute tnum">{`$${Math.round(Number(s.price_usd)).toLocaleString("en-US")}`}</span>}</span>
      <span className="text-[12.5px] text-mute">{s.sold_at ? fmtDateLong(s.sold_at) : "—"}</span>
    </a></li>))}</ul>
    {sales.length > 6 && <p className="mt-3 text-[13px] text-mute">Showing {shown.length} of {sales.length}. {!all && <button type="button" onClick={() => setAll(true)} className="font-semibold text-teal">Show all</button>}</p>}
  </>);
}
