import type { Language, MatchResult, ReviewReason, TierLabel } from "./types";
import type { CatalogIndex, ProductRef } from "./catalog-index";
import { parseTierLabel } from "./grade";

/**
 * Identifying a sold slab from what PCG printed, never from the seller's title.
 *
 * The listing photo's slab label (read by OCR) gives PCG's own card name, set, rarity and grades.
 * PCG's public cert API is then searched for certs that agree with all of them, and the cert's set,
 * number, name and language pick the product in our catalogue.
 */

export interface SlabLabel { name: string; set: string; rarity: string | null; grades: number[]; gradeWord?: string | null }
export type LabelRead =
  | { kind: "premier"; label: SlabLabel }
  /** Older Premier labels print the cert number on the front. */
  | { kind: "premier_old"; numbers: string[]; lines: string[] }
  /** The unrelated Chinese grader also called "PCG": "PROFESSIONAL CARD GRADING", "2024 POKEMON CHN.". */
  | { kind: "chinese_pcg" }
  | { kind: "no_label" };

/** One cert from PCG's public API, reduced to what identification needs. */
export interface PcgCert {
  id: string; name: string; set: string; num: string | null; lang: string | null; rarity: string | null;
  fin: number | null; c: number | null; co: number | null; e: number | null; s: number | null;
  grade: string | null; done: string | null;
}

export type SlabStatus =
  | "cert"                       // exactly one cert agrees
  | "card_certain_cert_shared"   // several certs agree, all the same card
  | "card_ambiguous"             // certs agree on name/set/grades but are different cards
  | "card_number_conflict"       // the number printed on the card disagrees with every cert
  | "grades_unreadable_or_mismatch"
  | "label_not_in_pcg"           // a Premier label, but no cert with that card and set
  | "old_label_cert_not_in_pcg"
  | "chinese_pcg"
  | "no_label"
  | "no_photo"
  | "pcg_lookup_failed";

/** What the slab step stores on the listing (metadata.pcg) for the matcher. */
export interface SlabFinding {
  status: SlabStatus;
  /** The agreeing cert(s): one for "cert", all of them for "card_certain_cert_shared". */
  certs: PcgCert[];
  label?: SlabLabel;
  /** Who read the label: the OCR, or a person or agent transcribing the photo (vision). */
  read?: "ocr" | "vision";
}

const GRADE_TOKEN = /^(10|[1-9](\.5)?)\*?$/;
const RARITY = "(?:Holo|Non-Holo|Reverse|Full Art|Alternate|Altemate|Altamate|Altemnate|Art|Promo|Rare|Common|Uncommon|Secret|Special|Ultra|Illustration|Stamped|Shiny|Gold|Rainbow|Prism|Radiant|Amazing|1st)";
const SET_LINE = new RegExp(`^([^|]{3,}?)\\s*(?:\\|\\s*([^|]{3,})|\\sI\\s+(${RARITY}[^|]*))$`, "i");

/** PCG's grade words, as printed beside the grade. */
const GRADE_WORDS = ["Pristine", "Gem Mint", "Mint+", "Mint", "NM-Mint+", "NM-Mint", "Near Mint+", "Near Mint", "Excellent-Mint+", "Excellent-Mint", "Excellent+", "Excellent", "VG-EX+", "VG-EX", "Very Good", "Good", "Fair", "Poor", "Authentic"];
/** Like similarity, but "+" counts: "Mint+" is not "Mint". */
const gradeKey = (s: string) => s.toLowerCase().replace(/[^a-z+]+/g, "");
const gradeSim = (a: string, b: string) => { const x = gradeKey(a), y = gradeKey(b); return 1 - lev(x, y) / Math.max(x.length, y.length, 1); };
/** The first label line that reads as a grade word (OCR slips allowed: "Gemn Miud", "Mlint"). */
function gradeWordIn(lines: string[]): string | null {
  for (const l of lines) {
    if (l.length < 4 || l.length > 18 || /\d/.test(l)) continue;
    const scored = GRADE_WORDS.map((w) => ({ w, s: gradeSim(w, l) })).sort((a, b) => b.s - a.s);
    if (scored[0]!.s >= 0.6 && scored[0]!.s > scored[1]!.s) return scored[0]!.w;
  }
  return null;
}

