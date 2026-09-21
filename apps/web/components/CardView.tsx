"use client";
import { useRouter, useSearchParams } from "next/navigation";
import type { CardPageData } from "@/lib/card-data";
import { WINDOWS, gradeOptions, defaultGradeKey, salesFor, isWindow, type Window } from "@/lib/grades";
import { GradeSelect } from "./GradeSelect";
import { GuideBox } from "./GuideBox";
import { SalesList } from "./SalesList";
import { PriceChart } from "./PriceChart";
import { Segmented } from "./Segmented";
import { SectionHead } from "./SectionHead";
export function CardView({ data, now }: { data: CardPageData; now: string }) {
  const router = useRouter(); const sp = useSearchParams();
  const window: Window = isWindow(sp.get("w")) ? (sp.get("w") as Window) : "90d";
  const options = gradeOptions(data.points, window);
  const key = options.some((o) => o.key === sp.get("g")) ? sp.get("g")! : defaultGradeKey(options);
  const opt = options.find((o) => o.key === key);
  const nowD = new Date(now);
  const set = (k: string, v: string) => { const q = new URLSearchParams(sp.toString()); q.set(k, v); router.replace(`?${q.toString()}`, { scroll: false }); };
  const w = WINDOWS.find((x) => x.value === window)!;
  const sales = opt ? salesFor(data.sales, opt, window, nowD) : [];
  return (<>
    <section>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3"><h2 className="m-0 text-[22px] font-extrabold tracking-[-0.02em]">Guide price</h2><Segmented label="Window" value={window} options={WINDOWS.map((x) => ({ value: x.value, label: x.label }))} onChange={(v) => set("w", v)} /></div>
      {opt ? (<>
        <div className="mb-3"><GradeSelect options={options} value={opt.key} onChange={(k) => set("g", k)} /></div>
        <GuideBox opt={opt} sales={data.sales} allOptions={options} window={window} now={nowD} />
        <p className="mt-3 max-w-[70ch] text-[13px] leading-[1.55] text-mute">Median of {opt.nSales} matched {opt.label} sales in the last {w.text}, in USD. Yen sales are converted at the ECB rate on the day they sold. Best-offer sales are listed but left out of the median.</p>
      </>) : <div className="rounded-[18px] border border-line-2 bg-surface p-6 text-mute">No PCG sales recorded in this window yet.</div>}
    </section>
    {opt && (<section className="mt-10"><SectionHead title={`${opt.label} sales`} aside={`${sales.length} in this window`} /><SalesList sales={sales} opt={opt} /></section>)}
    {opt && sales.length > 0 && (<section className="mt-10"><SectionHead title="Over time" aside={`Last ${w.text}, USD`} /><PriceChart sales={sales} gold={opt.gradeValue === 10} window={window} now={nowD} />
      <div className="flex flex-wrap gap-4 pt-2 text-[12.5px] font-medium text-mute"><span><i className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full" style={{ background: opt.gradeValue === 10 ? "var(--gold-badge)" : "var(--accent)" }} />{opt.label} sales</span><span><i className="mr-1.5 inline-block h-[9px] w-[9px] rounded-full bg-surface" style={{ boxShadow: `inset 0 0 0 2px ${opt.gradeValue === 10 ? "var(--gold-badge)" : "var(--accent)"}` }} />Best offer, not in median</span><span className="ml-auto">Line is the rolling median</span></div></section>)}
  </>);
}
