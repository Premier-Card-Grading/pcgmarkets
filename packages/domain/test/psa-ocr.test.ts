import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parsePsaOcr, type OcrRow } from "../src/psa-ocr";

// Real macOS Vision OCR of eBay listing photos.
const ocr = (id: string) => JSON.parse(readFileSync(new URL(`./fixtures/psa-ocr/${id}.json`, import.meta.url), "utf8")) as OcrRow[];
const row = (t: string, x: number, y: number, c = 1): OcrRow => ({ t, x, y, w: 0.1, h: 0.02, c });

describe("parsePsaOcr", () => {
  it("splits a label into its left lines, number, grade and cert", () => {
    expect(parsePsaOcr(ocr("117325667939"))).toMatchObject({ labelLeft: ["1999 POKEMON FOSSIL", "DRAGONITE-HOLO"], labelNumber: "#4", gradeWords: "EX", finalGrade: 5, cert: "157501822", cardNumber: "4/62", confidence: "high" });
  });
  it("keeps a third label line, which can name another printing", () => {
    expect(parsePsaOcr(ocr("900001540019"))).toMatchObject({ labelLeft: ["2025 POKEMON DRI EN", "TEAM ROCKET'S ZAPDOS", "GAMESTOP EXCLUSIVE"], labelNumber: "#070", finalGrade: 10, confidence: "high" });
  });
  it("puts grade words in the right column even when they start left of the number", () => {
    expect(parsePsaOcr(ocr("860054649508"))).toMatchObject({ labelLeft: ["2025 POKEMON MBG JP", "MEGA GENGAR ex"], gradeWords: "GEM MT", finalGrade: 10 });
  });
  it("is unsure when a line is read with low confidence or text sits just outside the label", () => {
    const label = [row("2025 POKEMON DRI EN", 0.1, 0.08), row("ROCKET'S MOLTRES ex", 0.1, 0.11), row("#229", 0.8, 0.08), row("10", 0.85, 0.14), row("123456789", 0.7, 0.16)];
    expect(parsePsaOcr(label)!.confidence).toBe("high");
    expect(parsePsaOcr(label.map((r, i) => (i === 1 ? { ...r, c: 0.3 } : r)))!.confidence).toBe("low");
    expect(parsePsaOcr([...label, row("GAMESTOP EXCLUSIVE", 0.1, 0.19)])!.confidence).toBe("low");
  });
  it("returns nothing when there is no single PSA number and cert", () => {
    expect(parsePsaOcr([row("PCG", 0.1, 0.05), row("Mega Gengar ex", 0.2, 0.08)])).toBeNull();
  });
});