/** `lines` are the OCR's text lines, top to bottom. */
export function readSlabLabel(lines: string[]): LabelRead {
  const text = lines.join(" | ");
  if (/PRO?FESS?IONAL\s*CARD\s*GRAD/i.test(text) || /\b20\d\d\s+PO[KN]EMON\s+(CHN|JPN)\b/i.test(text)) return { kind: "chinese_pcg" };
  // Premier's label: card name, then "Set | Rarity", then subgrades and the grade. OCR reads the
  // bar as "|" with or without spaces, or as a capital "I" before the rarity.
  const si = lines.findIndex((l) => SET_LINE.test(l.trim()));
  if (si < 1) {
    // Older Premier label: "NAME / POKEMON / SET YEAR / NUMBER RARITY / GRADE / CERT", the cert on the front.
    const numbers = lines.slice(0, 12).map((l) => l.trim()).filter((l) => /^\d{4,9}$/.test(l));
    if (numbers.length && lines.slice(0, 6).some((l) => /^POK[EÉ]MON$/i.test(l.trim()))) return { kind: "premier_old", numbers, lines };
    if (/^\W*P[CO]G\b/.test(text) && numbers.length) return { kind: "premier_old", numbers, lines };
    return { kind: "no_label" };
  }
  const [, set, barRarity, iRarity] = SET_LINE.exec(lines[si]!.trim())!.map((s) => s?.trim());
  const rarity = barRarity ?? iRarity;
  let ni = si - 1;
  while (ni >= 0 && /^\W?[DP]?PCG$/.test(lines[ni]!.trim())) ni--;
  if (ni < 0) return { kind: "no_label" };
  const after = lines.slice(si + 1, si + 16).map((l) => l.trim());
  const grades = after.filter((l) => GRADE_TOKEN.test(l)).map((l) => Number(l.replace("*", "")));
  return { kind: "premier", label: { name: lines[ni]!.trim(), set: set!, rarity: rarity || null, grades, gradeWord: gradeWordIn(after) } };
}

export const normText = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/δ/g, " delta ").replace(/[^a-z0-9]+/g, " ").trim();

function lev(a: string, b: string) {
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}
/** 0..1 similarity, tolerant of OCR slips ("Phantaomal Flamos" ~ "Phantasmal Flames"). */
export function similarity(a: string | null | undefined, b: string | null | undefined) {
  const x = normText(a), y = normText(b);
  return 1 - lev(x, y) / Math.max(x.length, y.length, 1);
}

/** Does the cert plausibly belong to this label (before grades are checked)? */
export const certFitsLabel = (c: PcgCert, l: SlabLabel) => similarity(c.name, l.name) >= 0.75 && similarity(c.set, l.set) >= 0.75;

function within(pool: number[], need: number[]) {
  const p = [...pool];
  for (const v of need) { const i = p.indexOf(v); if (i < 0) return false; p.splice(i, 1); }
  return true;
}
const plainNumber = (n: string) => n.replace(/0*(\d+)\/0*(\d+)/, "$1/$2");

/**
 * Picks the cert(s) a label belongs to. OCR drops digits but does not invent them, so every grade
 * it read must be one of the cert's five (final + four subgrades), and it must have read two or
 * more. `ocrText` is the whole photo's OCR, used to read the number printed on the card itself.
 */
