"use client";
import type { GradeOption, Window } from "@/lib/grades";
import { WINDOWS, deltaPct, salesFor } from "@/lib/grades";
import type { SaleRow } from "@/lib/card-data";
import { GradeBadge } from "./GradeBadge";
import { Price } from "./Price";
import { Delta } from "./Delta";
import { Sparkline } from "./Sparkline";
import { fmtDateLong, fmtNative, fmtUsd } from "@/lib/format";
export function GuideBox({ opt, sales, allOptions, window, now }: { opt: GradeOption; sales: SaleRow[]; allOptions: GradeOption[]; window: Window; now: Date }) {
  const w = WINDOWS.find((x) => x.value === window)!;
  const mine = salesFor(sales, opt, window, now); const last = mine[0];
  const most = [...allOptions].sort((a, b) => b.nSales - a.nSales)[0]?.key === opt.key;
  const dotCls = opt.confidence === "high" ? "bg-good" : opt.confidence === "med" ? "bg-warn" : "bg-line";
  return (<div className="grid grid-cols-1 gap-4 rounded-[18px] border border-line-2 bg-surface px-[22px] py-5 shadow-object md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
    <div>
      <div className="flex flex-wrap items-center gap-2.5 text-sm font-semibold text-ink-2"><GradeBadge grade={opt.gradeValue} size="lg" tier={opt.tier} tierClass="text-sm" />{!opt.tier && opt.label.includes("all tiers") && <span className="text-sm font-bold text-gold">all tiers</span>}{most && <span className="font-medium text-mute">most traded grade</span>}</div>
      <div className="mt-2.5 flex flex-wrap items-baseline gap-3"><Price value={opt.medianUsd} className="text-[clamp(44px,7vw,64px)]" /><Delta pct={deltaPct(sales, opt, window, now)} /></div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13.5px] text-mute">
        <span><i className={`mr-[5px] inline-block h-[7px] w-[7px] rounded-full align-[1px] ${dotCls}`} />{opt.nSales} sale{opt.nSales === 1 ? "" : "s"} in {w.text}</span>
        <span>Range {fmtUsd(opt.minUsd)}–{Math.round(opt.maxUsd).toLocaleString("en-US")}</span>
        {last?.sold_at && <span>Last sold {fmtDateLong(last.sold_at)} for {fmtNative(Number(last.price), last.currency)}</span>}
      </div>
    </div>
    <Sparkline sales={mine} gold={opt.gradeValue === 10} window={window} />
  </div>);
}
