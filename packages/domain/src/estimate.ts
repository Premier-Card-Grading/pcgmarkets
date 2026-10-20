import type { Language } from "./types";

export type Era = "vintage" | "mid" | "modern";
export type PcGradeKey = "10" | "9.5" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2" | "1";

export const PCT_MIN = 0.6;
export const PCT_MAX = 0.9;
/** A (language, era) group smaller than this can't be ranked meaningfully; its cards get PCT_MIN. */
export const MIN_GROUP = 20;
export const MAX_IMPORT_AGE_DAYS = 7;
export const ERA_BOUNDS = { vintageBefore: "2003-07-01", modernFrom: "2017-01-01" } as const;
export const ESTIMATE_GRADES = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6, 5, 4, 3, 2, 1] as const;

export interface EstimateInput { productId: string; language: Language; era: Era; salesVolume: number | null; pricesUsd: Partial<Record<PcGradeKey, number>> }
export interface Estimate { productId: string; gradeValue: number; estimateUsd: number; pct: number; era: Era }

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

/** Rank scaled to [0,1]: lowest 0, highest 1, ties share the average rank. A single value gets 0. */
export function percentileRanks(values: number[]): number[] {
  const n = values.length;
  if (n <= 1) return values.map(() => 0);
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(n);
  for (let s = 0; s < n; ) {
    let e = s;
    while (e + 1 < n && order[e + 1]!.v === order[s]!.v) e++;
    const r = (s + e) / 2 / (n - 1);
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

export function computeEstimates(cards: EstimateInput[], pcgGraded: Set<string>): Estimate[] {
  const groups = new Map<string, EstimateInput[]>();
  for (const c of cards) {
    const k = `${c.language}|${c.era}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const out: Estimate[] = [];
  for (const g of groups.values()) {
    const ranks = g.length < MIN_GROUP ? g.map(() => 0) : percentileRanks(g.map((c) => c.salesVolume ?? 0));
    g.forEach((c, i) => {
      const pct = round(PCT_MIN + (PCT_MAX - PCT_MIN) * ranks[i]!, 4);
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
