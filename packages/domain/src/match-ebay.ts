import type { CertRecord, EbayMetadata, Language, MatchResult, ReviewReason, TierLabel } from "./types";
import type { CatalogIndex, SetRef } from "./catalog-index";
import { parseCardNumber } from "./card-number";
import { normalizeGradeValue, parseTierLabel } from "./grade";

export const PCG_GRADER = "Premier Card Grading (PCG)";
const NAMED_OTHER_GRADERS = /^(psa|bgs|beckett|cgc|sgc|tag|ace|ags|hga|gma|ksa|mnt|arS|bvg|csg|rcg|isa)\b/i;

const review = (reviewReason: ReviewReason, extracted: Record<string, unknown>, state: "needs_review" | "rejected" = "needs_review"): MatchResult => ({
  state, productId: null, gradeValue: null, gradeLabel: null, certId: null, matchMethod: null, reviewReason, extracted,
});

function langFromAspect(s: string | undefined): Language | null {
  if (!s) return null;
  if (/japanese|日本/i.test(s)) return "ja";
  if (/english/i.test(s)) return "en";
  return null;
}

function resolveSet(catalog: CatalogIndex, setName: string, language: Language | null): SetRef[] {
  let sets = catalog.setsByNameOrAlias(setName);
  if (sets.length === 0) for (const lang of ["ja", "en"] as const) sets = sets.concat(catalog.setsByCode(setName, lang));
  if (sets.length > 1 && language) sets = sets.filter((s) => s.language === language);
  return sets;
}

export function matchEbay(
  input: { title: string; metadata: EbayMetadata; cert: CertRecord | null },
  catalog: CatalogIndex,
): MatchResult {
  const md = input.metadata;
  const tierHint = /\b10\+/.test(input.title) ? "10+" : null;
  const extracted: Record<string, unknown> = { ...md, tierHint, certRaw: md.certNumber ?? null };

  if (Object.keys(md).length === 0) return review("no_metadata", extracted);

  const grader = md.grader?.trim() ?? "";
  if (grader !== PCG_GRADER) {
    if (grader && NAMED_OTHER_GRADERS.test(grader)) return review("grader_not_pcg", extracted, "rejected");
    return review("grader_missing", extracted);
  }

  // Cert path
  if (input.cert) {
    const c = input.cert;
    const lang = langFromAspect(c.language);
    const sets = resolveSet(catalog, c.setName, lang);
    const num = parseCardNumber(c.cardNumber);
    if (sets.length === 1 && num) {
      const ps = catalog.productsBySetAndNumber(sets[0]!.id, num.num);
      if (ps.length === 1) {
        const gradeValue = c.finalGrade;
        const label = gradeValue === 10 ? (parseTierLabel(c.grade) as TierLabel | null) : null;
        return { state: "matched", productId: ps[0]!.id, gradeValue, gradeLabel: gradeValue == null ? "Authentic" : label, certId: c.gradedId, matchMethod: "cert", reviewReason: null, extracted: { ...extracted, cert: c } };
      }
    }
    return review("ambiguous_set", { ...extracted, cert: c });
  }

  const g = normalizeGradeValue(md.grade);
  if (g === null) return review("no_grade", extracted);
  if (!md.set) return review("ambiguous_set", extracted);
  if (!md.cardNumber) return review("no_card_number", extracted);

  const sets = resolveSet(catalog, md.set, langFromAspect(md.language));
  if (sets.length !== 1) return review("ambiguous_set", extracted);
  const num = parseCardNumber(md.cardNumber);
  if (!num) return review("no_card_number", extracted);
  const ps = catalog.productsBySetAndNumber(sets[0]!.id, num.num);
  if (ps.length !== 1) return review(ps.length === 0 ? "no_card_number" : "ambiguous_set", extracted);

  const gradeValue = g === "authentic" ? null : g;
  const gradeLabel = g === "authentic" ? "Authentic" : gradeValue === 10 ? parseTierLabel(input.title) : null;
  return { state: "matched", productId: ps[0]!.id, gradeValue, gradeLabel, certId: null, matchMethod: "ebay_metadata", reviewReason: null, extracted };
}
