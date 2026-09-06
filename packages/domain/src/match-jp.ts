import type { MatchResult, ReviewReason } from "./types";
import type { CatalogIndex, ProductRef } from "./catalog-index";
import { detectLanguage, findCardNumber, findSetCode, isLot, hasPcgSetCodeNoise, hasPcgsNoise } from "./jp-extract";
import { parseGradeFromText, parseTierLabel } from "./grade";

const review = (reviewReason: ReviewReason, extracted: Record<string, unknown>): MatchResult => ({
  state: "needs_review", productId: null, gradeValue: null, gradeLabel: null, certId: null,
  matchMethod: null, reviewReason, extracted,
});

export function matchJp(input: { title: string; description: string | null }, catalog: CatalogIndex): MatchResult {
  const text = input.description ? `${input.title}\n${input.description}` : input.title;
  const language = detectLanguage(text);
  const grade = parseGradeFromText(input.title) ?? parseGradeFromText(text);
  const cardNumber = findCardNumber(input.title) ?? findCardNumber(text);
  const setCode = findSetCode(input.title, catalog.setCodes(language)) ?? findSetCode(text, catalog.setCodes(language));

  const extracted: Record<string, unknown> = {
    language, setCode, cardNumber: cardNumber?.printed ?? null,
    grade: grade?.value ?? null, tierHint: grade?.tierHint ?? null,
  };

  if (!grade) {
    if (hasPcgSetCodeNoise(text)) return review("possible_pcg_set_code", extracted);
    if (hasPcgsNoise(text)) return review("possible_pcgs", extracted);
    return review("no_grade", extracted);
  }
  if (isLot(text)) return review("lot", extracted);
  if (!cardNumber) return review("no_card_number", extracted);

  const gradeLabel = grade.value === 10 ? parseTierLabel(text) : null;
  const done = (p: ProductRef, matchMethod: "jp_set_code" | "jp_number_denom"): MatchResult => ({
    state: "matched", productId: p.id, gradeValue: grade.value, gradeLabel, certId: null,
    matchMethod, reviewReason: null, extracted,
  });

  // Path 1: promo suffix or explicit set code
  if (cardNumber.suffix) {
    const ps = catalog.productsBySuffixAndNumber(cardNumber.suffix, cardNumber.num, language);
    if (ps.length === 1) return done(ps[0]!, "jp_set_code");
    return review(ps.length === 0 ? "no_set_code" : "ambiguous_set", extracted);
  }
  if (setCode) {
    const sets = catalog.setsByCode(setCode, language);
    const ps = sets.flatMap((s) => catalog.productsBySetAndNumber(s.id, cardNumber.num));
    if (ps.length === 1) return done(ps[0]!, "jp_set_code");
    return review(ps.length === 0 ? "no_card_number" : "ambiguous_set", extracted);
  }

  // Path 2: number + denominator (denominator = set card count)
  if (cardNumber.denom != null) {
    const sets = catalog.setsByCardCount(cardNumber.denom, language);
    const ps = sets.flatMap((s) => catalog.productsBySetAndNumber(s.id, cardNumber.num));
    if (ps.length === 1) return done(ps[0]!, "jp_number_denom");
    if (ps.length > 1) return review("ambiguous_set", extracted);
  }
  return review("no_set_code", extracted);
}
