import { describe, it, expect } from "vitest";
import { InMemoryCatalog, type ProductRef, type SetRef } from "../src/catalog-index";
import { matchPsaLabel, psaLanguage, psaNumberKey, type PsaReading } from "../src/psa-label";

const set = (o: Partial<SetRef> & { id: string }): SetRef => ({ printedCode: null, language: "en", cardCount: null, nameEn: null, nameJa: null, aliases: [], releaseDate: null, ...o });
const card = (setId: string, printed: string, nameEn: string, language: "en" | "ja" = "en"): ProductRef => {
  const [n, d] = printed.split("/");
  const num = /^\d+$/.test(n!) ? Number(n) : null;
  const suffix = d && /[A-Z]/.test(d) ? d : null;
  return { id: `${setId}-${n}`, setId, numberNum: num, numberDenom: d && !suffix ? Number(d) : null, numberSuffix: suffix, language, numberPrinted: printed, nameEn };
};
const catalog = new InMemoryCatalog([
  set({ id: "base3", printedCode: "FO", aliases: ["FO"], nameEn: "Fossil", releaseDate: "1999-10-10" }),
  set({ id: "sv10", printedCode: "DRI", aliases: ["DRI"], nameEn: "Destined Rivals", releaseDate: "2025-05-30" }),
  set({ id: "sv09", printedCode: "JTG", aliases: ["JTG"], nameEn: "Journey Together", releaseDate: "2025-03-28" }),
  set({ id: "swsh10tg", nameEn: "Astral Radiance Trainer Gallery", releaseDate: "2022-05-27" }),
  set({ id: "SV-P", printedCode: "SV-P", aliases: ["SVP"], language: "ja", nameEn: "Scarlet & Violet Promotional Cards", releaseDate: "2022-11-29" }),
  set({ id: "SV2a", printedCode: "SV2a", language: "ja", nameEn: "Pokémon Card 151", releaseDate: "2023-06-16" }),
  set({ id: "base4", printedCode: "B2", nameEn: "Base Set 2", releaseDate: "2000-02-24" }),
], [
  card("base3", "4/62", "Dragonite"),
  card("sv10", "229/182", "Team Rocket's Moltres ex"),
  card("sv10", "070/182", "Team Rocket's Zapdos"),
  card("sv09", "117/159", "Hop's Snorlax"),
  card("swsh10tg", "TG03", "Kingdra"),
  card("SV-P", "197/SV-P", "Pikachu", "ja"),
  card("SV2a", "136/165", "Flareon", "ja"),
  card("base4", "6/130", "Clefairy"),
]);
const read = (labelLeft: string[], labelNumber: string, cardNumber: string | null = null): PsaReading => ({ labelLeft, labelNumber, finalGrade: 10, cert: "123456789", cardNumber });

