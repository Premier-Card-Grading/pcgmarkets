import species from "./species-ja-en.json";
import { CARD_NAMES, ERA_PREFIXES, ORIGINAL_ERA_SERIES, RETIRED_NAMES } from "./card-names-ja-en";
import { normaliseJa, translateJaCardName } from "./translate";

/**
 * R15: one English name per Japanese card from Limitless's English page (l) and our curated
 * dictionary (d). A wrong English name is worse than none, so anything we cannot prove is null.
 */
export interface ResolveNameInput {
  nameJa: string | null;
  limitlessEn?: string | null;
  /** Limitless card type column, e.g. "N Mega Evolution", "G Basic", "Supporter". */
  type?: string | null;
  rarity?: string | null;
  /** sets.series, for era-dependent names. */
  series?: string | null;
  /** The name_en already stored. */
  previous?: string | null;
}
/** `note` is set whenever a name is dropped or a stored name is corrected; the caller logs it. */
export interface ResolveNameResult { nameEn: string | null; note: string | null }

/** Limitless spellings in the official English style. */
export function normaliseLimitlessEn(en: string | null | undefined): string | null {
  const s = en?.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s
    .replace(/\bPokemon\b/g, "Pokémon")
    // Sword & Shield / Scarlet & Violet print "Zacian V"; -EX and -GX keep their official hyphen.
    .replace(/-(VMAX|VSTAR|V)$/, " $1")
    .replace(/ Prism Star$/, " ◇");
}

export function levenshtein(a: string, b: string): number {
  const x = Array.from(a), y = Array.from(b);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length]!;
}

/** True when `long` is `short` with extra whole tokens before and/or after it ("Celebi ◇" vs "Celebi"). */
function extendsByTokens(long: string, short: string): boolean {
  const l = long.split(" "), s = short.split(" ");
  if (l.length <= s.length) return false;
  for (let i = 0; i + s.length <= l.length; i++) if (s.every((t, k) => l[i + k] === t)) return true;
  return false;
}

const isMegaType = (type: string | null | undefined) => /\bMega Evolution\b/i.test(type ?? "");
const isPrismHint = (v: string | null | undefined) => /\bPrism Star\b|◇/i.test(v ?? "");

/** XY Mega cards: "Charizard-EX" -> "M Charizard-EX"; already-Mega and Primal names stay; anything else is not certain. */
function megaForm(name: string | null): string | null {
  if (name == null) return null;
  // Limitless also types Primal Reversion as "Mega Evolution"; "Primal Groudon-EX" takes no M.
  if (/^(M |Mega |Primal )/.test(name)) return name;
  return /-EX$/.test(name) ? `M ${name}` : null;
}
const prismForm = (name: string | null) => (name == null || name.endsWith("◇") ? name : `${name} ◇`);

/** Reverse dictionary: English name -> the Japanese names that carry it. */
const CLAIMS = new Map<string, string[]>();
for (const table of [CARD_NAMES, species as Record<string, string>]) {
  for (const [key, en] of Object.entries(table)) {
    const ja = normaliseJa(key);
    if (!CLAIMS.get(en)?.includes(ja)) CLAIMS.set(en, [...(CLAIMS.get(en) ?? []), ja]);
  }
}
const hasJapanese = (s: string) => /[぀-ヿ一-鿿]/.test(s);

/** A different Japanese card owns this English name in our dictionary (e.g. a swapped Limitless row). */
function claimedElsewhere(nameJa: string | null, en: string): string | null {
  const owners = CLAIMS.get(en);
  const ja = normaliseJa(nameJa ?? "").trim();
  if (!owners || !hasJapanese(ja) || owners.includes(ja)) return null;
  return owners[0]!;
}

/** Why a stored name is known to be wrong under the current rules, or null. */
function contradiction(nameJa: string | null, prev: string, series: string | null | undefined): string | null {
  const ja = normaliseJa(nameJa ?? "").trim();
  if (RETIRED_NAMES[ja]?.includes(prev)) return `"${prev}" for ${ja} is not certain for every era`;
  for (const [prefix] of ERA_PREFIXES) {
    if (ja.startsWith(prefix) && prev.startsWith("Rocket's ") && !(series != null && (ORIGINAL_ERA_SERIES as readonly string[]).includes(series)))
      return `"${prev}" uses the Gym-era "Rocket's" outside the Gym era`;
  }
  const owner = claimedElsewhere(nameJa, prev);
  return owner ? `"${prev}" is the English name of ${owner}, not ${ja}` : null;
}

export function resolveCardNameEn(input: ResolveNameInput): ResolveNameResult {
  const { nameJa, type, rarity, series } = input;
  const mega = isMegaType(type);
  let l = normaliseLimitlessEn(input.limitlessEn);
  const prism = isPrismHint(type) || isPrismHint(rarity) || (l?.endsWith(" ◇") ?? false);
  let d = translateJaCardName(nameJa, { series });
  const notes: string[] = [];
  if (mega) {
    if (l && !megaForm(l)) notes.push(`Mega Evolution card but Limitless "${l}" is not an -EX`);
    if (d && !megaForm(d)) notes.push(`Mega Evolution card but "${d}" is not an -EX`);
    l = megaForm(l); d = megaForm(d);
  }
  if (prism) { l = prismForm(l); d = prismForm(d); }
  if (l && !d) {
    const owner = claimedElsewhere(nameJa, l);
    if (owner) { notes.push(`Limitless "${l}" is the English name of ${owner}, not ${nameJa}`); l = null; }
  }

  const done = (nameEn: string | null): ResolveNameResult => {
    const changed = (input.previous ?? null) !== nameEn;
    // A note only matters when it explains a change; a silent null-over-name is never allowed.
    if (nameEn == null && input.previous != null && !notes.length) return { nameEn: input.previous, note: null };
    // Every change to a stored name is reported, so corrections are auditable.
    if (changed && input.previous != null && !notes.length) notes.push(`replaces "${input.previous}"`);
    return { nameEn, note: changed && notes.length ? notes.join("; ") : null };
  };

  if (l && d) {
    if (l === d || extendsByTokens(l, d)) return done(l);
    if (levenshtein(l, d) <= 2) return done(d);
    notes.push(`Limitless "${l}" disagrees with dictionary "${d}"`);
    return done(null);
  }
  if (l || d) return done(l ?? d);
  if (notes.length) return done(null);

  // Neither source names the card: keep what we had unless the rules above contradict it.
  const prev = input.previous ?? null;
  if (prev == null) return done(null);
  let fixed: string | null = normaliseLimitlessEn(prev);
  if (mega) fixed = megaForm(fixed);
  if (prism) fixed = prismForm(fixed);
  const why = fixed == null ? `Mega Evolution card but "${prev}" is not an -EX` : contradiction(nameJa, fixed, series);
  if (why) { notes.push(why); return done(null); }
  if (fixed !== prev) notes.push(`"${prev}" rewritten as "${fixed}"`);
  return done(fixed);
}
