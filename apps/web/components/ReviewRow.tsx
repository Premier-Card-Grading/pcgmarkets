"use client";
import { useState, useTransition } from "react";
import { resolveListing, rejectListing } from "@/app/admin/review/actions";
import type { SearchResult } from "@/lib/search";

const GRADES = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6, 5, 4, 3, 2, 1];
export interface ReviewItem { id: string; title: string; description: string | null; price: number; currency: string; url: string; imageUrls: string[]; reason: string | null; extracted: Record<string, unknown> }

export function ReviewRow({ item }: { item: ReviewItem }) {
  const [q, setQ] = useState(""); const [hits, setHits] = useState<SearchResult[]>([]); const [pick, setPick] = useState<SearchResult | null>(null);
  const [grade, setGrade] = useState<string>(String(item.extracted.grade ?? "10")); const [label, setLabel] = useState<string>("");
  const [pending, start] = useTransition();
  async function search(v: string) { setQ(v); if (v.length < 2) return setHits([]); const r = await fetch(`/api/search?q=${encodeURIComponent(v)}`); const o = await r.json(); setHits("results" in o ? o.results : []); }
  return (
    <div className="grid gap-3 rounded-lg border bg-white p-3 md:grid-cols-[6rem_1fr_18rem]">
      {item.imageUrls[0] ? <img src={item.imageUrls[0]} alt="" className="h-24 w-24 rounded object-cover" /> : <div className="h-24 w-24 rounded bg-zinc-100" />}
      <div className="min-w-0 text-sm">
        <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-blue-700">{item.title}</a>
        <div className="text-zinc-600">{item.price} {item.currency} · <span className="rounded bg-amber-50 px-1 text-amber-800">{item.reason}</span></div>
        <div className="mt-1 text-xs text-zinc-500">found: {JSON.stringify(item.extracted)}</div>
        {item.description && <details className="mt-1 text-xs text-zinc-500"><summary>description</summary><pre className="whitespace-pre-wrap">{item.description}</pre></details>}
      </div>
      <div className="space-y-2 text-sm">
        <input className="w-full rounded border px-2 py-1" placeholder="find card: number / name" value={q} onChange={(e) => search(e.target.value)} />
        {hits.length > 0 && !pick && <ul className="max-h-40 overflow-auto rounded border">{hits.map((h) => <li key={h.id}><button className="w-full px-2 py-1 text-left hover:bg-zinc-100" onClick={() => { setPick(h); setHits([]); }}>{h.nameEn ?? h.nameJa} · {h.setName} · {h.numberPrinted} ({h.language})</button></li>)}</ul>}
        {pick && <div className="rounded bg-green-50 px-2 py-1">{pick.nameEn ?? pick.nameJa} · {pick.numberPrinted} <button className="ml-2 text-xs underline" onClick={() => setPick(null)}>change</button></div>}
        <div className="flex gap-2">
          <select className="rounded border px-2 py-1" value={grade} onChange={(e) => setGrade(e.target.value)}>{GRADES.map((g) => <option key={g} value={g}>{g}</option>)}<option value="authentic">Authentic</option></select>
          {grade === "10" && <select className="rounded border px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)}><option value="">tier unknown</option><option>Flawless</option><option>Pristine</option><option>Gem Mint</option></select>}
        </div>
        <div className="flex gap-2">
          <button disabled={!pick || pending} className="rounded bg-zinc-900 px-3 py-1 text-white disabled:opacity-40"
            onClick={() => start(() => resolveListing(item.id, { productId: pick!.id, gradeValue: grade === "authentic" ? null : Number(grade), gradeLabel: grade === "authentic" ? "Authentic" : label || null }))}>Assign</button>
          <button disabled={pending} className="rounded border px-3 py-1" onClick={() => start(() => rejectListing(item.id))}>Reject</button>
        </div>
      </div>
    </div>
  );
}