describe("matchPsaLabel", () => {
  it("matches a card by language, number, name and the set on the label", () => {
    expect(matchPsaLabel(read(["1999 POKEMON FOSSIL", "DRAGONITE-HOLO"], "#4"), catalog)).toEqual({ status: "matched", productId: "base3-4", evidence: ["name"] });
  });
  it("reads PSA's short names: ROCKET'S for Team Rocket's, FA/ before a full art, a rarity line", () => {
    expect(matchPsaLabel(read(["2025 POKEMON DRI EN", "ROCKET'S MOLTRES ex", "SPECIAL ILLUSTRATION RARE"], "#229", "229/182"), catalog)).toMatchObject({ status: "matched", productId: "sv10-229" });
    expect(matchPsaLabel(read(["2022 POKEMON SWSH", "FA/KINGDRA", "ASTRAL RADIANCE"], "#TG03", "TG03/TG30"), catalog)).toMatchObject({ status: "matched", productId: "swsh10tg-TG03" });
    expect(matchPsaLabel(read(["2000 POKEMON GAME", "CLEFAIRY-HOLO", "BASE II"], "#6", "6/130"), catalog)).toMatchObject({ status: "matched", productId: "base4-6" });
  });
  it("accepts a rarity line whose first letters the OCR clipped, and Mega/BW rarities", () => {
    expect(matchPsaLabel(read(["2025 POKEMON DRI EN", "ROCKET'S MOLTRES ex", "LLUSTRATION RARE"], "#229", "229/182"), catalog)).toMatchObject({ status: "matched", productId: "sv10-229" });
    expect(matchPsaLabel(read(["2025 POKEMON DRI EN", "ROCKET'S MOLTRES ex", "MEGA HYPER RARE"], "#229", "229/182"), catalog)).toMatchObject({ status: "matched" });
    expect(matchPsaLabel(read(["2025 POKEMON DRI EN", "ROCKET'S MOLTRES ex", "RARE"], "#229", "229/182"), catalog)).toMatchObject({ status: "matched" });
  });
  it("lets a promo's label year differ from the promo set's release year", () => {
    expect(matchPsaLabel(read(["2024 POKEMON SV-P JP", "PIKACHU", "GYM EVENT CAMPAIGN"], "#197", "197/SV-P"), catalog)).toMatchObject({ status: "matched", productId: "SV-P-197" });
  });
  it("rejects another printing of a numbered card: store stamps, collection boxes, 1st Edition, reverse holo", () => {
    expect(matchPsaLabel(read(["2025 POKEMON DRI EN", "TEAM ROCKET'S ZAPDOS", "GAMESTOP EXCLUSIVE"], "#070", "070/182"), catalog).status).toBe("variant_not_in_catalogue");
    expect(matchPsaLabel(read(["2025 POKEMON JTG EN", "HOP'S SNORLAX", "GAMESTOP EXCLUSIVE"], "#117", "117/159"), catalog).status).toBe("variant_not_in_catalogue");
    expect(matchPsaLabel(read(["1999 POKEMON FOSSIL", "DRAGONITE-HOLO", "1ST EDITION"], "#4"), catalog).status).toBe("variant_not_in_catalogue");
    expect(matchPsaLabel(read(["1999 POKEMON FOSSIL", "DRAGONITE-REV.FOIL"], "#4"), catalog).status).not.toBe("matched");
  });
  it("does not match a same-name, same-number card from a set the label does not name", () => {
    // A 1995 Topsun Flareon #136 is not Pokémon Card 151's Flareon 136/165.
    expect(matchPsaLabel(read(["1995 P.M. JAPANESE TOPSUN", "FLAREON", "BLUE BACK"], "#136", "136"), catalog).status).toBe("no_card");
  });
  it("needs the name to agree, so a misread number lands on nothing", () => {
    expect(matchPsaLabel(read(["2025 POKEMON DRI EN", "ROCKET'S MOLTRES ex", "SPECIAL ILLUSTRATION RARE"], "#070"), catalog).status).toBe("no_card");
  });
  it("skips Chinese and Korean cards, and labels missing lines", () => {
    expect(matchPsaLabel(read(["2024 POKEMON CS5a CS", "RADIANT EEVEE"], "#092"), catalog).status).toBe("language_not_in_catalogue");
    expect(matchPsaLabel(read(["2019 P.M. KOR. SUN & MOON", "MEWTWO"], "#016"), catalog).status).toBe("language_not_in_catalogue");
    expect(matchPsaLabel(read(["1999 POKEMON FOSSIL"], "#4"), catalog).status).toBe("unreadable");
  });
});

describe("label parts", () => {
  it("parses PSA numbers with and without a letter prefix", () => {
    expect(psaNumberKey("#TG03")).toEqual({ prefix: "TG", num: 3, suffix: "" });
    expect(psaNumberKey("#045")).toEqual({ prefix: "", num: 45, suffix: "" });
    expect(psaNumberKey("#145A")).toEqual({ prefix: "", num: 145, suffix: "A" });
  });
  it("tells Japanese from English, and excludes Chinese", () => {
    expect(psaLanguage("2022 POKEMON JPN.SWSH")).toBe("ja");
    expect(psaLanguage("2025 POKEMON DRI EN")).toBe("en");
    expect(psaLanguage("2022 POKEMON CSM1a CS")).toBeNull();
  });
});
