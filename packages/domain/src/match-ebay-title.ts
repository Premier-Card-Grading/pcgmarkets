import type { MatchResult, ReviewReason } from "./types";
import type { CatalogIndex, ProductRef } from "./catalog-index";
import { detectLanguage, findCardNumber, findSetCode, isLot, hasPcgSetCodeNoise, hasPcgsNoise } from "./jp-extract";
import { parseGradeFromText, parseTierLabel, stripGradeToken } from "./grade";

// Grey-market other-grader notation (e.g. "Csv9.5C") always routes to review — this is never
// a PCG-graded card, regardless of whether a PCG-looking grade token also appears in the title.
const CSV_GRADER_NOISE_RE = /\bcsv\s?\d/i;
// A *named* other grader (CGC/PSA/BGS/SGC/TAG) is only ambiguous when there's no clear,
// standalone PCG grade token elsewhere in the title (e.g. a passing "(not PSA)" mention next
// to a real "PCG 10" is fine; a bare "PSA 10 ..." with no PCG grade at all is not).
const OTHER_GRADER_RE = /\bcgc\b|\bpsa\b|\bbgs\b|\bsgc\b|\btag\b/i;
// "PCG" used as a promo/campaign or artist-collab name, not the grader (e.g. "Yu Nagaba x PCG
// Campaign").
const PCG_PROMO_NAME_RE = /x\s?pcg|pcg\s?campaign|nagaba/i;

const review = (reviewReason: ReviewReason, extracted: Record<string, unknown>): MatchResult => ({
  state: "needs_review", productId: null, gradeValue: null, gradeLabel: null, certId: null,
  matchMethod: null, reviewReason, extracted,
});

/**
 * Matches a SoldComps (eBay sold, title-only) listing. These rows carry no structured
 * grader/grade/set metadata — only an English/JA-code title — so this path parses the title
 * directly. Structurally close to matchJp, with two differences: (a) noise filters run first
 * to catch Chinese grey-market other-grader listings and "PCG"-as-promo-name false positives,
 * and (b) an English set-NAME resolution fallback (never a card-NAME match — the final product
 * must still resolve via set+number).
 */
export function matchEbayTitle(input: { title: string }, catalog: CatalogIndex): MatchResult {
  const { title } = input;
  const language = detectLanguage(title);
  const grade = parseGradeFromText(title);
  const cardNumber = findCardNumber(title);
  // Strip the grade token before searching for a set code, same reasoning as matchJp: a glued
  // modern grade like "PCG10" would otherwise be mistaken for a 2004-06 era set code.
  const titleNoGrade = stripGradeToken(title);
  const setCode = findSetCode(titleNoGrade, catalog.setCodes(language));

  const extracted: Record<string, unknown> = {
    language, setCode, cardNumber: cardNumber?.printed ?? null,
    grade: grade?.value ?? null, tierHint: grade?.tierHint ?? null,
  };

  // Step 1: noise filters — route to review, never matched.
  if (CSV_GRADER_NOISE_RE.test(title) || (OTHER_GRADER_RE.test(title) && !grade)) {
    return review("ambiguous_grader", extracted);
  }
  if (PCG_PROMO_NAME_RE.test(title)) {
    return review("ambiguous_grader", extracted);
  }

  // Step 2: grade.
  if (!grade) {
    if (hasPcgSetCodeNoise(title)) return review("possible_pcg_set_code", extracted);
    if (hasPcgsNoise(title)) return review("possible_pcgs", extracted);
    return review("no_grade", extracted);
  }

  // Step 3: lot.
  if (isLot(title)) return review("lot", extracted);

  // Step 4: card number.
  if (!cardNumber) return review("no_card_number", extracted);

  const gradeLabel = grade.value === 10 ? parseTierLabel(title) : null;
  const done = (p: ProductRef): MatchResult => ({
    state: "matched", productId: p.id, gradeValue: grade.value, gradeLabel, certId: null,
    matchMethod: "ebay_title", reviewReason: null, extracted,
  });

  // Tracks whether any step below found more than one candidate — the final fallback reason
  // is "ambiguous_set" rather than "no_set_code" when that happened, even if a later step
  // (English set name) goes on to resolve the card.
  let ambiguous = false;

  // Step 6a: explicit set code.
  if (setCode) {
    const sets = catalog.setsByCode(setCode, language);
    const ps = sets.flatMap((s) => catalog.productsBySetAndNumber(s.id, cardNumber.num));
    if (ps.length === 1) return done(ps[0]!);
    if (ps.length > 1) return review("ambiguous_set", extracted);
  }

  // Step 6b: promo suffix.
  if (cardNumber.suffix) {
    const ps = catalog.productsBySuffixAndNumber(cardNumber.suffix, cardNumber.num, language);
    if (ps.length === 1) return done(ps[0]!);
    if (ps.length > 1) return review("ambiguous_set", extracted);
  }

  // Step 6c: number + denominator (denominator = set card count). A denominator shared by
  // multiple sets doesn't fail closed immediately — it falls through to 6d, since the English
  // set name in the title may still disambiguate which of those sets it is.
  if (cardNumber.denom != null) {
    const sets = catalog.setsByCardCount(cardNumber.denom, language);
    const ps = sets.flatMap((s) => catalog.productsBySetAndNumber(s.id, cardNumber.num));
    if (ps.length === 1) return done(ps[0]!);
    if (ps.length > 1) ambiguous = true;
  }

  // Step 6d: English set NAME fallback — resolves the SET only; the product must still
  // resolve via set+number, never by card name.
  const nameSets = catalog.findSetsInText(titleNoGrade);
  if (nameSets.length === 1) {
    const ps = catalog.productsBySetAndNumber(nameSets[0]!.id, cardNumber.num);
    if (ps.length === 1) return done(ps[0]!);
    if (ps.length > 1) ambiguous = true;
  } else if (nameSets.length > 1) {
    ambiguous = true;
  }

  return review(ambiguous ? "ambiguous_set" : "no_set_code", extracted);
}
