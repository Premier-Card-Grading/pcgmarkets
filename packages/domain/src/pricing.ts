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

/** Below this a graded slab "sale" is not a market price: penny-start auctions, retracted or reused listings. */
export const PRICE_FLOOR_USD = 5;
/** A sale under this share of the same card and grade's other sales is an outlier. */
export const OUTLIER_SHARE = 0.25;
export type PriceFlag = "price_below_floor" | "price_outlier";
export interface PricedSale { id: string; productId: string; gradeValue: number; priceUsd: number }

/**
 * Sales to keep out of prices (they go to the review queue, nothing is deleted): any sale under $5, and any sale under
 * 25% of the median of the same card and grade's other sales when there are at least 2 of them (themselves above $5).
 */
export function implausibleSales(sales: PricedSale[]): Map<string, PriceFlag> {
  const out = new Map<string, PriceFlag>();
  const groups = new Map<string, PricedSale[]>();
  for (const s of sales) {
    if (s.priceUsd < PRICE_FLOOR_USD) { out.set(s.id, "price_below_floor"); continue; }
    const k = `${s.productId}|${s.gradeValue}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  for (const g of groups.values()) {
    for (const s of g) {
      const others = g.filter((o) => o !== s).map((o) => o.priceUsd);
      if (others.length >= 2 && s.priceUsd < OUTLIER_SHARE * median(others)) out.set(s.id, "price_outlier");
    }
  }
  return out;
}

