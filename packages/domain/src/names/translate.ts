import species from "./species-ja-en.json";
import { CARD_NAMES, PREFIXES, SUFFIXES } from "./card-names-ja-en";

const SPECIES = species as Record<string, string>;

/** Official English name for a Japanese card name, or null unless every part is known. */
export function translateJaCardName(nameJa: string | null): string | null {
  const name = nameJa?.trim();
  if (!name) return null;
  if (CARD_NAMES[name]) return CARD_NAMES[name]!;
  let rest = name, prefix = "";
  for (const [ja, en] of PREFIXES) if (rest.startsWith(ja)) { prefix = `${en} `; rest = rest.slice(ja.length); break; }
  let suffix = "";
  for (const [ja, en] of SUFFIXES) if (rest.endsWith(ja) && SPECIES[rest.slice(0, -ja.length)]) { suffix = en; rest = rest.slice(0, -ja.length); break; }
  const sp = SPECIES[rest];
  return sp ? `${prefix}${sp}${suffix}` : null;
}
