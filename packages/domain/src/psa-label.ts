import type { Language } from "./types";
import type { CatalogIndex, ProductRef, SetRef } from "./catalog-index";

/**
 * Identifying a sold PSA slab from what PSA printed on its label, without a PSA cert lookup.
 *
 * A PSA label reads e.g. "2025 POKEMON DRI EN / ROCKET'S MOLTRES ex / SPECIAL ILLUSTRATION RARE   #229 GEM MT 10 <cert>".
 * A card is matched only when the label's language, number and card name agree with exactly one catalogue card, its set
 * is confirmed (set code or name on the label, or the number printed on the card in the photo), and every other label
 * line is a rarity or the set's own name. Anything else on the label (a store stamp, a collection box, 1st Edition,
 * reverse holo, a Master Ball pattern) is another printing, which the catalogue does not list, so the sale is not used.
 * Never matched from the seller's title.
 */

/** What was read off the photo: by OCR or by a person or agent transcribing it. */
export interface PsaReading {
  /** The label's left column, top to bottom: year + set, card name, then any variety/rarity lines. */
  labelLeft: string[];
  /** The label's "#" number, e.g. "#229", "#TG03", "#SWSH066". */
  labelNumber: string;
  finalGrade: number | null;
  cert: string | null;
  /** The number printed on the card itself, when the photo shows it, e.g. "229/182". */
  cardNumber: string | null;
}

export type PsaMatchStatus =
  | "matched"
  | "no_card"                    // nothing in the catalogue agrees (or the set could not be confirmed)
  | "ambiguous"                  // several catalogue cards agree
  | "variant_not_in_catalogue"   // the label names another printing (stamp, 1st Edition, reverse holo, ...)
  | "language_not_in_catalogue"  // Chinese, Korean, Thai, Indonesian
  | "unreadable";                // label lines or number missing

export interface PsaMatch {
  status: PsaMatchStatus;
  productId?: string;
  /** How the set was confirmed: "code" / "name" on the label, "photo#" from the card's printed number. */
  evidence?: ("code" | "name" | "photo#")[];
  candidates?: string[];
}

