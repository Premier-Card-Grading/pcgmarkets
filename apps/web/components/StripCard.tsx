import Link from "next/link";
import Image from "next/image";
import type { RecentSale } from "@/lib/home-data";
import { GradeBadge } from "./GradeBadge";
import { Price } from "./Price";
export function StripCard({ s }: { s: RecentSale }) {
  return (<li className="w-[158px] shrink-0 snap-start"><Link href={`/card/${encodeURIComponent(s.productId)}`} className="block no-underline transition-transform duration-[180ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1">
    <div className="relative">
      {s.imageUrl ? <Image src={s.imageUrl} alt="" width={158} height={221} className="block aspect-[63/88] w-full rounded-[10px] object-cover shadow-object" /> : <div className="aspect-[63/88] w-full rounded-[10px] border border-dashed border-line bg-sunk" />}
      <span className="absolute -right-2 -top-2 shadow-[0_2px_6px_rgba(0,0,0,.25)] rounded-lg"><GradeBadge grade={s.gradeValue} /></span>
      <span className="absolute -left-1.5 bottom-3 -rotate-3 rounded-[7px] bg-surface px-[9px] pt-[5px] pb-1 text-ink shadow-[0_3px_10px_rgba(0,0,0,.22)]"><Price value={s.priceUsd ?? "—"} className="text-lg" /><span className="mt-px block text-[10px] font-bold tracking-[0.02em] text-mute">{[s.gradeLabel, s.source].filter(Boolean).join(" · ")}</span></span>
    </div>
    <div className="mt-3 truncate text-[14.5px] font-bold leading-[1.25] tracking-[-0.01em]">{s.name}</div>
    <div className="mt-0.5 truncate text-[12.5px] text-mute">{s.setLine}</div>
  </Link></li>);
}
