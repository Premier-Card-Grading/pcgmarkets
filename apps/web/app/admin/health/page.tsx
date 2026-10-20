import { serviceClient } from "@/lib/supabase-server";
import { summarise, formatCursor, type Run } from "@/lib/health";
import { SCHEDULE, nextRun } from "@/lib/schedule";
import { JobTile } from "@/components/JobTile";
import { RunsTable } from "@/components/RunsTable";
import { StatusPill } from "@/components/StatusPill";
import { SectionHead } from "@/components/SectionHead";
import { relativeTime } from "@/lib/format";
export const dynamic = "force-dynamic";
const SRC: Record<string, string> = { "soldcomps/sold": "eBay sold · SoldComps", "thecardapi/sold": "eBay sold · The Card API", "yahoo_auc/ended": "Yahoo! Auctions ended", "yahoo_auc/sold": "Yahoo! Auctions sold" };
const SWITCHES = [["The Card API", "CONNECTOR_THECARDAPI"], ["Yahoo! Auctions", "CONNECTOR_YAHOO_AUC"], ["SoldComps", "CONNECTOR_SOLDCOMPS"], ["PriceCharting", "CONNECTOR_PRICECHARTING"]] as const;
export default async function Health() {
  const db = serviceClient(); const now = new Date();
  const [{ data: runs }, { data: state }, { data: bySource }, { data: byState }, { data: pcImp }] = await Promise.all([
    db.from("ingest_runs").select("*").order("started_at", { ascending: false }).limit(40), db.from("connector_state").select("*"), db.from("raw_listings").select("source,kind"), db.from("listing_matches").select("state"),
    db.from("pc_imports").select("fetched_at,status").eq("status", "ok").order("fetched_at", { ascending: false }).limit(1)]);
  const tally = <T,>(rows: T[] | null, key: (r: T) => string) => { const m = new Map<string, number>(); for (const r of rows ?? []) m.set(key(r), (m.get(key(r)) ?? 0) + 1); return m; };
  const src = tally(bySource as { source: string; kind: string }[] | null, (r) => `${r.source}/${r.kind}`); const st = tally(byState as { state: string }[] | null, (r) => r.state);
  const jobs = summarise((runs ?? []) as Run[]); const failed = jobs.filter((j) => j.status === "failed").length, suspect = jobs.filter((j) => j.status === "suspect").length;
  const next = SCHEDULE.map((s) => ({ ...s, at: nextRun(s.cron, now) })).sort((a, b) => a.at.getTime() - b.at.getTime())[0]!;
  const kv = "border-b border-line-2 py-[9px]";
  return (<>
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2"><h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em]">Ingest health</h1>{failed > 0 && <StatusPill tone="bad">{failed} failed</StatusPill>}{suspect > 0 && <StatusPill tone="warn">{suspect} suspect</StatusPill>}</div>
    <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2">{jobs.map((j) => <JobTile key={j.job} j={j} now={now.toISOString()} />)}
      <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-line-2 bg-surface px-3.5 py-3"><span className="text-[15px] font-extrabold text-mute wdth-96">Next run</span><span className="text-right text-[12.5px] text-mute tnum">{relativeTime(next.at.toISOString(), now)}</span><span className="col-span-full text-[13.5px] text-ink-2">{next.label}</span></li></ul>
    <div className="mt-9 grid grid-cols-1 gap-7 md:grid-cols-2 md:gap-12">
      <section><SectionHead title="Listings" /><table className="w-full border-collapse text-[14.5px]"><tbody>
        {[...src.entries()].map(([k, v]) => <tr key={k}><td className={`${kv} font-medium text-ink-2`}>{SRC[k] ?? k}</td><td className={`${kv} text-right font-bold tnum`}>{v.toLocaleString("en-US")}</td></tr>)}
        <tr><td className="border-b-2 border-ink py-[9px] font-extrabold">Matched</td><td className="border-b-2 border-ink py-[9px] text-right font-extrabold tnum">{(st.get("matched") ?? 0).toLocaleString("en-US")}</td></tr>
        <tr><td className={`${kv} font-medium text-ink-2`}>Needs review</td><td className={`${kv} text-right font-bold tnum`}>{st.get("needs_review") ?? 0}</td></tr><tr><td className={`${kv} font-medium text-ink-2`}>Rejected</td><td className={`${kv} text-right font-bold tnum`}>{(st.get("rejected") ?? 0).toLocaleString("en-US")}</td></tr></tbody></table></section>
      <section><SectionHead title="Connectors" /><table className="w-full border-collapse text-[14.5px]"><tbody>
        <tr><td className={`${kv} font-medium text-ink-2`}>PriceCharting CSV</td><td className={`${kv} text-right text-[13px] text-mute`}>{pcImp?.[0] ? relativeTime(pcImp[0].fetched_at, now) : "never imported"}</td></tr>
        {((state ?? []) as { connector: string; cursor: unknown }[]).map((c) => <tr key={c.connector}><td className={`${kv} font-medium text-ink-2`}>{c.connector} cursor</td><td className={`${kv} text-right text-[13px] text-mute`}>{formatCursor(c.cursor)}</td></tr>)}
        {SWITCHES.map(([label, env]) => <tr key={env}><td className={`${kv} font-medium text-ink-2`}>{label}</td><td className={`${kv} text-right`}><StatusPill tone={process.env[env] === "off" ? "bad" : "ok"}>{process.env[env] === "off" ? "Off" : "On"}</StatusPill></td></tr>)}</tbody></table></section>
    </div>
    <section className="mt-9"><SectionHead title="Recent runs" aside="Last 40" /><RunsTable runs={(runs ?? []) as Run[]} /></section>
  </>);
}
