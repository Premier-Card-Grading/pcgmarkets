"use client";
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { GradeBadge } from "./GradeBadge";
import type { GradeOption } from "@/lib/grades";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
function Option({ o, selected, onPick, tall }: { o: GradeOption; selected: boolean; onPick: () => void; tall?: boolean }) {
  return (<button type="button" role="option" aria-selected={selected} onClick={onPick} className={cn("flex w-full items-center gap-2.5 rounded-[9px] py-1.5 pl-2 pr-2.5 text-left text-[15px] font-bold text-ink hover:bg-sunk focus-visible:bg-sunk", tall && "min-h-[52px] text-base", !tall && "min-h-12", selected && "bg-sunk")}>
    <GradeBadge grade={o.gradeValue} /><span>{o.label}</span><span className="ml-auto text-[13.5px] font-medium text-mute tnum">{o.nSales} sales</span><Check size={18} className={cn("shrink-0 text-teal", !selected && "invisible")} />
  </button>);
}
export function GradeSelect({ options, value, onChange }: { options: GradeOption[]; value: string; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const desktop = useMediaQuery("(min-width: 768px)", true);
  const cur = options.find((o) => o.key === value) ?? options[0];
  if (!cur) return null;
  const pick = (k: string) => { onChange(k); setOpen(false); };
  const trigger = (<button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} className={cn("flex w-full max-w-[360px] items-center gap-2.5 rounded-xl border border-line bg-surface py-1.5 pl-2 pr-3 text-left text-[15px] font-bold text-ink shadow-[0_1px_2px_rgba(0,0,0,.06)] transition-colors min-h-[52px] hover:border-mute", open && "border-teal ring-[3px] ring-teal-soft")}>
    <GradeBadge grade={cur.gradeValue} /><span>{cur.label}</span><span className="text-[13.5px] font-medium text-mute tnum">{cur.nSales} sales</span><ChevronDown size={18} className={cn("ml-auto text-mute transition-transform duration-[180ms]", open && "rotate-180")} />
  </button>);
  if (desktop) return (<Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>{trigger}</PopoverTrigger><PopoverContent align="start" sideOffset={6} className="w-[var(--radix-popover-trigger-width)] flex flex-col gap-0.5" role="listbox" aria-label="Grade">{options.map((o) => <Option key={o.key} o={o} selected={o.key === cur.key} onPick={() => pick(o.key)} />)}</PopoverContent></Popover>);
  return (<>{trigger}<Drawer open={open} onOpenChange={setOpen}><DrawerContent>
    <div className="flex items-center justify-between px-1.5 pb-2 text-[17px] font-extrabold tracking-[-0.01em]"><DrawerTitle className="m-0 text-[17px] font-extrabold">Grade</DrawerTitle><DrawerClose className="min-h-10 px-1.5 text-[15px] font-bold text-teal">Done</DrawerClose></div>
    <div role="listbox" aria-label="Grade" className="flex flex-col gap-0.5">{options.map((o) => <Option key={o.key} o={o} tall selected={o.key === cur.key} onPick={() => pick(o.key)} />)}</div>
  </DrawerContent></Drawer></>);
}
