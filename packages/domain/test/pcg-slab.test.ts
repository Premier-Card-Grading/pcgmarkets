import { describe, it, expect } from "vitest";
import { readSlabLabel, pickCert, resolveCert, matchSlab, type PcgCert, type SlabLabel } from "../src/pcg-slab";
import { InMemoryCatalog, type ProductRef, type SetRef } from "../src/catalog-index";

// Real OCR of a Premier slab photo (eBay item 198713883832), lines joined by the OCR tool.
const LYCANROC = "PCG|Lycanroc|MEGA: 30th Celebration | Alternate Art Illustration Rare|9.5|CENTERING|10|CORNERS|10|EDGES|9.5|SURFACE|Gem Mint|10|STAceT Lycanroe|Evolves from Rockruf|$130|Counter|10+|J 30CEi)138/128|retreat";
const lines = (ocr: string) => ocr.split(/(?<! )\|(?! )/);

const cert = (o: Partial<PcgCert>): PcgCert => ({ id: "000000001", name: "Lycanroc", set: "MEGA: 30th Celebration", num: "138/128", lang: "English", rarity: "Illustration Rare", fin: 10, c: 9.5, co: 10, e: 10, s: 9.5, grade: "Gem Mint", done: "2026-10-09T00:00:00Z", ...o });
const SOLD = new Date("2026-10-20T23:59:59Z");

describe("readSlabLabel", () => {
  it("reads PCG's card name, set, rarity and grades from a Premier label", () => {
    expect(readSlabLabel(lines(LYCANROC))).toEqual({ kind: "premier", label: { name: "Lycanroc", set: "MEGA: 30th Celebration", rarity: "Alternate Art Illustration Rare", grades: [9.5, 10, 10, 9.5, 10], gradeWord: "Gem Mint" } });
  });
  it("reads the grade word through OCR slips", () => {
    expect(readSlabLabel(["Slaking ex", "S&V: Surging Sparke| Full Art Uitra Rare", "Gemn Miud", "10", "9.5"])).toMatchObject({ label: { gradeWord: "Gem Mint" } });
    expect(readSlabLabel(["Onix", "Wizards: Black Star Promos | Non-Holo Promo", "NM-Mint+", "8.5", "8.5"])).toMatchObject({ label: { gradeWord: "NM-Mint+" } });
  });
  it("recognises the unrelated Chinese 'PCG' slab", () => {
    expect(readSlabLabel(lines("•@slabsharksinc|S|PIPCG|PROFESSIONAL CARD GRADING|2023 POKEMON CHN.|[CSDC]POKEBALL GIFT BOX: PIKA.|PIKACHU|001/024|10845213|10|GEM-MT+")).kind).toBe("chinese_pcg");
    expect(readSlabLabel(lines("PIPCG|2025 POKEMON JPN.|TARUKA READING CARD|CHARCADET|0|11041954|10*|PRISTINE")).kind).toBe("chinese_pcg");
  });
  it("reads the set line however OCR renders the bar", () => {
    const read = (set: string) => readSlabLabel(["PCK", "Dedenne", set, "9.5", "CENTERING", "10"]);
    expect(read("MEGA: Perfect Order| Altemnate Art Illustration Rare")).toMatchObject({ kind: "premier", label: { name: "Dedenne", set: "MEGA: Perfect Order", rarity: "Altemnate Art Illustration Rare" } });
    expect(read("MEGA: Chaos Rising I Full Art Ultra Rare")).toMatchObject({ kind: "premier", label: { set: "MEGA: Chaos Rising", rarity: "Full Art Ultra Rare" } });
  });
  it("reads the cert number off an older Premier label", () => {
    expect(readSlabLabel(["NONE", "PCG", "LEDIAN", "POKEMON", "STELLAR CROWN 2024", "144/142 ILLUSTRATION RARE", "9", "20298", "STAGEJ"])).toMatchObject({ kind: "premier_old", numbers: ["20298"] });
  });
  it("finds no label in a photo of the card's back or text", () => {
    expect(readSlabLabel(lines("STAGEJ|Toxtricity|Evolves from To›|#1400|Ability|Sinister Surge")).kind).toBe("no_label");
  });
});

