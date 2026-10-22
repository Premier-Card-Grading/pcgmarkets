import type { Language } from "./types";

export type Era = "vintage" | "mid" | "modern";
export type PcGradeKey = "10" | "9.5" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2" | "1";

/**
 * The share of the PSA price every estimate uses for now (user, 2026-10-23), until there is a way to measure popularity.
 * The 60–90% popularity ranking below stays for when there is one.
 */
export const FLAT_PCT = 0.75;
export const PCT_MIN = 0.6;
export const PCT_MAX = 0.9;
/** A (language, era) group smaller than this can't be ranked meaningfully; its cards get PCT_MIN. */
export const MIN_GROUP = 20;
export const MAX_IMPORT_AGE_DAYS = 7;
export const ERA_BOUNDS = { vintageBefore: "2003-07-01", modernFrom: "2017-01-01" } as const;
export const ESTIMATE_GRADES = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6, 5, 4, 3, 2, 1] as const;

export interface EstimateInput { productId: string; language: Language; era: Era; salesVolume: number | null; pricesUsd: Partial<Record<PcGradeKey, number>> }
export type EstimateSource = "soldcomps" | "pricecharting";
export interface Estimate { productId: string; gradeValue: number; estimateUsd: number; pct: number; era: Era | null }

export function eraFor(releaseDate: string | null, override: Era | null): Era | null {
  if (override) return override;
  if (!releaseDate) return null;
  const d = releaseDate.slice(0, 10);
  if (d < ERA_BOUNDS.vintageBefore) return "vintage";
  if (d < ERA_BOUNDS.modernFrom) return "mid";
  return "modern";
}

export function pcKeyForGrade(g: number): PcGradeKey | null {
  if (g === 10) return "10";
  if (g === 9.5) return "9.5";
  if (g === 9) return "9";
  if (g === 8.5 || g === 8) return "8";
  if (g === 7.5 || g === 7) return "7";
  if ([6, 5, 4, 3, 2, 1].includes(g)) return String(g) as PcGradeKey;
  return null;
}

/** Share of the other values strictly below each value, scaled to [0,1]: lowest 0, a unique highest 1. Ties share the lowest rank of their group, so a pile of zero-volume cards all sit at 0. A single value gets 0. */
export function percentileRanks(values: number[]): number[] {
  const n = values.length;
  if (n <= 1) return values.map(() => 0);
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(n);
  for (let s = 0; s < n; ) {
    let e = s;
    while (e + 1 < n && order[e + 1]!.v === order[s]!.v) e++;
    const r = s / (n - 1);
    for (let k = s; k <= e; k++) out[order[k]!.i] = r;
    s = e + 1;
  }
  return out;
}

export const gradedKey = (productId: string, gradeValue: number) => `${productId}|${gradeValue}`;

export function dropDuplicateProducts(cards: EstimateInput[]): { unique: EstimateInput[]; duplicates: string[] } {
  const count = new Map<string, number>();
  for (const c of cards) count.set(c.productId, (count.get(c.productId) ?? 0) + 1);
  const duplicates = [...count.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  return { unique: cards.filter((c) => count.get(c.productId) === 1), duplicates };
}

const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;

/** PriceCharting estimates. With `flatPct` every card gets that share; without it, the 60–90% popularity ranking. */
export function computeEstimates(cards: EstimateInput[], pcgGraded: Set<string>, opts: { flatPct?: number } = {}): Estimate[] {
  const groups = new Map<string, EstimateInput[]>();
  for (const c of cards) {
    const k = `${c.language}|${c.era}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const out: Estimate[] = [];
  for (const g of groups.values()) {
    const ranks = g.length < MIN_GROUP ? g.map(() => 0) : percentileRanks(g.map((c) => c.salesVolume ?? 0));
    g.forEach((c, i) => {
      const pct = opts.flatPct ?? round(PCT_MIN + (PCT_MAX - PCT_MIN) * ranks[i]!, 4);
      for (const gradeValue of ESTIMATE_GRADES) {
        if (pcgGraded.has(gradedKey(c.productId, gradeValue))) continue;
        const key = pcKeyForGrade(gradeValue);
        const psa = key ? c.pricesUsd[key] : undefined;
        if (psa == null || !(psa > 0)) continue;
        out.push({ productId: c.productId, gradeValue, estimateUsd: Math.min(round(psa * pct, 2), psa), pct, era: c.era });
      }
    });
  }
  return out;
}

/** A card and grade needs this many priced PSA sales in the last PSA_WINDOW_DAYS for a SoldComps PSA price. */
export const PSA_MIN_SALES = 3;
export const PSA_WINDOW_DAYS = 90;
export interface PsaSale { productId: string; gradeValue: number; priceUsd: number; soldAt: Date }
export interface PsaGradePrice { productId: string; gradeValue: number; medianUsd: number; nSales: number; newestSoldAt: Date }

/** Median PSA price per card and PSA grade, from priced sales in the last 90 days, where there are at least 3. */
export function psaGradePrices(sales: PsaSale[], now: Date): PsaGradePrice[] {
  const since = now.getTime() - PSA_WINDOW_DAYS * 86400000;
  const groups = new Map<string, PsaSale[]>();
  for (const s of sales) {
    if (s.soldAt.getTime() < since || s.soldAt.getTime() > now.getTime() || !(s.priceUsd > 0)) continue;
    const k = gradedKey(s.productId, s.gradeValue);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const out: PsaGradePrice[] = [];
  for (const g of groups.values()) {
    if (g.length < PSA_MIN_SALES) continue;
    const xs = g.map((s) => s.priceUsd).sort((a, b) => a - b), mid = Math.floor(xs.length / 2);
    out.push({ productId: g[0]!.productId, gradeValue: g[0]!.gradeValue, medianUsd: xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2,
      nSales: g.length, newestSoldAt: new Date(Math.max(...g.map((s) => s.soldAt.getTime()))) });
  }
  return out;
}

export type SourcedEstimate = Estimate & { source: EstimateSource; asOf: Date | null };

/**
 * Both sources together: a SoldComps PSA price always wins over PriceCharting for the same card and grade (user,
 * 2026-10-23). A PCG grade uses PSA sales of the same grade; PSA has no 9.5, so PCG 9.5 only ever comes from
 * PriceCharting. Grades with any PCG sale get no estimate. `asOf` is the newest PSA sale used (null for PriceCharting,
 * whose date is its import's).
 */
export function combineEstimates(psa: PsaGradePrice[], pc: Estimate[], pcgGraded: Set<string>, pct: number): SourcedEstimate[] {
  const out = new Map<string, SourcedEstimate>();
  for (const e of pc) if (!pcgGraded.has(gradedKey(e.productId, e.gradeValue))) out.set(gradedKey(e.productId, e.gradeValue), { ...e, source: "pricecharting", asOf: null });
  for (const p of psa) {
    const k = gradedKey(p.productId, p.gradeValue);
    if (pcgGraded.has(k) || !(ESTIMATE_GRADES as readonly number[]).includes(p.gradeValue)) continue;
    const era = out.get(k)?.era ?? null;
    out.set(k, { productId: p.productId, gradeValue: p.gradeValue, estimateUsd: Math.min(round(p.medianUsd * pct, 2), p.medianUsd), pct, era, source: "soldcomps", asOf: p.newestSoldAt });
  }
  return [...out.values()];
}

