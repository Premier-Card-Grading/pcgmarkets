import { serviceClient } from "@/lib/supabase-server";
export const dynamic = "force-dynamic";
export default async function Health() {
  const db = serviceClient();
  const [{ data: runs }, { data: state }, { data: bySource }, { data: byState }] = await Promise.all([
    db.from("ingest_runs").select("*").order("started_at", { ascending: false }).limit(40),
    db.from("connector_state").select("*"),
    db.from("raw_listings").select("source,kind"),
    db.from("listing_matches").select("state"),
  ]);
  const tally = <T,>(rows: T[] | null, key: (r: T) => string) => { const m = new Map<string, number>(); for (const r of rows ?? []) m.set(key(r), (m.get(key(r)) ?? 0) + 1); return [...m.entries()]; };
  const cls: Record<string, string> = { ok: "text-green-700", failed: "text-red-700", suspect: "bg-amber-100 text-amber-900", running: "text-zinc-500" };
  return (
    <div className="space-y-6 text-sm">
      <section><h2 className="font-semibold">Counts</h2>
        <div className="flex flex-wrap gap-2">{tally(bySource as { source: string; kind: string }[] | null, (r) => `${r.source}/${r.kind}`).map(([k, v]) => <span key={k} className="rounded bg-zinc-100 px-2 py-1">{k}: {v}</span>)}
          {tally(byState as { state: string }[] | null, (r) => r.state).map(([k, v]) => <span key={k} className="rounded bg-blue-50 px-2 py-1">{k}: {v}</span>)}</div></section>
      <section><h2 className="font-semibold">Connector cursors</h2><pre className="overflow-auto rounded bg-zinc-100 p-2 text-xs">{JSON.stringify(state, null, 1)}</pre></section>
      <section><h2 className="font-semibold">Recent runs</h2>
        <table className="w-full"><thead className="text-left text-xs text-zinc-500"><tr><th>job</th><th>status</th><th>started</th><th>seen</th><th>new</th><th>errors</th></tr></thead>
          <tbody>{(runs ?? []).map((r: { id: string; job: string; status: string; started_at: string; items_seen: number; items_new: number; errors: unknown[] }) => (
            <tr key={r.id} className="border-t"><td>{r.job}</td><td className={cls[r.status]}>{r.status}</td><td>{r.started_at.slice(0, 16)}</td><td>{r.items_seen}</td><td>{r.items_new}</td><td className="max-w-md truncate text-xs">{r.errors?.length ? JSON.stringify(r.errors) : ""}</td></tr>))}</tbody></table></section>
    </div>
  );
}