describe("pickCert", () => {
  const label: SlabLabel = { name: "Lycanroc", set: "MEGA: 30th Celebration", rarity: "Alternate Art Illustration Rare", grades: [9.5, 10, 10, 9.5, 10] };
  it("takes the one cert whose grades contain every grade read", () => {
    const r = pickCert(label, [cert({ id: "A" }), cert({ id: "B", c: 8, s: 8 })], LYCANROC, SOLD);
    expect(r).toMatchObject({ status: "cert", certs: [{ id: "A" }] });
  });
  it("uses the number printed on the card when PCG has the same name twice in a set", () => {
    const r = pickCert(label, [cert({ id: "A", num: "113/103" }), cert({ id: "B" })], LYCANROC, SOLD);
    expect(r).toMatchObject({ status: "cert", certs: [{ id: "B" }] });
  });
  it("accepts a label printing only the series ('MEGA') when the card's printed number agrees", () => {
    const short = { ...label, set: "MEGA" };
    expect(pickCert(short, [cert({})], "138/128", SOLD)).toMatchObject({ status: "cert", certs: [{ id: "000000001" }] });
  });
  it("does not accept a series-only set without the card's number to back it", () => {
    const short = { ...label, set: "MEGA" };
    expect(pickCert(short, [cert({})], "", SOLD).status).toBe("label_not_in_pcg");
    expect(pickCert(short, [cert({ num: "113/103" })], "138/128", SOLD).status).toBe("label_not_in_pcg");
    expect(pickCert(short, [cert({ set: "MEGAMI Collection" })], "138/128", SOLD).status).toBe("label_not_in_pcg");
  });
  it("refuses when the card's printed number disagrees with every cert", () => {
    expect(pickCert(label, [cert({ num: "113/103" })], LYCANROC, SOLD).status).toBe("card_number_conflict");
  });
  it("ignores certs graded after the sale", () => {
    expect(pickCert(label, [cert({ done: "2026-10-25T00:00:00Z" })], LYCANROC, SOLD).status).toBe("label_not_in_pcg");
  });
  it("reports a shared cert when several identical-grade slabs are the same card", () => {
    expect(pickCert(label, [cert({ id: "A" }), cert({ id: "B" })], LYCANROC, SOLD)).toMatchObject({ status: "card_certain_cert_shared" });
  });
  it("keeps only certs with the label's grade word: an OCR-dropped 9.5 must not turn Gem Mint into Pristine", () => {
    // Real case (eBay 407243713059): label 9.5/10/10/9.5 Gem Mint 10, OCR read 10, 10, 9.5, 10.
    const snorunt: SlabLabel = { name: "Snorunt", set: "MEGA: MEGA Dream ex", rarity: "Holo Art Rare", grades: [10, 10, 9.5, 10], gradeWord: "Gem Mint" };
    const pristine = cert({ name: "Snorunt", set: "MEGA: MEGA Dream ex", num: "200/193", lang: "Japanese", rarity: null, c: 10, co: 10, e: 10, s: 9.5, grade: "Pristine" });
    expect(pickCert(snorunt, [pristine], "", SOLD).status).toBe("grades_unreadable_or_mismatch");
    expect(pickCert(snorunt, [pristine, { ...pristine, id: "G", c: 9.5, grade: "Gem Mint" }], "", SOLD)).toMatchObject({ status: "cert", certs: [{ id: "G" }] });
  });
  it("needs at least two grades read", () => {
    expect(pickCert({ ...label, grades: [10] }, [cert({})], LYCANROC, SOLD).status).toBe("grades_unreadable_or_mismatch");
  });
});

