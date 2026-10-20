import { describe, it, expect } from "vitest";
import { extractPcNumber, isPcVariant, linkPcProduct, type LinkCandidate } from "../src/pc-link";

const c = (id: string, numberNum: number | null, numberPrinted: string): LinkCandidate => ({ id, numberNum, numberPrinted });
const set151 = [c("sv03.5-200", 200, "200/165"), c("sv03.5-6", 6, "006/165"), c("sv03.5-TG05", null, "TG05")];

describe("extractPcNumber", () => {
  it("reads the token after the last #", () => {
    expect(extractPcNumber("Blastoise ex #200")).toBe("200");
    expect(extractPcNumber("Charizard ex #006")).toBe("006");
    expect(extractPcNumber("Pikachu #tg05")).toBe("TG05");
    expect(extractPcNumber("Mew #SV-P 001")).toBe("SV-P");
    expect(extractPcNumber("Booster Box")).toBeNull();
  });
});

describe("isPcVariant", () => {
  it("flags bracketed variant tags", () => {
    expect(isPcVariant("Charizard [1st Edition] #4")).toBe(true);
    expect(isPcVariant("Pikachu [Reverse Holo] #58")).toBe(true);
    expect(isPcVariant("Charizard #4")).toBe(false);
  });
});

describe("linkPcProduct", () => {
  it("links a numeric card number to exactly one product, ignoring leading zeros", () => {
    expect(linkPcProduct({ productName: "Blastoise ex #200", cardNumber: "200" }, set151)).toEqual({ state: "linked", productId: "sv03.5-200" });
    expect(linkPcProduct({ productName: "Charizard ex #006", cardNumber: "006" }, set151)).toEqual({ state: "linked", productId: "sv03.5-6" });
  });
  it("links an alphanumeric number by its printed form", () => {
    expect(linkPcProduct({ productName: "Pikachu #TG05", cardNumber: "TG05" }, set151)).toEqual({ state: "linked", productId: "sv03.5-TG05" });
  });
  it("sends a missing number, a variant, no match and an ambiguous match to review", () => {
    expect(linkPcProduct({ productName: "Booster Box", cardNumber: null }, set151)).toEqual({ state: "needs_review", reason: "no_card_number" });
    expect(linkPcProduct({ productName: "Blastoise ex [Reverse Holo] #200", cardNumber: "200" }, set151)).toEqual({ state: "needs_review", reason: "variant" });
    expect(linkPcProduct({ productName: "Nobody #999", cardNumber: "999" }, set151)).toEqual({ state: "needs_review", reason: "no_match" });
    const dup = [...set151, c("sv03.5-200b", 200, "200/165")];
    expect(linkPcProduct({ productName: "Blastoise ex #200", cardNumber: "200" }, dup)).toEqual({ state: "needs_review", reason: "ambiguous" });
  });
});
