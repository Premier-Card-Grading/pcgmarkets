"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { SaleRow } from "@/lib/card-data";
export function PriceChart({ sales }: { sales: SaleRow[] }) {
  const usable = sales.filter((s) => s.sold_at && s.price_usd != null && !s.is_best_offer && s.grade_value != null);
  if (usable.length < 2) return null;
  const grades = [...new Set(usable.map((s) => String(s.grade_value)))].sort((a, b) => Number(b) - Number(a));
  const data = usable.map((s) => ({ date: s.sold_at!.slice(0, 10), [String(s.grade_value)]: Number(s.price_usd) })).sort((a, b) => a.date.localeCompare(b.date));
  const colors = ["#111827", "#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed"];
  return (
    <div className="h-64 rounded-lg border bg-white p-2">
      <ResponsiveContainer><LineChart data={data}>
        <XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `$${v}`} /><Tooltip /><Legend />
        {grades.map((g, i) => <Line key={g} type="monotone" dataKey={g} name={`PCG ${g}`} stroke={colors[i % colors.length]} connectNulls dot />)}
      </LineChart></ResponsiveContainer>
    </div>
  );
}
