"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { matchesCardQuery, parseCardQuery } from "@pcg/domain";
import { sortCards, tilePrice, type SetCard } from "@/lib/sets-data";
import { CardTile } from "./CardTile";
import { cn } from "@/lib/utils";

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (<div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-[10px] bg-sunk p-[3px]">
    {options.map((o) => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className={cn("min-h-9 rounded-[7px] px-3 text-[13.5px] font-semibold", value === o.value ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "text-mute")}>{o.label}</button>)}
  </div>);
}

export type GridFilter = "priced" | "all";

/** What to say when the grid is empty: a search that found nothing, or the "With prices" filter on a set with none. */
export function emptyGridMessage(q: string, only: GridFilter): string {
  const t = q.trim();
  if (t) return `No cards match “${t}”.`;
  return only === "priced" ? "No cards with prices yet." : "No cards in this set yet.";
}

/** The grid opens on cards with a PCG price or an estimate, unless the set has none, when it opens on every card. */
export const defaultGridFilter = (pricedCount: number): GridFilter => (pricedCount > 0 ? "priced" : "all");

export function SetCardGrid({ cards, setCode, now }: { cards: SetCard[]; setCode: string | null; now: string }) {
  const nowD = useMemo(() => new Date(now), [now]);
  const priced = useMemo(() => new Set(cards.filter((c) => tilePrice(c, nowD).kind !== "none").map((c) => c.id)), [cards, nowD]);
  const [q, setQ] = useState(""); const [only, setOnly] = useState<GridFilter>(() => defaultGridFilter(priced.size)); const [by, setBy] = useState<"number" | "price">("number");
  const shown = useMemo(() => {
    const query = parseCardQuery(q);
    return sortCards(cards.filter((c) => (only === "all" || priced.has(c.id)) && matchesCardQuery(c, query)), by, nowD);
  }, [cards, q, only, by, nowD, priced]);
  return (<>
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <label className="flex min-h-11 w-full max-w-[420px] flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-teal focus-within:ring-[3px] focus-within:ring-teal-soft">
        <Search size={16} className="text-mute" aria-hidden /><span className="sr-only">Find a card</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Card # (069/187, 69) or name" inputMode="search" className="w-full bg-transparent text-[15px] outline-none placeholder:text-mute" />
      </label>
      <Toggle label="Show" value={only} onChange={setOnly} options={[{ value: "priced", label: `With prices ${priced.size}` }, { value: "all", label: `All ${cards.length}` }]} />
      <Toggle label="Sort" value={by} onChange={setBy} options={[{ value: "number", label: "Number" }, { value: "price", label: "Price" }]} />
    </div>
    {shown.length === 0
      ? <p className="text-[14px] text-mute">{emptyGridMessage(q, only)} <button type="button" onClick={() => { setQ(""); setOnly("all"); }} className="font-semibold text-teal">Clear</button></p>
      : <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{shown.map((c) => <li key={c.id}><CardTile card={c} price={tilePrice(c, nowD)} setCode={setCode} /></li>)}</ul>}
  </>);
}
