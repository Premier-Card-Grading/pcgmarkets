import species from "./species-ja-en.json";
import { CARD_NAMES, ERA_PREFIXES, PREFIXES, SUFFIXES } from "./card-names-ja-en";

/** Where a card was printed; era-dependent names need it and resolve to null without it. */
export interface NameContext { series?: string | null }

/** Width-insensitive Japanese: "ポリゴン２" and "ポリゴン2", "ＶＭＡＸ" and "VMAX" are the same name. */
export const normaliseJa = (s: string) => s.normalize("NFKC");
const byNormalisedKey = (t: Record<string, string>) => Object.fromEntries(Object.entries(t).map(([k, v]) => [normaliseJa(k), v]));

const SPECIES = byNormalisedKey(species as Record<string, string>);
const CARDS = byNormalisedKey(CARD_NAMES);

/** Own-property lookup, so inherited keys such as "constructor" never match. */
function lookup(table: Record<string, string>, key: string): string | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

const sp = (name: string): string | null => lookup(SPECIES, name) ?? null;

/** Species with an optional card-type suffix ("EX", "V", "BREAK", ...). */
function withSuffix(name: string): string | null {
  for (const [ja, en] of SUFFIXES) {
    if (!name.endsWith(ja)) continue;
    const base = sp(name.slice(0, -ja.length));
    if (base) return `${base}${en}`;
  }
  return sp(name);
}

/** One Pokémon or other card, without tag-team "&" parts. */
function single(name: string, ctx: NameContext): string | null {
  const whole = lookup(CARDS, name);
  if (whole) return whole;
  const plain = withSuffix(name);
  if (plain) return plain;
  // Mega evolutions: "M X-EX" (XY era) and "Mega X ex" (Scarlet & Violet era); other suffixes are not certain.
  if (name.startsWith("メガ")) {
    const rest = name.slice(2).trim();
    if (rest.endsWith("EX") && sp(rest.slice(0, -2))) return `M ${sp(rest.slice(0, -2))}-EX`;
    if (rest.endsWith("ex") && sp(rest.slice(0, -2))) return `Mega ${sp(rest.slice(0, -2))} ex`;
    return null;
  }
  for (const [ja, byEra] of ERA_PREFIXES) {
    if (!name.startsWith(ja)) continue;
    const en = byEra.find(([series]) => ctx.series != null && series.includes(ctx.series))?.[1];
    const rest = withSuffix(name.slice(ja.length).trim());
    return en && rest ? `${en} ${rest}` : null;
  }
  for (const [ja, en] of PREFIXES) {
    if (!name.startsWith(ja)) continue;
    const rest = withSuffix(name.slice(ja.length).trim());
    if (rest) return `${en} ${rest}`;
  }
  return null;
}

/** Official English name for a Japanese card name, or null unless every part is known. */
export function translateJaCardName(nameJa: string | null, ctx: NameContext = {}): string | null {
  const name = nameJa == null ? "" : normaliseJa(nameJa).trim();
  if (!name) return null;
  if (!name.includes("&")) return single(name, ctx);
  // Tag teams: "ピカチュウ&ゼクロムGX" -> "Pikachu & Zekrom-GX"; only the last part carries the suffix.
  const parts = name.split("&").map((p) => p.trim());
  const last = withSuffix(parts[parts.length - 1]!);
  const firsts = parts.slice(0, -1).map(sp);
  if (!last || firsts.some((f) => f == null)) return null;
  return [...firsts, last].join(" & ");
}
