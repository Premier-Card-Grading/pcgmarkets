"use client";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, XAxis, YAxis, LabelList } from "recharts";
import type { SaleRow } from "@/lib/card-data";
import { niceStep, rollingMedian, WINDOWS, type Window } from "@/lib/grades";
import { fmtUsd } from "@/lib/format";

const label = { fontSize: 11, fontWeight: 600, fill: "var(--muted)", fontFamily: "inherit" } as const;

type DotShapeProps = { cx?: number; cy?: number; payload?: { t?: number } };
type LabelContentProps = { x?: number | string; y?: number | string; value?: number | string; index?: number };

export function PriceChart({ sales, gold, window, now }: { sales: SaleRow[]; gold: boolean; window: Window; now: Date }) {
  const usable = sales.filter((s) => s.sold_at && s.price_usd != null);
  if (usable.length === 0) return null;
  const c = gold ? "var(--gold-badge)" : "var(--accent)";
  const days = WINDOWS.find((x) => x.value === window)!.days;
  const t0 = days == null ? Math.min(...usable.map((s) => new Date(s.sold_at!).getTime())) : now.getTime() - days * 86400000;
  const dots = usable.map((s) => ({ t: new Date(s.sold_at!).getTime(), v: Number(s.price_usd), bo: s.is_best_offer })).sort((a, b) => a.t - b.t);
  const line = rollingMedian(usable);
  const step = niceStep(Math.max(...dots.map((d) => d.v)));
  const maxY = step * 4;
  const last = dots[dots.length - 1]!;
  const nonOffer = dots.filter((d) => !d.bo);
  const offer = dots.filter((d) => d.bo);
  const months: number[] = [];
  for (const d = new Date(t0); d.getTime() < now.getTime(); d.setUTCMonth(d.getUTCMonth() + 1, 1)) if (d.getTime() > t0) months.push(d.getTime());
  const ticks = [t0, ...months, now.getTime()];
  const tick = (t: number) =>
    t === t0 ? new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : t === now.getTime() ? "Today" : new Date(t).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });

  return (
    <div className="h-[190px] md:h-[230px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 14, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line-2)" />
          <XAxis dataKey="t" type="number" domain={[t0, now.getTime()]} ticks={ticks} tickFormatter={tick} tick={label} axisLine={false} tickLine={false} />
          <YAxis
            dataKey="v"
            type="number"
            domain={[0, maxY]}
            ticks={[0, step, step * 2, step * 3, maxY]}
            tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 ? 2 : 0).replace(/\.?0+$/, "")}k` : `$${v}`)}
            tick={label}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Line data={line} dataKey="v" type="linear" stroke={c} strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <Scatter
            data={nonOffer}
            dataKey="v"
            fill={c}
            stroke="var(--ground)"
            strokeWidth={1.5}
            isAnimationActive={false}
            shape={(p: DotShapeProps) => (
              <circle cx={p.cx} cy={p.cy} r={p.payload?.t === last.t ? 6 : 4.5} fill={c} stroke="var(--ground)" strokeWidth={1.5} />
            )}
          >
            <LabelList
              dataKey="v"
              content={(p: LabelContentProps) =>
                p.index === nonOffer.length - 1 && !last.bo ? (
                  <text x={Number(p.x ?? 0) + 2} y={Number(p.y ?? 0) + 24} textAnchor="end" fontSize={14} fontWeight={800} fill="var(--ink)">
                    {fmtUsd(Number(p.value ?? 0))}
                  </text>
                ) : null
              }
            />
          </Scatter>
          <Scatter
            data={offer}
            dataKey="v"
            isAnimationActive={false}
            shape={(p: DotShapeProps) => <circle cx={p.cx} cy={p.cy} r={4.5} fill="var(--surface)" stroke={c} strokeWidth={2} />}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
