"use client";
import { useState } from "react";
import type { Run } from "@/lib/health";
import { runTone, statusWord, firstError } from "@/lib/health";
import { StatusPill } from "./StatusPill";
import { fmtDuration } from "@/lib/format";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
const started = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).replace(",", "");
export function RunsTable({ runs }: { runs: Run[] }) {
  const [stack, setStack] = useState<string | null>(null);
  const th = "whitespace-nowrap border-b border-line bg-sunk px-3 py-2.5 text-left text-[12.5px] font-semibold text-mute";
  const td = "whitespace-nowrap border-t border-line-2 px-3 py-[9px] tnum";
  return (<div className="overflow-x-auto rounded-xl border border-line-2 bg-surface"><table className="w-full min-w-[680px] border-collapse text-sm"><thead><tr><th className={th}>Job</th><th className={th}>Status</th><th className={th}>Started</th><th className={`${th} text-right`}>Took</th><th className={`${th} text-right`}>Seen</th><th className={`${th} text-right`}>New</th><th className={th}>Errors</th></tr></thead>
    <tbody>{runs.map((r) => (<tr key={r.id}><td className={`${td} font-bold`}>{r.job}</td><td className={td}><StatusPill tone={runTone(r.status)}>{statusWord(r.status)}</StatusPill></td><td className={td}>{started(r.started_at)}</td><td className={`${td} text-right`}>{r.finished_at ? fmtDuration(new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) : "—"}</td><td className={`${td} text-right`}>{r.items_seen.toLocaleString("en-US")}</td><td className={`${td} text-right`}>{r.items_new.toLocaleString("en-US")}</td><td className={`${td} max-w-[320px] whitespace-normal text-[13px] font-medium text-bad`}>{firstError(r)}{r.errors.length > 0 && <button type="button" onClick={() => setStack(JSON.stringify(r.errors, null, 2))} className="pl-2 font-bold text-teal">Show stack</button>}</td></tr>))}</tbody></table>
    <Dialog open={stack != null} onOpenChange={(o) => !o && setStack(null)}><DialogContent><DialogTitle className="text-base font-extrabold">Errors</DialogTitle><pre className="max-h-[60vh] overflow-auto rounded-lg bg-sunk p-3 text-xs">{stack}</pre></DialogContent></Dialog></div>);
}
