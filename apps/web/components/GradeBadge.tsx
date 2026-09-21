import { cn } from "@/lib/utils";
const sizes = { sm: "h-[22px] min-w-[26px] px-[5px] text-[12.5px] rounded-md", md: "h-7 min-w-8 px-[7px] text-[15px] rounded-lg", lg: "h-10 min-w-[46px] px-2.5 text-[22px] rounded-[11px]" } as const;
export function GradeBadge({ grade, size = "md", tier, tierClass }: { grade: number; size?: keyof typeof sizes; tier?: string | null; tierClass?: string }) {
  const ten = grade === 10;
  const badge = <span className={cn("inline-flex items-center justify-center font-extrabold wdth-92 tnum leading-none tracking-[-0.01em] shrink-0", sizes[size], ten ? "bg-gold-badge text-badge-ink" : "bg-ink text-ground")}>{grade}</span>;
  if (!tier) return badge;
  return <span className="inline-flex items-center gap-[7px] whitespace-nowrap">{badge}<span className={cn("text-[12.5px] font-bold text-gold tracking-[0.01em]", tierClass)}>{tier}</span></span>;
}