describe("resolveCert", () => {
  const sets: SetRef[] = [
    { id: "30th", printedCode: null, language: "en", cardCount: 128, nameEn: "30th Celebration", nameJa: null, aliases: [] },
    { id: "me02", printedCode: null, language: "en", cardCount: 94, nameEn: "Phantasmal Flames", nameJa: null, aliases: [] },
    { id: "mep", printedCode: null, language: "en", cardCount: null, nameEn: "MEP Black Star Promos", nameJa: null, aliases: [] },
    { id: "xyp", printedCode: null, language: "en", cardCount: null, nameEn: "XY Black Star Promos", nameJa: null, aliases: [] },
    { id: "swsh4.5sv", printedCode: null, language: "en", cardCount: 122, nameEn: "Shining Fates Shiny Vault", nameJa: null, aliases: [] },
    { id: "ecard3", printedCode: null, language: "en", cardCount: 144, nameEn: "Skyridge", nameJa: null, aliases: [] },
    { id: "ex14", printedCode: null, language: "en", cardCount: 100, nameEn: "Crystal Guardians", nameJa: null, aliases: [] },
    { id: "PMCG1", printedCode: null, language: "ja", cardCount: 102, nameEn: "Expansion Pack (Base Set)", nameJa: null, aliases: [] },
    { id: "PMCG2", printedCode: null, language: "ja", cardCount: 48, nameEn: "Pokémon Jungle", nameJa: null, aliases: [] },
  ];
  const p = (id: string, setId: string, num: number | null, denom: number | null, printed: string, nameEn: string): ProductRef => ({ id, setId, numberNum: num, numberDenom: denom, numberSuffix: null, language: "en", numberPrinted: printed, nameEn });
  const catalog = new InMemoryCatalog(sets, [
    p("30th-138", "30th", 138, 128, "138/128", "Lycanroc"),
    p("me02-138", "me02", 138, 94, "138/094", "Lycanroc"),
    p("mep-038", "mep", 38, null, "038", "Charmander"),
    p("xyp-XY141", "xyp", null, null, "XY141", "Rayquaza"),
    p("mep-032", "mep", 32, null, "032", "Mega Gardevoir ex"),
    p("swsh4.5sv-SV119", "swsh4.5sv", null, null, "SV119", "Ditto VMAX"),
    p("ecard3-H32", "ecard3", null, null, "H32", "Xatu"),
    p("ex14-6", "ex14", 6, 100, "6/100", "Ludicolo δ"),
    p("30th-081", "30th", 81, 128, "081/128", "Roxie's Performance"),
    { ...p("PMCG1-46", "PMCG1", 46, null, "046", "Kadabra"), language: "ja" },
    { ...p("PMCG2-60", "PMCG2", 60, null, "060", "Pikachu"), language: "ja" },
    { ...p("PMCG2-61", "PMCG2", 61, null, "061", "Pikachu"), language: "ja" },
  ]);
  it("matches by language, number total and exact card name", () => {
    expect(resolveCert(cert({}), catalog)).toMatchObject({ status: "matched", product: { id: "30th-138" } });
  });
  it("matches PCG's black-star promo sets to ours", () => {
    expect(resolveCert(cert({ name: "Charmander", set: "MEGA: Black Star Promos", num: "038" }), catalog)).toMatchObject({ product: { id: "mep-038" } });
    expect(resolveCert(cert({ name: "Rayquaza", set: "XY: Black Star Promos", num: "XY141", lang: null }), catalog)).toMatchObject({ product: { id: "xyp-XY141" } });
  });
  it("reads letter-prefixed numbers (SV119/SV122, H32/H32) and checks the set family", () => {
    expect(resolveCert(cert({ name: "Ditto VMAX", set: "S&S: Shining Fates", num: "SV119/SV122" }), catalog)).toMatchObject({ status: "matched", product: { id: "swsh4.5sv-SV119" } });
    expect(resolveCert(cert({ name: "Xatu", set: "Skyridge", num: "H32/H32" }), catalog)).toMatchObject({ product: { id: "ecard3-H32" } });
    expect(resolveCert(cert({ name: "Xatu", set: "Aquapolis", num: "H32/H32" }), catalog).status).toBe("set_disagrees");
  });
  it("ignores a trailing bracketed note, apostrophes and the delta mark in names, never the name itself", () => {
    expect(resolveCert(cert({ name: "Mega Gardevoir ex (032)", set: "MEGA: Black Star Promos", num: "032", lang: null }), catalog)).toMatchObject({ product: { id: "mep-032" } });
    expect(resolveCert(cert({ name: "Ludicolo", set: "EX: Crystal Guardians", num: "6/100" }), catalog)).toMatchObject({ product: { id: "ex14-6" } });
    expect(resolveCert(cert({ name: "Roxies Performance", num: "081/128" }), catalog)).toMatchObject({ product: { id: "30th-081" } });
    expect(resolveCert(cert({ name: "Roxie Performance", num: "081/128" }), catalog)).toMatchObject({ product: { id: "30th-081" } });
    expect(resolveCert(cert({ name: "Ludicolo ex", set: "EX: Crystal Guardians", num: "6/100" }), catalog).status).toBe("no_product_with_name_and_number");
  });
  it("matches Japanese vintage certs (PCG records the Pokédex number) by the one card of that name in the set", () => {
    expect(resolveCert(cert({ name: "Kadabra", set: "Base Set Expansion Pack", num: "No. 064", lang: "Japanese" }), catalog)).toMatchObject({ status: "matched", product: { id: "PMCG1-46" } });
    expect(resolveCert(cert({ name: "Pikachu", set: "Pokémon Jungle", num: "No. 025", lang: "Japanese" }), catalog).status).toBe("ambiguous_product");
    expect(resolveCert(cert({ name: "Kadabra", set: "Topsun Blue-Back", num: "No. 064", lang: "Japanese" }), catalog).status).toBe("unparsed_number");
  });
  it("never matches when the card name differs", () => {
    expect(resolveCert(cert({ name: "Lycanroc V" }), catalog).status).toBe("no_product_with_name_and_number");
  });
  it("leaves 1st Edition and Shadowless runs for review: our catalogue has one product for every run", () => {
    expect(resolveCert(cert({ set: "Gym Challenge 1st Edition" }), catalog).status).toBe("edition_not_in_catalogue");
    expect(resolveCert(cert({ set: "Base Set Shadowless " }), catalog).status).toBe("edition_not_in_catalogue");
  });
  it("leaves Chinese and other languages for review", () => {
    expect(resolveCert(cert({ lang: "Chinese" }), catalog).status).toBe("language_not_in_catalogue");
  });

  it("matchSlab: a single cert gives product, PCG's grade and the cert id; a Chinese slab is rejected", () => {
    expect(matchSlab({ status: "cert", certs: [cert({ id: "000361156" })] }, catalog)).toMatchObject({ state: "matched", productId: "30th-138", gradeValue: 10, gradeLabel: "Gem Mint", certId: "000361156", matchMethod: "cert" });
    expect(matchSlab({ status: "chinese_pcg", certs: [] }, catalog)).toMatchObject({ state: "rejected", reviewReason: "not_premier_pcg" });
    expect(matchSlab(undefined, catalog)).toMatchObject({ state: "needs_review", reviewReason: "no_cert" });
  });
  it("matchSlab: a 10 whose grade word wasn't read is not given a tier", () => {
    const label = { name: "Lycanroc", set: "MEGA: 30th Celebration", rarity: null, grades: [10, 10], gradeWord: null };
    expect(matchSlab({ status: "cert", certs: [cert({})], label }, catalog)).toMatchObject({ state: "needs_review", reviewReason: "cert_grade_unknown" });
  });
  it("matchSlab: shared certs give the card but no cert id, and only when they share the grade", () => {
    expect(matchSlab({ status: "card_certain_cert_shared", certs: [cert({ id: "A" }), cert({ id: "B" })] }, catalog)).toMatchObject({ state: "matched", productId: "30th-138", certId: null });
    expect(matchSlab({ status: "card_certain_cert_shared", certs: [cert({ id: "A" }), cert({ id: "B", fin: 9.5 })] }, catalog)).toMatchObject({ state: "needs_review", reviewReason: "cert_grade_unknown" });
  });
});
