import type { TierLabel } from "./types";

export type Window = "30d" | "90d" | "180d" | "all";
export const WINDOW_DAYS: Record<Window, number | null> = { "30d": 30, "90d": 90, "180d": 180, all: null };
export const TIERS: TierLabel[] = ["Flawless", "Pristine", "Gem Mint"];

export interface Sale {
  productId: string;
  gradeValue: number;
  gradeLabel: TierLabel | null;
  priceUsd: number;
  soldAt: Date;
}

export interface PricePoint {
  productId: string;
  gradeValue: number;
  gradeLabel: TierLabel | "any";
  window: Window;
  nSales: number;
  medianUsd: number;
  minUsd: number;
  maxUsd: number;
  lastSoldAt: Date;
  confidence: "high" | "med" | "low";
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function confidence(n: number, min: number, max: number): "high" | "med" | "low" {
  if (n <= 1) return "low";
  if (n >= 5 && max / min < 2) return "high";
  return "med";
}

function point(sales: Sale[], gradeLabel: TierLabel | "any", window: Window): PricePoint | null {
  if (sales.length === 0) return null;
  const prices = sales.map((s) => s.priceUsd);
  const min = Math.min(...prices), max = Math.max(...prices);
  const first = sales[0]!;
  return {
    productId: first.productId, gradeValue: first.gradeValue, gradeLabel, window,
    nSales: sales.length, medianUsd: median(prices), minUsd: min, maxUsd: max,
    lastSoldAt: new Date(Math.max(...sales.map((s) => s.soldAt.getTime()))),
    confidence: confidence(sales.length, min, max),
  };
}

export function computePricePoints(sales: Sale[], now: Date): PricePoint[] {
  const groups = new Map<string, Sale[]>();
  for (const s of sales) {
    const k = `${s.productId}|${s.gradeValue}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const out: PricePoint[] = [];
  for (const group of groups.values()) {
    for (const window of Object.keys(WINDOW_DAYS) as Window[]) {
      const days = WINDOW_DAYS[window];
      const inWin = days == null ? group : group.filter((s) => now.getTime() - s.soldAt.getTime() <= days * 86400000);
      const any = point(inWin, "any", window);
      if (any) out.push(any);
      if (group[0]!.gradeValue === 10) {
        for (const tier of TIERS) {
          const p = point(inWin.filter((s) => s.gradeLabel === tier), tier, window);
          if (p) out.push(p);
        }
      }
    }
  }
  return out;
}
