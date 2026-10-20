export type PcReviewReason = "no_card_number" | "variant" | "no_match" | "ambiguous";
export interface LinkCandidate { id: string; numberNum: number | null; numberPrinted: string }
export type LinkResult = { state: "linked"; productId: string } | { state: "needs_review"; reason: PcReviewReason };

export function extractPcNumber(productName: string): string | null {
  const ms = [...productName.matchAll(/#\s*([A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)/g)];
  return ms.length ? ms[ms.length - 1]![1]!.toUpperCase() : null;
}

/** PriceCharting lists variants ("[1st Edition]", "[Reverse Holo]") as separate products; our catalog does not. */
export const isPcVariant = (productName: string) => /\[[^\]]+\]/.test(productName);

const printedHead = (printed: string) => printed.split("/")[0]!.replace(/[\s-]/g, "").toUpperCase();

export function linkPcProduct(row: { productName: string; cardNumber: string | null }, candidates: LinkCandidate[]): LinkResult {
  const review = (reason: PcReviewReason): LinkResult => ({ state: "needs_review", reason });
  if (!row.cardNumber) return review("no_card_number");
  if (isPcVariant(row.productName)) return review("variant");
  const n = row.cardNumber;
  const hits = /^\d+$/.test(n)
    ? candidates.filter((c) => c.numberNum === parseInt(n, 10))
    : candidates.filter((c) => printedHead(c.numberPrinted) === n.replace(/[\s-]/g, ""));
  if (hits.length === 1) return { state: "linked", productId: hits[0]!.id };
  return review(hits.length === 0 ? "no_match" : "ambiguous");
}