export function pickCert(label: SlabLabel, candidates: PcgCert[], ocrText: string, soldAt: Date): { status: SlabStatus; certs: PcgCert[] } {
  const printed = [...ocrText.matchAll(/(?<![\d/])0*(\d{1,3})\s?\/\s?0*(\d{2,3})(?![\d/])/g)].map((m) => `${m[1]}/${m[2]}`);
  // Some labels print only the series ("MEGA") for "MEGA: Ascended Heroes": that is only enough
  // when the number printed on the card is the cert's too.
  const seriesOnly = (c: PcgCert) => c.set.includes(":") && normText(c.set.split(":")[0]) === normText(label.set)
    && similarity(c.name, label.name) >= 0.75 && c.num != null && printed.includes(plainNumber(c.num));
  const fitting = candidates.filter((c) => (certFitsLabel(c, label) || seriesOnly(c)) && (!c.done || new Date(c.done) <= soldAt));
  if (!fitting.length) return { status: "label_not_in_pcg", certs: [] };
  let ids = label.grades.length >= 2 ? fitting.filter((c) => within([c.fin, c.c, c.co, c.e, c.s].filter((v): v is number => v != null), label.grades)) : [];
  // PCG's grade word on the label must be the cert's ("Gem Mint" and "Pristine" are both 10s).
  if (label.gradeWord) ids = ids.filter((c) => gradeKey(c.grade ?? "") === gradeKey(label.gradeWord!));
  if (!ids.length) return { status: "grades_unreadable_or_mismatch", certs: [] };
  const cardKey = (c: PcgCert) => `${normText(c.set)}|${c.num}|${c.lang}`;
  if (new Set(ids.map(cardKey)).size > 1 && label.rarity) {
    const r = ids.filter((c) => c.rarity && similarity(c.rarity, label.rarity) >= 0.8);
    if (r.length) ids = r;
  }
  if (printed.length) {
    const numbered = ids.filter((c) => /\d\/\d/.test(c.num ?? ""));
    if (numbered.length === ids.length && !ids.some((c) => printed.includes(plainNumber(c.num!)))) return { status: "card_number_conflict", certs: [] };
    const agree = ids.filter((c) => c.num && printed.includes(plainNumber(c.num)));
    if (agree.length) ids = agree;
  }
  if (ids.length === 1) return { status: "cert", certs: ids };
  return { status: new Set(ids.map(cardKey)).size === 1 ? "card_certain_cert_shared" : "card_ambiguous", certs: ids };
}

/** PCG's English black-star promo set names -> our promo set ids. */
const PCG_PROMO_SETS: Record<string, string> = {
  "wizards black star promos": "basep", "nintendo black star promos": "np", "dp black star promos": "dpp",
  "hgss black star promos": "hgssp", "bw black star promos": "bwp", "xy black star promos": "xyp",
  "s m black star promos": "smp", "sm black star promos": "smp", "s s black star promos": "swshp", "swsh black star promos": "swshp",
  "s v black star promos": "svp", "sv black star promos": "svp", "mega black star promos": "mep",
};
/**
 * PCG's names for the Japanese sets of 1996–2001, whose cards print no card number (PCG records the
 * Pokédex number, "No. 064") -> our set ids. Sets we don't hold (Carddass, Topsun) are left out.
 */
const PCG_JA_VINTAGE_SETS: Record<string, string> = {
  "base set expansion pack": "PMCG1", "pokemon jungle": "PMCG2", "mystery of the fossils": "PMCG3", "rocket gang": "PMCG4",
  "neo gold silver to a new world": "ja-neo1", "neo crossing the ruins": "ja-neo2", "neo awakening legends": "ja-neo3",
  "neo darkness and to light": "ja-neo4",
};
/**
 * Card names compared PCG's against ours: without a trailing bracketed note ("Mega Gardevoir ex (032)"),
 * apostrophes ("Roxies" / "Roxie's") or the delta-species mark ("Ludicolo δ"). The words must still be the same.
 */
