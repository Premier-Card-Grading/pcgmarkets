import type { EstimateRow, PricePointRow, SaleRow } from "./card-data";
export type Window = "30d" | "90d" | "180d" | "all";
export const WINDOWS: { value: Window; label: string; days: number | null; text: string }[] = [
  { value: "30d", label: "30d", days: 30, text: "30 days" }, { value: "90d", label: "90d", days: 90, text: "90 days" }, { value: "180d", label: "180d", days: 180, text: "180 days" }, { value: "all", label: "All", days: null, text: "all time" },
];
export const isWindow = (w: unknown): w is Window => WINDOWS.some((x) => x.value === w);
export type GradeKey = string;
export interface GradeOption { key: GradeKey; gradeValue: number; tier: string | null; label: string; nSales: number; medianUsd: number; minUsd: number; maxUsd: number; confidence: "high" | "med" | "low"; lastSoldAt: string; estimate?: boolean }
const TIER_KEYS: Record<string, string> = { Flawless: "fl", Pristine: "pr", "Gem Mint": "gm" };
const TIER_ORDER = ["Flawless", "Pristine", "Gem Mint"];
export const gradeKey = (g: number, tier: string | null) => `${String(g).replace(".", "")}${tier ? TIER_KEYS[tier] ?? "" : ""}`;
export const gradeLabel = (g: number, tier: string | null, allTiers = false) => tier ? `PCG ${g} ${tier}` : allTiers ? `PCG ${g} · all tiers` : `PCG ${g}`;

export function gradeOptions(points: PricePointRow[], window: Window): GradeOption[] {
  const inWin = points.filter((p) => p.window === window && p.n_sales > 0);
  const mk = (p: PricePointRow, tier: string | null, allTiers = false): GradeOption => ({ key: gradeKey(Number(p.grade_value), tier), gradeValue: Number(p.grade_value), tier, label: gradeLabel(Number(p.grade_value), tier, allTiers), nSales: p.n_sales, medianUsd: Number(p.median_usd), minUsd: Number(p.min_usd), maxUsd: Number(p.max_usd), confidence: p.confidence, lastSoldAt: p.last_sold_at });
  const out: GradeOption[] = [];
  const tens = inWin.filter((p) => Number(p.grade_value) === 10);
  for (const t of TIER_ORDER) { const p = tens.find((x) => x.grade_label === t); if (p) out.push(mk(p, t)); }
  const any10 = tens.find((p) => p.grade_label === "any");
  if (any10 && any10.n_sales > tens.filter((p) => p.grade_label !== "any").reduce((n, p) => n + p.n_sales, 0)) out.push(mk(any10, null, true));
  for (const p of inWin.filter((p) => Number(p.grade_value) < 10 && p.grade_label === "any").sort((a, b) => Number(b.grade_value) - Number(a.grade_value))) out.push(mk(p, null));
  return out;
}
export const ESTIMATE_MAX_AGE_DAYS = 14;
/**
 * Estimated grades: only where the card has never had a PCG sale at that grade (any window), and the source is fresh.
 * A grade counts as sold if it has a price point or ANY matched sale, best offers and unpriced sales included.
 */
export function estimateOptions(points: PricePointRow[], estimates: EstimateRow[], now: Date, sales: SaleRow[] = []): GradeOption[] {
  const real = new Set([
    ...points.filter((p) => p.n_sales > 0).map((p) => Number(p.grade_value)),
    ...sales.filter((s) => s.grade_value != null).map((s) => Number(s.grade_value)),
  ]);
  const maxAge = ESTIMATE_MAX_AGE_DAYS * 86400000;
  return estimates
    .filter((e) => !real.has(Number(e.grade_value)) && now.getTime() - new Date(e.source_as_of).getTime() <= maxAge)
    .sort((a, b) => Number(b.grade_value) - Number(a.grade_value))
    .map((e) => {
      const g = Number(e.grade_value), v = Number(e.estimate_usd);
      return { key: `${gradeKey(g, null)}e`, gradeValue: g, tier: null, label: gradeLabel(g, null), nSales: 0, medianUsd: v, minUsd: v, maxUsd: v, confidence: "low" as const, lastSoldAt: "", estimate: true };
    });
}
export function defaultGradeKey(options: GradeOption[]): GradeKey | null {
  if (options.length === 0) return null;
  const real = options.filter((o) => !o.estimate);
  if (real.length === 0) return options[0]!.key;
  return real.find((o) => o.key === "10gm")?.key ?? real.find((o) => o.key === "10")?.key ?? [...real].sort((a, b) => b.nSales - a.nSales)[0]!.key;
}
const inRange = (s: SaleRow, from: number, to: number) => { if (!s.sold_at) return false; const t = new Date(s.sold_at).getTime(); return t > from && t <= to; };
const matches = (s: SaleRow, o: GradeOption) => Number(s.grade_value) === o.gradeValue && (o.tier == null || s.grade_label === o.tier);
function bounds(window: Window, now: Date, previous = false): [number, number] {
  const days = WINDOWS.find((w) => w.value === window)!.days;
  if (days == null) return [-Infinity, previous ? -Infinity : now.getTime()];
  const to = now.getTime() - (previous ? days : 0) * 86400000; return [to - days * 86400000, to];
}
export function salesFor(sales: SaleRow[], opt: GradeOption, window: Window, now: Date): SaleRow[] {
  const [from, to] = bounds(window, now);
  return sales.filter((s) => matches(s, opt) && inRange(s, from, to)).sort((a, b) => new Date(b.sold_at!).getTime() - new Date(a.sold_at!).getTime());
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
export function deltaPct(sales: SaleRow[], opt: GradeOption, window: Window, now: Date): number | null {
  if (window === "all") return null;
  const usd = (from: number, to: number) => sales.filter((s) => matches(s, opt) && !s.is_best_offer && s.price_usd != null && inRange(s, from, to)).map((s) => Number(s.price_usd));
  const cur = usd(...bounds(window, now)), prev = usd(...bounds(window, now, true));
  if (cur.length < 3 || prev.length < 3) return null;
  const a = median(cur), b = median(prev); return b === 0 ? null : ((a - b) / b) * 100;
}
export function rollingMedian(sales: SaleRow[]): { t: number; v: number }[] {
  const pts = sales.filter((s) => !s.is_best_offer && s.price_usd != null && s.sold_at).map((s) => ({ t: new Date(s.sold_at!).getTime(), p: Number(s.price_usd) })).sort((a, b) => a.t - b.t);
  return pts.map((p, i) => ({ t: p.t, v: median(pts.slice(Math.max(0, i - 3), i + 1).map((q) => q.p)) }));
}
export function niceStep(max: number): number { return [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((s) => s * 4 >= max * 1.15) ?? 10000; }
