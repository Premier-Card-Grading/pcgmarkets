import type { SaleRow } from "@/lib/card-data";
import { fmtDate, fmtNative, fmtUsd, gradeLabelText } from "@/lib/format";
const sourceName: Record<string, string> = { thecardapi: "eBay", yahoo_auc: "Yahoo! Auctions", soldcomps: "eBay" };
export function SoldList({ sales }: { sales: SaleRow[] }) {
  if (sales.length === 0) return null;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-zinc-500"><tr><th className="py-1">Date</th><th>Grade</th><th>Price</th><th>Source</th><th></th></tr></thead>
      <tbody>
        {sales.map((s) => (
          <tr key={s.id} className="border-t">
            <td className="py-2">{s.sold_at ? fmtDate(s.sold_at) : "—"}</td>
            <td>PCG {gradeLabelText(s.grade_value == null ? null : Number(s.grade_value), s.grade_label)}</td>
            <td>{s.is_best_offer ? "≤ " : ""}{fmtNative(Number(s.price), s.currency)}{s.currency !== "USD" && s.price_usd != null && <span className="text-zinc-500"> ({fmtUsd(Number(s.price_usd))})</span>}</td>
            <td>{sourceName[s.source] ?? s.source}</td>
            <td><a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-blue-600">↗</a></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
