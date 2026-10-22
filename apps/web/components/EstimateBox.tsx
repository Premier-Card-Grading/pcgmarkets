import type { GradeOption } from "@/lib/grades";
import { GradeBadge } from "./GradeBadge";
import { Price } from "./Price";
import { fmtUsd } from "@/lib/format";

export const ESTIMATE_FOOTNOTE = "Estimated from PSA market prices — no PCG sales yet.";

/** Visible "Est." that screen readers hear as "Estimated" (abbr title alone is read inconsistently). */
export function EstMark({ className }: { className?: string }) {
  return <abbr title="Estimated" className={`no-underline ${className ?? ""}`.trim()}><span aria-hidden="true">Est.</span><span className="sr-only">Estimated</span></abbr>;
}

export function EstimateBox({ opt }: { opt: GradeOption }) {
  return (<>
    <div className="rounded-[18px] border border-dashed border-line bg-surface px-[22px] py-5">
      <div className="flex flex-wrap items-center gap-2.5 text-sm font-semibold text-ink-2"><GradeBadge grade={opt.gradeValue} size="lg" /><EstMark className="rounded-full bg-sunk px-2 py-0.5 text-[12.5px] font-bold text-mute" /></div>
      <div className="mt-2.5"><Price value={`~${fmtUsd(opt.medianUsd)}`} className="text-[clamp(44px,7vw,64px)] text-mute" /></div>
    </div>
    <p className="mt-3 max-w-[70ch] text-[13px] leading-[1.55] text-mute">{ESTIMATE_FOOTNOTE}</p>
  </>);
}
