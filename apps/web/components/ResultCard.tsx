import Link from "next/link";
import type { SearchResult } from "@/lib/search";
import { fmtUsd } from "@/lib/format";

export function ResultCard({ r }: { r: SearchResult }) {
  return (
    <Link href={`/card/${encodeURIComponent(r.id)}`} className="flex items-center gap-3 rounded-lg border bg-white p-3 hover:border-zinc-400">
      {r.imageUrl ? <img src={r.imageUrl} alt="" className="h-20 w-14 rounded object-cover" /> : <div className="h-20 w-14 rounded bg-zinc-100" />}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{r.nameEn ?? r.nameJa}</div>
        {r.nameEn && r.nameJa && <div className="truncate text-sm text-zinc-500">{r.nameJa}</div>}
        <div className="text-sm text-zinc-600">{r.setName} · {r.numberPrinted} · <span className="rounded bg-zinc-100 px-1 text-xs uppercase">{r.language}</span></div>
      </div>
      <div className="text-right">
        <div className="text-xs text-zinc-500">PCG 10 · 90d</div>
        <div className="font-semibold">{r.pcg10Median != null ? fmtUsd(r.pcg10Median) : "—"}</div>
        <div className="text-xs text-zinc-500">{r.saleCount} sales</div>
      </div>
    </Link>
  );
}