/** Uppercase letters and digits only, accents dropped: "Pokémon Card 151" -> "POKEMONCARD151". */
export const compactText = (t: string | null | undefined) =>
  (t ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** "#TG03" -> {prefix "TG", num 3, suffix ""}; "229" -> {prefix "", num 229}. */
export function psaNumberKey(t: string | null | undefined): { prefix: string; num: number; suffix: string } | null {
  const m = /^([A-Z]*?)0*(\d+)([A-Z]?)$/.exec((t ?? "").toUpperCase().replace(/[#\s-]/g, ""));
  return m ? { prefix: m[1]!, num: Number(m[2]), suffix: m[3]! } : null;
}
const sameKey = (a: ReturnType<typeof psaNumberKey>, b: ReturnType<typeof psaNumberKey>) =>
  !!a && !!b && a.prefix === b.prefix && a.num === b.num && a.suffix === b.suffix;

/** A label line that names another printing than the catalogue card. */
const VARIANT = /REV\.? ?FOIL|REVERSE|1ST ED|SHADOWLESS|PRERELEASE|STAMP|ERROR|STAFF|1999-2000|W\/ |DEMO|SAMPLE|COSMOS|CRACKED ICE|GALAXY|MASTER ?BALL|POKE ?BALL|MIRROR/i;
/** Prefixes and suffixes PSA adds around a card name: "FA/PIKACHU", "DRAGONITE-HOLO", "CELEBI - HOLO". */
const NAME_DECOR = /^(F\.?A\.?\/|FULL ART\/)|[\s-]+HOLO$/i;
const RARITY = ["SPECIAL ILLUSTRATION RARE", "ILLUSTRATION RARE", "SPECIAL ART RARE", "ART RARE", "SUPER RARE", "ULTRA RARE", "HYPER RARE", "DOUBLE RARE",
  "SHINY RARE", "SECRET RARE", "RAINBOW RARE", "BLACK WHITE RARE", "BW RARE", "MEGA ATTACK RARE", "MEGA HYPER RARE", "MEGA ULTRA RARE", "RARE", "SECRET", "FULL ART", "GOLD", "HOLO", "PROMO",
  "SSR", "SAR", "CSR", "CHR", "SR", "UR", "AR", "HR", "RRR", "RR", "FA", "SHINY", "RADIANT", "BLACK STAR"];
const SERIES = ["SUN & MOON", "S & M", "SWORD & SHIELD", "SWSH", "SCARLET & VIOLET", "XY", "BLACK & WHITE", "D & P", "HG & SS", "POKEMON", "P.M.", "JPN", "JAPANESE"];
const ROMAN: Record<string, string> = { II: "2", III: "3", IV: "4" };
const SUBSET_SUFFIX = /\s*(Trainer Gallery|Shiny Vault|Galarian Gallery)$/i;

const nameKeys = (p: ProductRef) => new Set([compactText(p.nameEn), compactText((p.nameEn ?? "").replace(/^Team /, ""))].filter(Boolean));
const lineName = (l: string) => compactText(l.trim().replace(NAME_DECOR, ""));
const isPromo = (p: ProductRef) => p.numberSuffix != null || !(p.numberPrinted ?? "").includes("/");

export function psaLanguage(text: string): Language | null {
  const u = ` ${text.toUpperCase().replace(/[^A-Z0-9]/g, " ")} `;
  if (/ CS[M0-9]?[0-9A-Z]* /.test(u) || / (KOR|KOREAN|CHN|CHINESE|CHINA|TCHN|SCHN|THAI|INDONESIAN|IND) /.test(u)) return null;
  return / (JPN|JAPANESE|JP|JAP) /.test(u) ? "ja" : "en";
}

function setEvidence(s: SetRef, lines: string[], cardNumber: string | null, p: ProductRef): ("code" | "name" | "photo#")[] {
  const text = lines.join(" ");
  const tokens = new Set(text.toUpperCase().match(/[A-Z0-9]+/g) ?? []);
  const ctext = compactText(text).replace(/BSP/g, "BLACKSTAR");
  const ev: ("code" | "name" | "photo#")[] = [];
  if ([s.printedCode, ...s.aliases].some((c) => c && c.length >= 2 && tokens.has(c.toUpperCase()))) ev.push("code");
  const base = compactText((s.nameEn ?? "").replace(SUBSET_SUFFIX, "").replace(/\s*Promos$/i, ""));
  if (base.length >= 5 && ctext.includes(base)) ev.push("name");
  if (cardNumber && p.numberPrinted && compactText(cardNumber) === compactText(p.numberPrinted)) ev.push("photo#");
  return ev;
}

/** A label line beyond the year/set line is the card name, a rarity, or the set's own name; anything else marks another printing. */
function plainLine(l: string, s: SetRef, p: ProductRef): boolean {
  if (nameKeys(p).has(lineName(l))) return true;
  // OCR can clip a line's first letters ("LLUSTRATION RARE"); the tail of a rarity is still only a rarity.
  const whole = compactText(l);
  if (whole.length >= 8 && RARITY.some((w) => compactText(w).endsWith(whole))) return true;
  const spaced = ` ${l.toUpperCase().replace(/[^A-Z0-9& ]/g, " ")} `.replace(/ (II|III|IV) /g, (_, r: string) => ` ${ROMAN[r]} `);
  let c = compactText(spaced);
  const names = [s.nameEn, (s.nameEn ?? "").replace(SUBSET_SUFFIX, ""), (s.nameEn ?? "").replace(/^Base Set/i, "Base"), s.printedCode, ...s.aliases]
    .map(compactText).filter((n) => n.length >= 2).sort((a, b) => b.length - a.length);
  for (const n of names) c = c.split(n).join("");
  for (const w of [...RARITY, ...SERIES].map(compactText).sort((a, b) => b.length - a.length)) c = c.split(w).join("");
  return c === "";
}

function candidatesFor(catalog: CatalogIndex, lang: Language, label: string): ProductRef[] {
  const key = psaNumberKey(label);
  if (!key) return [];
  if (key.prefix) {
    const raw = label.replace(/[#\s]/g, "");
    const padded = [0, 2, 3].map((w) => `${key.prefix}${String(key.num).padStart(w, "0")}${key.suffix}`);
    const seen = new Map<string, ProductRef>();
    for (const t of [raw, ...padded]) for (const p of catalog.productsByPrinted(lang, t)) seen.set(p.id, p);
    return [...seen.values()];
  }
  return catalog.productsByLanguageAndNumber(lang, key.num).filter((p) => sameKey(psaNumberKey((p.numberPrinted ?? "").split("/")[0]), key));
}

export function matchPsaLabel(r: PsaReading, catalog: CatalogIndex): PsaMatch {
  const lines = r.labelLeft.map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2 || !r.labelNumber) return { status: "unreadable" };
  const lang = psaLanguage(lines.join(" "));
  if (!lang) return { status: "language_not_in_catalogue" };
  const year = /^(\d{4})/.exec(lines[0]!)?.[1];
  const names = new Set(lines.slice(1).map(lineName));
  const found: { p: ProductRef; ev: ("code" | "name" | "photo#")[] }[] = [];
  let variant = false;
  for (const p of candidatesFor(catalog, lang, r.labelNumber)) {
    const s = catalog.set(p.setId);
    if (!s || ![...nameKeys(p)].some((k) => names.has(k))) continue;
    // Promo sets run for years, so only a numbered set's release year has to be close to the label's year.
    if (year && !isPromo(p) && s.releaseDate && Math.abs(Number(s.releaseDate.slice(0, 4)) - Number(year)) > 1) continue;
    if (lines.some((l) => VARIANT.test(l) && !nameKeys(p).has(lineName(l)))) { variant = true; continue; }
    const ev = setEvidence(s, lines, r.cardNumber, p);
    if (!ev.length) continue;
    if (!isPromo(p) && lines.slice(1).some((l) => !plainLine(l, s, p))) { variant = true; continue; }
    found.push({ p, ev });
  }
  if (found.length === 1) return { status: "matched", productId: found[0]!.p.id, evidence: found[0]!.ev };
  if (found.length > 1) return { status: "ambiguous", candidates: found.map((f) => f.p.id) };
  return { status: variant ? "variant_not_in_catalogue" : "no_card" };
}
