"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { SeriesGroup } from "@/lib/sets-data";
import { filterTiles } from "@/lib/sets-data";
import { SetTileCard } from "./SetTileCard";

export function SetsBrowser({ groups }: { groups: SeriesGroup[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => groups.map((g) => ({ ...g, sets: filterTiles(g.sets, q) })).filter((g) => g.sets.length > 0), [groups, q]);
  return (<>
    <label className="mb-6 flex w-full max-w-[360px] items-center gap-2 rounded-xl border border-line bg-surface px-3 min-h-11 focus-within:border-teal focus-within:ring-[3px] focus-within:ring-teal-soft">
      <Search size={16} className="text-mute" aria-hidden /><span className="sr-only">Filter sets</span>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by set name or code" className="w-full bg-transparent text-[15px] outline-none placeholder:text-mute" />
    </label>
    {shown.length === 0 && <p className="text-[14px] text-mute">No sets match “{q}”.</p>}
    {shown.map((g) => (
      <section key={g.series} className="mb-9">
        <h2 className="m-0 mb-3 flex items-baseline justify-between text-[19px] font-extrabold tracking-[-0.01em]">{g.series}<span className="text-[13px] font-medium text-mute">{g.sets.length} sets</span></h2>
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{g.sets.map((t) => <li key={t.id}><SetTileCard tile={t} /></li>)}</ul>
      </section>))}
  </>);
}
