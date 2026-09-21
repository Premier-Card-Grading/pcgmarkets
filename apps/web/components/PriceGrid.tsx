import type { PricePointRow } from "@/lib/card-data";
import { fmtUsd } from "@/lib/format";
// Local type: GridColumn was removed from lib/card-data.ts in Task 8. This
// component is orphaned (no longer rendered by app/card/[id]/page.tsx) and
// will be deleted in Task 11; this keeps it typechecking in the meantime.
interface GridColumn { title: string; point: PricePointRow }
const dot = { high: "bg-green-500", med: "bg-amber-500", low: "bg-zinc-400" } as const;
export function PriceGrid({ columns, window }: { columns: GridColumn[]; window: string }) {
  if (columns.length === 0) return <div className="rounded-lg border bg-white p-6 text-zinc-500">No PCG sales recorded in this window yet.</div>;
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-2">
        {columns.map((c) => (
          <div key={c.title} className="min-w-[8.5rem] rounded-lg border bg-white p-3">
            <div className="text-xs font-medium text-zinc-500">PCG {c.title}</div>
            <div className="text-2xl font-semibold">{fmtUsd(Number(c.point.median_usd))}</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500"><span className={`inline-block h-2 w-2 rounded-full ${dot[c.point.confidence]}`} />{c.point.n_sales} sale{c.point.n_sales === 1 ? "" : "s"} · {c.point.confidence}</div>
          </div>
        ))}
      </div>
      <div className="mt-1 text-xs text-zinc-500">Median of matched sales in the last {window === "all" ? "all time" : window} · USD at ECB rate on sale date</div>
    </div>
  );
}
