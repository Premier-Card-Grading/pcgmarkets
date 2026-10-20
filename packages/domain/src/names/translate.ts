import species from "./species-ja-en.json";
import { CARD_NAMES, PREFIXES, SUFFIXES } from "./card-names-ja-en";

const SPECIES = species as Record<string, string>;

/** Own-property lookup, so inherited keys such as "constructor" never match. */
function lookup(table: Record<string, string>, key: string): string | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** Official English name for a Japanese card name, or null unless every part is known. */
export function translateJaCardName(nameJa: string | null): string | null {
  const name = nameJa?.trim();
  if (!name) return null;
  const whole = lookup(CARD_NAMES, name);
  if (whole) return whole;
  let rest = name, prefix = "";
  for (const [ja, en] of PREFIXES) if (rest.startsWith(ja)) { prefix = `${en} `; rest = rest.slice(ja.length); break; }
  let suffix = "";
  for (const [ja, en] of SUFFIXES) if (rest.endsWith(ja) && lookup(SPECIES, rest.slice(0, -ja.length))) { suffix = en; rest = rest.slice(0, -ja.length); break; }
  const sp = lookup(SPECIES, rest);
  return sp ? `${prefix}${sp}${suffix}` : null;
}
