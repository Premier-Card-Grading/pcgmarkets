import { PRINTED_TOTALS, PRINTED_WIDTHS } from "./printed-totals";

export interface ParsedNumber {
  num: number;
  denom: number | null;
  suffix: string | null;
  printed: string;
}

const NUM_RE = /^\s*(\d{1,3})\s*(?:\/\s*(\d{1,3}|[A-Za-z]{1,4}-[Pp]))?\s*$/;

export function parseCardNumber(input: string): ParsedNumber | null {
  const m = NUM_RE.exec(input);
  if (!m) return null;
  const numStr = m[1]!;
  const num = parseInt(numStr, 10);
  const d = m[2];
  if (d === undefined) return { num, denom: null, suffix: null, printed: numStr };
  if (/^\d+$/.test(d)) return { num, denom: parseInt(d, 10), suffix: null, printed: `${numStr}/${d}` };
  const suffix = d.toUpperCase();
  return { num, denom: null, suffix, printed: `${numStr}/${suffix}` };
}

export type SearchShape =
  | { kind: "cert"; cert: string }
  | { kind: "number"; number: ParsedNumber }
  | { kind: "name"; q: string };

export function classifySearch(q: string): SearchShape {
  const t = q.trim();
  if (/^\d{9}$/.test(t)) return { kind: "cert", cert: t };
  const n = parseCardNumber(t);
  if (n) return { kind: "number", number: n };
  return { kind: "name", q: t };
}

const PROMO_SET_RE = /-P$/i;

export function numberFromCatalog(
  localId: string,
  set: { id: string; cardCountOfficial: number | null },
): ParsedNumber | null {
  if (!/^\d{1,3}$/.test(localId)) return null;
  const num = parseInt(localId, 10);
  const printedTotal = Object.hasOwn(PRINTED_TOTALS, set.id) ? PRINTED_TOTALS[set.id]! : undefined;
  if (typeof printedTotal === "string") return { num, denom: null, suffix: printedTotal, printed: `${localId}/${printedTotal}` };
  if (printedTotal === undefined && PROMO_SET_RE.test(set.id)) {
    const suffix = set.id.toUpperCase();
    return { num, denom: null, suffix, printed: `${localId}/${suffix}` };
  }
  const denom = printedTotal === undefined ? set.cardCountOfficial : printedTotal;
  if (denom == null) return { num, denom: null, suffix: null, printed: localId.padStart(PRINTED_WIDTHS[set.id] ?? 0, "0") };
  return { num, denom, suffix: null, printed: `${localId}/${String(denom).padStart(localId.length, "0")}` };
}
