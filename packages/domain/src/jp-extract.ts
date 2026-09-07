import type { Language } from "./types";
import type { ParsedNumber } from "./card-number";

const EN_TOKENS = /海外|英語|English|EN版/i;

export function detectLanguage(text: string): Language {
  return EN_TOKENS.test(text) ? "en" : "ja";
}

const CARD_NUMBER_RE = /(?<![\d/])(\d{1,3})\s*\/\s*(\d{1,3}|[A-Za-z]{1,4}-[Pp])(?![\d/])/;

export function findCardNumber(text: string): ParsedNumber | null {
  const m = CARD_NUMBER_RE.exec(text);
  if (!m) return null;
  const numStr = m[1]!, d = m[2]!;
  const num = parseInt(numStr, 10);
  if (/^\d+$/.test(d)) return { num, denom: parseInt(d, 10), suffix: null, printed: `${numStr}/${d}` };
  const suffix = d.toUpperCase();
  return { num, denom: null, suffix, printed: `${numStr}/${suffix}` };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-token, case-insensitive; longest code wins so "SV1a" beats "SV1". */
export function findSetCode(text: string, codes: string[]): string | null {
  const sorted = [...codes].sort((a, b) => b.length - a.length);
  for (const code of sorted) {
    const re = new RegExp(`(?<![A-Za-z0-9])${escapeRe(code)}(?![A-Za-z0-9])`, "i");
    if (re.test(text)) return code;
  }
  return null;
}

// The first pattern requires a non-letter before the "x"/"×" so it doesn't match the "x" in
// "ex"/"EX" (a huge fraction of modern Pokemon cards, e.g. "Sylveon ex 069/187") when a card
// number follows.
const LOT_RES = [/(?<![A-Za-z])[x×]\s*\d/i, /\d\s*枚/, /まとめ/, /\blot\b/i, /\bbundle\b/i, /\d\s*セット/, /枚セット/];

export function isLot(text: string): boolean {
  return LOT_RES.some((re) => re.test(text));
}

export function hasPcgSetCodeNoise(text: string): boolean {
  return /PCG-P/i.test(text);
}

export function hasPcgsNoise(text: string): boolean {
  return /PCGS/i.test(text);
}
