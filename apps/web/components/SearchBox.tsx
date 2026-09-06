"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchOutcome, SearchResult } from "@/lib/search";
import { ResultCard } from "./ResultCard";

export function SearchBox({ initialQuery = "" }: { initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const out = (await res.json()) as SearchOutcome;
      setBusy(false);
      if ("redirectTo" in out) router.push(out.redirectTo);
      else setResults(out.results);
    }, 250);
    return () => clearTimeout(t);
  }, [q, router]);

  return (
    <div className="space-y-4">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Card number (080/090), name, or 9-digit PCG cert"
        className="w-full rounded-lg border px-4 py-3 text-lg shadow-sm" inputMode="search" />
      {busy && <div className="text-sm text-zinc-500">Searching…</div>}
      <div className="grid gap-2">{results.map((r) => <ResultCard key={r.id} r={r} />)}</div>
      {!busy && q.trim().length >= 2 && results.length === 0 && <div className="text-sm text-zinc-500">No cards found.</div>}
    </div>
  );
}
