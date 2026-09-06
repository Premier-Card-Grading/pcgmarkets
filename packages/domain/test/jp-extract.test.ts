import { describe, it, expect } from "vitest";
import { detectLanguage, findCardNumber, findSetCode, isLot, hasPcgSetCodeNoise, hasPcgsNoise } from "../src/jp-extract";

describe("detectLanguage", () => {
  it("defaults to ja", () => expect(detectLanguage("リザードン ex SAR PCG10")).toBe("ja"));
  it("flips on overseas tokens", () => {
    expect(detectLanguage("ナンジャモ 海外 プロモ PCG鑑定")).toBe("en");
    expect(detectLanguage("英語版 Charizard PCG 10")).toBe("en");
    expect(detectLanguage("Pikachu EN版 PCG9.5")).toBe("en");
  });
});

describe("findCardNumber", () => {
  it("finds NNN/NNN anywhere", () => {
    expect(findCardNumber("ヒバニー AR 745/742 PCG鑑定品")).toMatchObject({ num: 745, denom: 742 });
  });
  it("finds promo suffix", () => {
    expect(findCardNumber("ピカチュウ 001/SV-P PCG10")).toMatchObject({ num: 1, suffix: "SV-P" });
    expect(findCardNumber("084/PCG-P 2005")).toMatchObject({ num: 84, suffix: "PCG-P" });
    expect(findCardNumber("ミュウ 012/DPt-P")).toMatchObject({ suffix: "DPT-P" });
  });
  it("ignores dates and fractions inside longer digit runs", () => {
    expect(findCardNumber("2023/10/05 発売 PCG10")).toBeNull();
    expect(findCardNumber("1500/3000円")).toBeNull();
  });
});

describe("findSetCode", () => {
  const codes = ["SV1a", "SV1", "S12a", "M2a", "SV-P", "OBF", "PAF"];
  it("matches whole tokens case-insensitively", () => {
    expect(findSetCode("【ポケカ デカヌチャン sv1a S PCG10】", codes)).toBe("SV1a");
    expect(findSetCode("M2a 212/193", codes)).toBe("M2a");
  });
  it("prefers the longer code when one is a prefix of another", () => {
    expect(findSetCode("sv1a 073/073", codes)).toBe("SV1a");
    expect(findSetCode("SV1 073/078", codes)).toBe("SV1");
  });
  it("does not match inside words", () => {
    expect(findSetCode("OBFUSCATED", codes)).toBeNull();
    expect(findSetCode("パフェ", codes)).toBeNull();
  });
});

describe("isLot", () => {
  it.each(["PCG10 ×3", "PCG 10 x 2", "3枚セット", "まとめ売り", "lot of 5", "bundle"])("%s", (t) =>
    expect(isLot(t)).toBe(true));
  it("does not flag bare セット", () => expect(isLot("拡張パック セット PCG10")).toBe(false));
});

describe("noise", () => {
  it("flags PCG-P and PCGS", () => {
    expect(hasPcgSetCodeNoise("084/PCG-P")).toBe(true);
    expect(hasPcgsNoise("PCGS MS65 coin")).toBe(true);
    expect(hasPcgSetCodeNoise("PCG10 鑑定品")).toBe(false);
    expect(hasPcgsNoise("PCG鑑定品")).toBe(false);
  });
});
