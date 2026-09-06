import type { TierLabel } from "./types";

export const GRADE_VALUES = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6, 5, 4, 3, 2, 1] as const;

/** Order matters: "Gold Pristine" must resolve to Flawless before "Pristine" matches. */
const TIER_PATTERNS: Array<[RegExp, TierLabel]> = [
  [/flawless|gold\s*pristine|quad\s*10|フローレス/i, "Flawless"],
  [/pristine|プリスティン/i, "Pristine"],
  [/gem\s*mint|ジェムミント/i, "Gem Mint"],
];

export function parseTierLabel(text: string): TierLabel | null {
  for (const [re, label] of TIER_PATTERNS) if (re.test(text)) return label;
  return null;
}

const GRADE_RE =
  /(?<![A-Za-z])PCG\s*(?:鑑定品?|graded)?\s*(?:gem\s*mint|pristine|flawless|mint|ジェムミント|プリスティン|フローレス)?\s*(10|9\.5|9|8\.5|8|7\.5|7|6|5|4|3|2|1)(\+)?(?![\d.])/i;

export function parseGradeFromText(text: string): { value: number; tierHint: "10+" | null } | null {
  const m = GRADE_RE.exec(text);
  if (!m) return null;
  const value = parseFloat(m[1]!);
  const tierHint = value === 10 && m[2] === "+" ? "10+" : null;
  return { value, tierHint };
}

export function normalizeGradeValue(s: string | undefined): number | null | "authentic" {
  if (!s) return null;
  const t = s.trim();
  if (/^authentic/i.test(t)) return "authentic";
  const v = parseFloat(t);
  return (GRADE_VALUES as readonly number[]).includes(v) ? v : null;
}
