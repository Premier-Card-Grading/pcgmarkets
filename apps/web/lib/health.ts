import type { Tone } from "@/components/StatusPill";
export interface Run { id: string; job: string; status: "running" | "ok" | "failed" | "suspect"; started_at: string; finished_at: string | null; items_seen: number; items_new: number; items_updated: number; errors: unknown[] }
export interface JobSummary { job: string; status: Run["status"]; at: string; note: string; err: string | null; stack: string | null }
const short = (iso: string) => iso.replace(/:\d\d(\.\d+)?Z$/, "Z");
export function formatCursor(c: unknown): string {
  if (c == null) return "—"; if (typeof c === "string") return short(c);
  if (typeof c === "object") { const o = c as Record<string, unknown>; const parts: string[] = []; if (o.page != null) parts.push(`page ${o.page}`); for (const k of ["since", "until", "cursor", "updated", "ts"]) if (typeof o[k] === "string") { parts.push(short(o[k] as string)); break; } return parts.length ? parts.join(" · ") : JSON.stringify(c); }
  return String(c);
}
export const runTone = (s: Run["status"]): Tone => s === "ok" ? "ok" : s === "failed" ? "bad" : s === "suspect" ? "warn" : "mute";
export const statusWord = (s: Run["status"]) => ({ ok: "OK", failed: "Failed", suspect: "Suspect", running: "Running" }[s]);
const n = (x: number) => x.toLocaleString("en-US");
export function resultLine(r: Run): string {
  if (r.status === "failed") return `Failed: ${firstError(r) ?? "unknown error"}`;
  if (r.status === "suspect") return `Suspect: ${n(r.items_seen)} seen, ${n(r.items_new)} new`;
  if (r.job === "catalog:tcgdex") return `OK · ${n(r.items_seen)} sets, ${n(r.items_new)} cards`;
  if (r.job === "match") return `OK · ${n(r.items_new)} matched, ${n(r.items_updated)} sent to review`;
  return `${statusWord(r.status)} · ${n(r.items_seen)} seen, ${n(r.items_new)} new`;
}
export const firstError = (r: Run): string | null => { const e = r.errors?.[0] as { message?: string } | string | undefined; return e == null ? null : typeof e === "string" ? e : e.message ?? JSON.stringify(e); };
export function summarise(runs: Run[]): JobSummary[] {
  const latest = new Map<string, Run>(); for (const r of [...runs].sort((a, b) => b.started_at.localeCompare(a.started_at))) if (!latest.has(r.job)) latest.set(r.job, r);
  const rank = { failed: 0, suspect: 1, running: 2, ok: 3 } as const;
  return [...latest.values()].sort((a, b) => rank[a.status] - rank[b.status] || b.started_at.localeCompare(a.started_at)).map((r) => ({ job: r.job, status: r.status, at: r.started_at, note: resultLine(r), err: r.status === "failed" ? firstError(r) : null, stack: r.status === "failed" && r.errors.length ? JSON.stringify(r.errors, null, 2) : null }));
}
