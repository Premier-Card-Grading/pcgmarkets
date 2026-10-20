import { parseCardNumber } from "./card-number";

export type CardQuery = { kind: "all" } | { kind: "number"; num: number; denom: number | null; suffix: string | null } | { kind: "text"; text: string };
export interface QueryableCard { number_printed: string; number_num: number | null; number_denom: number | null; number_suffix: string | null; name_en: string | null; name_ja: string | null }

/** Set-page search: "069/187", "69/187", "69", "069", "#69", "001/SV-P", or a name. */
export function parseCardQuery(q: string): CardQuery {
  const t = q.trim().replace(/^#/, "");
  if (!t) return { kind: "all" };
  const n = parseCardNumber(t);
  if (n) return { kind: "number", num: n.num, denom: n.denom, suffix: n.suffix };
  return { kind: "text", text: t.toLowerCase() };
}

export function matchesCardQuery(card: QueryableCard, q: CardQuery): boolean {
  if (q.kind === "all") return true;
  if (q.kind === "number") {
    if (card.number_num !== q.num) return false;
    if (q.denom != null && card.number_denom !== q.denom) return false;
    if (q.suffix != null && (card.number_suffix ?? "").toUpperCase() !== q.suffix) return false;
    return true;
  }
  return [card.name_en, card.name_ja, card.number_printed].some((s) => s != null && s.toLowerCase().includes(q.text));
}