const nameKeys = (s: string | null | undefined) => {
  const base = (s ?? "").replace(/\s*\([^)]*\)\s*$/, "").replace(/\s*δ/g, "");
  // "Kanazawa's Pikachu" is recorded as "Kanazawa Pikachu" and "Roxie's" as "Roxies": both spellings count.
  return [normText(base.replace(/['’]/g, "")), normText(base.replace(/['’]s\b/g, ""))];
};
const sameName = (a: string | null | undefined, b: string | null | undefined) => { const y = nameKeys(b); return nameKeys(a).some((k) => y.includes(k)); };
/** "S&V: Surging Sparks" -> "Surging Sparks". */
const setCore = (s: string) => s.replace(/^(S&V|S&S|S&M|XY|BW|MEGA|SV|SWSH|SM|HGSS|DP|Wizards|POP|EX)\s*:\s*/i, "").trim();

export type CertResolution =
  | { status: "matched"; product: ProductRef }
  | { status: "language_not_in_catalogue" | "edition_not_in_catalogue" | "unparsed_number" | "no_product_with_name_and_number" | "ambiguous_product" | "set_disagrees" };

/** A cert -> our product, by language + number + exact card name, with the set agreeing by total or name. */
export function resolveCert(c: PcgCert, catalog: CatalogIndex): CertResolution {
  const promo = PCG_PROMO_SETS[normText(c.set)] ?? null;
  const lang: Language | null = /japan/i.test(c.lang ?? "") ? "ja" : /english/i.test(c.lang ?? "") ? "en" : !c.lang && promo ? "en" : null;
  if (!lang) return { status: "language_not_in_catalogue" };
  // 1st Edition and Shadowless print runs sell far apart from Unlimited; our catalogue has one product for all.
  if (/1st\s*edition|shadowless/i.test(c.set)) return { status: "edition_not_in_catalogue" };
  const n = (c.num ?? "").trim();
  const named = (ps: ProductRef[]) => ps.filter((p) => sameName(p.nameEn, c.name));
  const uniq = (ps: ProductRef[]) => [...new Map(ps.map((p) => [p.id, p])).values()];
  const setName = (p: ProductRef) => catalog.set(p.setId)?.nameEn ?? null;
  // Japanese vintage: the cards print no number, so the one card of that name in PCG's set.
  const vintage = lang === "ja" && /^(No\.?\s*|#)\d+$/i.test(n) ? PCG_JA_VINTAGE_SETS[normText(c.set)] : undefined;
  if (vintage) {
    const ps = named(catalog.productsInSet(vintage));
    if (ps.length === 1) return { status: "matched", product: ps[0]! };
    return { status: ps.length ? "ambiguous_product" : "no_product_with_name_and_number" };
  }
  // Subset numbers carry a letter prefix: "SV119/SV122", "GG70/GG70", "H4/H32" (we print "SV119", "GG70", "H04").
  const sub = /^([A-Za-z]{1,3})0*(\d+)\s*\/\s*[A-Za-z]{1,3}\d+$/.exec(n);
  if (sub) {
    const [, pre, d] = sub as unknown as [string, string, string];
    const ps = uniq(named([d, d.padStart(2, "0"), d.padStart(3, "0")].flatMap((x) => catalog.productsByPrinted(lang, `${pre}${x}`))));
    if (ps.length !== 1) return { status: ps.length ? "ambiguous_product" : "no_product_with_name_and_number" };
    const ours = normText(setName(ps[0]!)), theirs = normText(setCore(c.set));
    return similarity(ours, theirs) >= 0.85 || (theirs.length >= 4 && ours.startsWith(theirs)) ? { status: "matched", product: ps[0]! } : { status: "set_disagrees" };
  }
  let num: number | null = null, denom: number | null = null, suffix: string | null = null, m: RegExpExecArray | null;
  if ((m = /^0*(\d+)\s*\/\s*0*(\d+)$/.exec(n))) { num = +m[1]!; denom = +m[2]!; }
  else if ((m = /^0*(\d+)\s*\/\s*([A-Za-z][\w-]*)$/.exec(n))) { num = +m[1]!; suffix = m[2]!; }
  else if ((m = /^([A-Za-z]+)-?0*(\d+)$/.exec(n))) { num = +m[2]!; suffix = m[1]!; }
  else if ((m = /^0*(\d+)$/.exec(n))) num = +m[1]!;
  if (num == null) return { status: "unparsed_number" };
  if (promo) {
    const ps = uniq(named([...catalog.productsByLanguageAndNumber(lang, num), ...catalog.productsByPrinted(lang, n)]).filter((p) => p.setId === promo));
    if (ps.length === 1) return { status: "matched", product: ps[0]! };
    return { status: ps.length ? "ambiguous_product" : "no_product_with_name_and_number" };
  }
  const pool = named(catalog.productsByLanguageAndNumber(lang, num));
  if (!pool.length) return { status: "no_product_with_name_and_number" };
  const sameKey = (a: string | null | undefined, b: string) => (a ?? "").toLowerCase().replace(/-/g, "") === b.toLowerCase().replace(/-/g, "");
  let hits = pool.filter((p) => (denom != null && p.numberDenom === denom) || (suffix != null && sameKey(p.numberSuffix, suffix)));
  if (!hits.length) hits = pool;
  if (hits.length > 1) {
    const best = hits.filter((p) => similarity(setName(p), setCore(c.set)) >= 0.85);
    if (best.length) hits = best;
  }
  if (hits.length !== 1) return { status: "ambiguous_product" };
  const p = hits[0]!;
  const setOk = (denom != null && p.numberDenom === denom) || (suffix != null && sameKey(p.numberSuffix, suffix)) || similarity(setName(p), setCore(c.set)) >= 0.85;
  return setOk ? { status: "matched", product: p } : { status: "set_disagrees" };
}

const review = (reviewReason: ReviewReason, extracted: Record<string, unknown>): MatchResult => ({
  state: "needs_review", productId: null, gradeValue: null, gradeLabel: null, certId: null, matchMethod: null, reviewReason, extracted,
});

/** Matches a SoldComps sale from its slab finding. Anything short of a certain card goes to review. */
export function matchSlab(finding: SlabFinding | undefined, catalog: CatalogIndex): MatchResult {
  const extracted: Record<string, unknown> = { pcg: finding ?? null };
  if (!finding) return review("no_cert", extracted);
  if (finding.status === "chinese_pcg") return { ...review("not_premier_pcg", extracted), state: "rejected" };
  if (finding.status !== "cert" && finding.status !== "card_certain_cert_shared") return review(finding.status === "label_not_in_pcg" || finding.status === "old_label_cert_not_in_pcg" ? "cert_not_found" : "no_cert", extracted);
  const r = resolveCert(finding.certs[0]!, catalog);
  if (r.status !== "matched") return review(r.status === "language_not_in_catalogue" ? "cert_language_not_in_catalogue" : "cert_card_not_in_catalogue", { ...extracted, resolution: r.status });
  // The grade is PCG's. With several agreeing certs it is known only if they all share it.
  const fins = new Set(finding.certs.map((c) => `${c.fin}|${c.grade}`));
  if (fins.size !== 1) return review("cert_grade_unknown", extracted);
  // Without the label's grade word, a 10's tier (Gem Mint / Pristine / Flawless) is not confirmed.
  if (finding.certs[0]!.fin === 10 && finding.label && !finding.label.gradeWord) return review("cert_grade_unknown", extracted);
  const c = finding.certs[0]!;
  const gradeLabel = c.fin === 10 ? (parseTierLabel(c.grade ?? "") as TierLabel | null) : null;
  return {
    state: "matched", productId: r.product.id, gradeValue: c.fin, gradeLabel, certId: finding.status === "cert" ? c.id : null,
    matchMethod: "cert", reviewReason: null, extracted,
  };
}
