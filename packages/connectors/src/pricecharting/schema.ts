import type { PcGradeKey } from "@pcg/domain";

/** Everything vendor-specific about PriceCharting lives here (docs: pricecharting.com/api-documentation). */
export const PRICECHARTING = {
  // Legendary-plan CSV download. CONFIRM on the first real download from Subscriptions → "API/Download" and
  // update here; PRICECHARTING_CSV_URL (full URL, token included) overrides it without a code change.
  csvUrl: (token: string) => `https://www.pricecharting.com/price-guide/download-custom?t=${encodeURIComponent(token)}&category=pokemon-cards`,
  required: ["id", "console-name", "product-name", "manual-only-price", "sales-volume"],
  // PCG-equivalent grade → CSV column. Only manual-only-price is PSA-specific; the rest are "graded N by a grading company".
  gradeColumns: {
    "10": "manual-only-price", "9.5": "box-only-price", "9": "graded-price", "8": "new-price", "7": "cib-price",
    "6": "condition-16-price", "5": "condition-15-price", "4": "condition-14-price", "3": "condition-13-price",
    "2": "condition-10-price", "1": "condition-9-price",
  } as Record<PcGradeKey, string>,
  minRowRatio: 0.8,
};
