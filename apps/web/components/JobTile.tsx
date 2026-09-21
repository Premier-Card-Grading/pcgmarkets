"use client";
import { useState } from "react";
import type { JobSummary } from "@/lib/health";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
export function JobTile({ j, now }: { j: JobSummary; now: string }) {
  const [open, setOpen] = useState(false);
  return (<li className={cn("grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-line-2 bg-surface px-3.5 py-3", j.status === "failed" && "border-bad", j.status === "suspect" && "border-gold-line")}>
    <span className="text-[15px] font-extrabold tracking-[-0.01em] wdth-96">{j.job}</span><span className="text-right text-[12.5px] text-mute tnum">{relativeTime(j.at, new Date(now))}</span>
    <span className={cn("col-span-full text-[13.5px] text-ink-2", j.status === "failed" && "font-medium text-bad")}>{j.note}{j.stack && <button type="button" onClick={() => setOpen(true)} className="pl-2 text-[13px] font-bold text-teal">Show stack</button>}</span>
    {j.stack && <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle className="text-base font-extrabold">{j.job} errors</DialogTitle><pre className="max-h-[60vh] overflow-auto rounded-lg bg-sunk p-3 text-xs">{j.stack}</pre></DialogContent></Dialog>}
  </li>);
}
