import type { PsaReading } from "./psa-label";

/**
 * Reading a PSA label from positional OCR of a listing photo (macOS Vision, tools/psa-ocr.swift).
 * The label's right column holds "#<number>", the grade words, the grade and the cert; its left column holds
 * year + set, card name and variety lines. A reading is "high" confidence only when the label band is cut cleanly:
 * one cert, one number, one grade, 2–4 left lines, every line read with confidence, and no text just outside the band
 * (which would mean a label line was missed — a missed "GAMESTOP EXCLUSIVE" line would match the wrong printing).
 */

/** One OCR line: text, box (0..1, y from the top) and Vision's confidence. */
export interface OcrRow { t: string; x: number; y: number; w: number; h: number; c?: number }
export type PsaOcrReading = PsaReading & { gradeWords: string | null; confidence: "high" | "low" };

const CERT = /^\d{8,10}$/;
const NUM = /^#\s?[A-Z]{0,6}-?\d{1,4}[A-Z]?$/;
const GRADE_WORD = /^(GEM MT|GEM MINT|MINT|NM-MT\+?|NM|EX-MT|EX|VG-EX|VG|GOOD|FAIR|PR|POOR|AUTHENTIC)$/;
const GRADE = /^(10|[1-9](\.5)?)$/;
const CARD_NUMBER = /\b([A-Z]{0,4}\d{1,3}\s?\/\s?[A-Z-]{0,4}\d{0,3}[A-Z-]*)\b/;
const alnum = (r: OcrRow) => r.t.replace(/[^A-Za-z0-9]/g, "").length;

export function parsePsaOcr(input: OcrRow[]): PsaOcrReading | null {
  const rows = input.filter((r) => r.t.trim());
  const certs = rows.filter((r) => CERT.test(r.t.replace(/ /g, "")) && r.y < 0.5);
  const nums = rows.filter((r) => NUM.test(r.t.trim().toUpperCase().replace(/ /g, "")) && r.y < 0.5);
  if (certs.length !== 1 || nums.length !== 1) return null;
  const cert = certs[0]!, num = nums[0]!;
  if (!(num.y < cert.y && num.x > 0.45)) return null;
  const top = num.y - 1.5 * num.h, bottom = cert.y + cert.h + 0.005;
  const band = rows.filter((r) => r.y >= top && r.y <= bottom);
  const edge = Math.min(num.x, cert.x) - 0.03;
  const byY = (a: OcrRow, b: OcrRow) => a.y - b.y;
  const right = band.filter((r) => r.x >= edge || (r.x + r.w > edge + 0.02 && GRADE_WORD.test(r.t.trim().toUpperCase()))).sort(byY);
  // PSA logo fragments ("PSA", "PSAR") and barcode noise.
  const logo = band.filter((r) => !right.includes(r) && (alnum(r) <= 3 || /^[P5][S5]A[R]?$/i.test(r.t.replace(/[^A-Za-z0-9]/g, ""))));
  const left = band.filter((r) => !right.includes(r) && !logo.includes(r)).sort(byY);
  const grade = right.filter((r) => GRADE.test(r.t.trim()));
  const words = right.filter((r) => r !== num && r !== cert && !GRADE.test(r.t.trim()));
  const near = rows.filter((r) => alnum(r) >= 4 && !band.includes(r) && ((r.y >= top - 2 * num.h && r.y < top) || (r.y > bottom && r.y <= bottom + 0.01)));
  const unsure = [...left, num, cert, ...grade].some((r) => (r.c ?? 1) < 0.5);
  // The card's own number, printed at its bottom: the lowest line below the label that looks like one.
  let cardNumber: string | null = null;
  for (const r of [...rows].sort((a, b) => b.y - a.y)) {
    if (r.y <= bottom + 0.1) break;
    const m = CARD_NUMBER.exec(r.t.toUpperCase());
    if (m) { cardNumber = m[1]!.replace(/ /g, ""); break; }
  }
  const clean = !unsure && near.length === 0 && left.length >= 2 && left.length <= 4 && grade.length === 1 && left[0]!.y <= num.y + num.h;
  return {
    labelLeft: left.map((r) => r.t.trim()), labelNumber: num.t.trim().replace(/ /g, ""),
    gradeWords: words.map((r) => r.t.trim()).join(" ") || null,
    finalGrade: grade.length === 1 ? Number(grade[0]!.t) : null, cert: cert.t.replace(/ /g, ""),
    cardNumber, confidence: clean ? "high" : "low",
  };
}
