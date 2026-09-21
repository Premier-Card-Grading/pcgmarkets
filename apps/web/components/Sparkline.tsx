"use client";
import { Area, AreaChart, ReferenceDot, ResponsiveContainer, YAxis } from "recharts";
import type { SaleRow } from "@/lib/card-data";
import { rollingMedian, WINDOWS, type Window } from "@/lib/grades";

export function Sparkline({ sales, gold, window }: { sales: SaleRow[]; gold: boolean; window: Window }) {
  const pts = rollingMedian(sales);
  const w = WINDOWS.find((x) => x.value === window)!;
  if (pts.length < 3) return <div className="flex h-16 items-center justify-center text-[11.5px] font-medium text-mute">Not enough sales for a trend</div>;
  const stroke = gold ? "var(--gold-badge)" : "var(--accent)", fill = gold ? "var(--gold-fill)" : "var(--accent-soft)";
  const last = pts[pts.length - 1]!;
  const lo = Math.min(...pts.map((p) => p.v)) * 0.94, hi = Math.max(...pts.map((p) => p.v)) * 1.06;
  const first = new Date(pts[0]!.t).toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  return (
    <div>
      <div className="h-16">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={pts} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <YAxis hide domain={[lo, hi]} />
            <Area type="monotone" dataKey="v" stroke={stroke} strokeWidth={2.5} fill={fill} fillOpacity={1} dot={false} isAnimationActive={false} />
            <ReferenceDot x={pts.length - 1} y={last.v} r={4} fill={stroke} stroke="var(--surface)" strokeWidth={2} ifOverflow="visible" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex justify-between text-[11.5px] font-medium text-mute">
        <span>{first}</span>
        <span>vs previous {w.text}</span>
        <span>Today</span>
      </div>
    </div>
  );
}
