import Link from "next/link";
import Image from "next/image";
import type { SearchResult, PricePeek } from "@/lib/search";
import { GradeBadge } from "./GradeBadge";
import { Price } from "./Price";
import { Chip } from "./Chip";
function GradeCell({ grade, peek, dim }: { grade: number; peek: PricePeek | null; dim?: boolean }) {
  return (<div className={`flex items-center gap-2 ${dim ? "max-md:hidden" : ""}`}>
    <GradeBadge grade={grade} size={dim ? "sm" : "md"} />
    <div><Price value={peek ? peek.medianUsd : "—"} className={dim ? "text-[20px] !font-bold !wdth-100 text-mute" : "text-[20px]"} /><span className="mt-0.5 block text-[11.5px] font-medium text-mute">{peek ? `${peek.nSales} sale${peek.nSales === 1 ? "" : "s"}` : "none"}</span></div>
  </div>);
}
export function ResultRow({ r }: { r: SearchResult }) {
  const primary = r.language === "ja" ? r.nameJa ?? r.nameEn : r.nameEn ?? r.nameJa; const alt = r.language === "ja" ? r.nameEn : r.nameJa;
  return (
    <li><Link href={`/card/${encodeURIComponent(r.id)}`} className="grid grid-cols-[56px_1fr] items-center gap-3.5 rounded-[14px] border border-line-2 bg-surface p-3 px-3.5 no-underline transition-[border-color,transform] duration-150 ease-out hover:-translate-y-px hover:border-line md:grid-cols-[56px_1fr_auto]">
      {r.imageUrl ? <Image src={r.imageUrl} alt="" width={56} height={78} className="h-[78px] w-14 rounded-md object-cover" /> : <div className="h-[78px] w-14 rounded-md border border-dashed border-line bg-sunk" />}
      <div className="min-w-0">
        <div className="text-lg font-extrabold leading-[1.2] tracking-[-0.015em]">{primary}{alt && alt !== primary && <span className="ml-[7px] text-[14.5px] font-medium text-mute">{alt}</span>}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-mute"><span>{r.setName}</span>{r.setCode && <Chip>{r.setCode}</Chip>}<Chip variant="number">{r.numberPrinted}</Chip><Chip variant="lang">{r.language}</Chip></div>
      </div>
      <div className="col-span-full mt-0.5 flex gap-[18px] border-t border-line-2 pt-2.5 md:col-span-1 md:mt-0 md:gap-[26px] md:border-0 md:pt-0">
        <GradeCell grade={10} peek={r.grades.g10} /><GradeCell grade={9.5} peek={r.grades.g95} dim /><GradeCell grade={9} peek={r.grades.g9} dim />
      </div>
    </Link></li>);
}
