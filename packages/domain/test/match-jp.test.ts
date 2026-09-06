import { describe, it, expect } from "vitest";
import { InMemoryCatalog, type SetRef, type ProductRef } from "../src/catalog-index";
import { matchJp } from "../src/match-jp";

const sets: SetRef[] = [
  { id: "SV1a", printedCode: "SV1a", language: "ja", cardCount: 73, nameEn: null, nameJa: "トリプレットビート", aliases: [] },
  { id: "M2a", printedCode: "M2a", language: "ja", cardCount: 193, nameEn: null, nameJa: "MEGA Dream ex", aliases: [] },
  { id: "S12a", printedCode: "S12a", language: "ja", cardCount: 172, nameEn: null, nameJa: "VSTARユニバース", aliases: [] },
  { id: "SV-P", printedCode: "SV-P", language: "ja", cardCount: null, nameEn: null, nameJa: "SVプロモ", aliases: [] },
  { id: "sv03", printedCode: "OBF", language: "en", cardCount: 197, nameEn: "Obsidian Flames", nameJa: null, aliases: ["OBF"] },
  { id: "dupA", printedCode: "DUPA", language: "ja", cardCount: 999, nameEn: null, nameJa: "dupA", aliases: [] },
  { id: "dupB", printedCode: "DUPB", language: "ja", cardCount: 999, nameEn: null, nameJa: "dupB", aliases: [] },
];
const products: ProductRef[] = [
  { id: "SV1a-073", setId: "SV1a", numberNum: 73, numberDenom: 73, numberSuffix: null, language: "ja" },
  { id: "M2a-212", setId: "M2a", numberNum: 212, numberDenom: 193, numberSuffix: null, language: "ja" },
  { id: "S12a-201", setId: "S12a", numberNum: 201, numberDenom: 172, numberSuffix: null, language: "ja" },
  { id: "SV-P-001", setId: "SV-P", numberNum: 1, numberDenom: null, numberSuffix: "SV-P", language: "ja" },
  { id: "sv03-201", setId: "sv03", numberNum: 201, numberDenom: 197, numberSuffix: null, language: "en" },
  { id: "dupA-005", setId: "dupA", numberNum: 5, numberDenom: 999, numberSuffix: null, language: "ja" },
  { id: "dupB-005", setId: "dupB", numberNum: 5, numberDenom: 999, numberSuffix: null, language: "ja" },
];
const catalog = new InMemoryCatalog(sets, products);
const m = (title: string, description: string | null = null) => matchJp({ title, description }, catalog);

describe("matchJp — set code path", () => {
  it("matches set code + number + grade", () => {
    expect(m("《鑑定済み》[PCG10]【AR】M2a 212/193")).toMatchObject({
      state: "matched", productId: "M2a-212", gradeValue: 10, gradeLabel: null, matchMethod: "jp_set_code",
    });
  });
  it("carries the tier label on a 10", () => {
    expect(m("[PCG10/Flawless]【AR】M2a 212/193").gradeLabel).toBe("Flawless");
  });
  it("drops the tier label below 10", () => {
    expect(m("PCG 9.5 Gem Mint M2a 212/193")).toMatchObject({ gradeValue: 9.5, gradeLabel: null });
  });
  it("promo suffix satisfies the set code", () => {
    expect(m("ピカチュウ 001/SV-P PCG10")).toMatchObject({ state: "matched", productId: "SV-P-001" });
  });
});

describe("matchJp — number + denominator path", () => {
  it("resolves via unique card count", () => {
    expect(m("リザードン ex SAR 201/172 PCG鑑定 10")).toMatchObject({
      state: "matched", productId: "S12a-201", matchMethod: "jp_number_denom",
    });
  });
  it("routes shared card counts to review", () => {
    expect(m("005/999 PCG10")).toMatchObject({ state: "needs_review", reviewReason: "ambiguous_set" });
  });
  it("uses language to pick the EN set", () => {
    expect(m("海外版 Charizard 201/197 PCG 10")).toMatchObject({ state: "matched", productId: "sv03-201" });
  });
});

describe("matchJp — review routing", () => {
  it("no number", () => {
    expect(m("【ポケカ デカヌチャン sv1a S PCG10 鑑定品】")).toMatchObject({ state: "needs_review", reviewReason: "no_card_number" });
  });
  it("no grade", () => {
    expect(m("M2a 212/193 美品")).toMatchObject({ state: "needs_review", reviewReason: "no_grade" });
  });
  it("no set and no unique denominator", () => {
    expect(m("ヒバニー AR 745/742 PCG鑑定品 Gem Mint 10")).toMatchObject({ state: "needs_review", reviewReason: "no_set_code" });
  });
  it("PCG-P without a grade token", () => {
    expect(m("084/PCG-P 2005 プロモ")).toMatchObject({ state: "needs_review", reviewReason: "possible_pcg_set_code" });
  });
  it("PCG-P with a grade token is legitimate", () => {
    expect(m("084/PCG-P PCG10")).toMatchObject({ state: "needs_review", reviewReason: "no_set_code" }); // PCG-P set not in fixture catalog
    expect(m("084/PCG-P PCG10").reviewReason).not.toBe("possible_pcg_set_code");
  });
  it("PCGS noise", () => {
    expect(m("PCGS MS65 記念硬貨")).toMatchObject({ state: "needs_review", reviewReason: "possible_pcgs" });
  });
  it("lots", () => {
    expect(m("M2a 212/193 PCG10 ×3")).toMatchObject({ state: "needs_review", reviewReason: "lot" });
  });
  it("falls back to description for the number", () => {
    expect(m("デカヌチャン PCG10", "型番 SV1a 073/073")).toMatchObject({ state: "matched", productId: "SV1a-073" });
  });
  it("extracted always shows what was found", () => {
    const r = m("M2a 美品");
    expect(r.extracted).toMatchObject({ setCode: "M2a", cardNumber: null, grade: null, language: "ja" });
  });
});
