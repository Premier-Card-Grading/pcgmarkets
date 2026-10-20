import { describe, it, expect } from "vitest";
import { toSetRow, toProductRows, isDigitalOnly, catalogSetId, supplementSetRow, JA_SUPPLEMENT_SETS, isMislabelledJa, type TcgdexSet } from "../src/tcgdex";
import ja from "./fixtures/tcgdex-set-SV1a.json";
import en from "./fixtures/tcgdex-set-sv04.5.json";

describe("tcgdex mapping", () => {
  it("maps a JA set: id is the printed code, name_ja set, card_count = official", () => {
    const row = toSetRow("ja", ja as TcgdexSet);
    expect(row).toMatchObject({ id: "SV1a", printed_code: "SV1a", language: "ja", name_ja: "トリプレットビート", name_en: null, card_count: 73, release_date: "2023-03-10" });
  });
  it("maps an EN set: printed_code from abbreviation, alias includes it", () => {
    const row = toSetRow("en", en as TcgdexSet);
    expect(row).toMatchObject({ id: "sv04.5", printed_code: "PAF", language: "en", name_en: "Paldean Fates", card_count: 91 });
    expect(row.aliases).toContain("PAF");
  });
  it("maps cards to products with printed numbers and image URLs", () => {
    const rows = toProductRows("ja", ja as TcgdexSet);
    expect(rows[0]).toMatchObject({ id: "SV1a-001", set_id: "SV1a", number_printed: "001/073", number_num: 1, number_denom: 73, name_ja: "トロピウス", language: "ja", image_url: "https://assets.tcgdex.net/ja/SV/SV1a/001/high.webp" });
  });
  it("promo sets carry the suffix", () => {
    const promo: TcgdexSet = { id: "SV-P", name: "SVプロモ", releaseDate: null, cardCount: { total: 10, official: 0 }, cards: [{ id: "SV-P-001", localId: "001", name: "x", image: "https://assets.tcgdex.net/ja/SV/SV-P/001" }] };
    expect(toProductRows("ja", promo)[0]).toMatchObject({ number_printed: "001/SV-P", number_denom: null, number_suffix: "SV-P" });
  });
  it("keeps non-numeric localIds as products with null number_num", () => {
    const vintage: TcgdexSet = { id: "base1", name: "Base", releaseDate: null, cardCount: { total: 1, official: 102 }, cards: [{ id: "base1-x", localId: "Charizard", name: "Charizard", image: null }] };
    expect(toProductRows("en", vintage)[0]).toMatchObject({ number_printed: "Charizard", number_num: null });
  });
  it("drops TCG Pocket (digital-only) sets", () => {
    expect(isDigitalOnly({ ...(en as TcgdexSet), serie: { id: "tcgp", name: "Pokémon TCG Pocket" } })).toBe(true);
    expect(isDigitalOnly(en as TcgdexSet)).toBe(false);
  });
  it("prefixes JA set ids that collide with EN ids, and their products", () => {
    const enIds = new Set(["neo1", "sv04.5"]);
    expect(catalogSetId("ja", "neo1", enIds)).toBe("ja-neo1");
    expect(catalogSetId("en", "neo1", enIds)).toBe("neo1");
    expect(catalogSetId("ja", "SV1a", enIds)).toBe("SV1a");
    const neo: TcgdexSet = { id: "neo1", name: "金、銀、新世界へ...", releaseDate: "1999-11-19", cardCount: { total: 1, official: 96 }, cards: [{ id: "neo1-1", localId: "1", name: "x", image: null }] };
    expect(toSetRow("ja", neo, "ja-neo1")).toMatchObject({ id: "ja-neo1", printed_code: "neo1", aliases: ["neo1"], language: "ja" });
    expect(toProductRows("ja", neo, "ja-neo1")[0]).toMatchObject({ id: "ja-neo1-1", set_id: "ja-neo1" });
  });
  it("supplement sets are unique, Japanese, and become card-less set rows", () => {
    const ids = JA_SUPPLEMENT_SETS.map((s) => s.id.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("bw3b");
    expect(ids).not.toContain("cs4.5");
    expect(supplementSetRow(JA_SUPPLEMENT_SETS.find((s) => s.id === "DP1a")!)).toEqual({ id: "DP1a", printed_code: "DP1a", language: "ja", name_en: null, name_ja: "時空の創造: ダイヤモンドコレクション", release_date: "2006-11-30", card_count: 117, aliases: [] });
  });
  it("skips Chinese CS sets listed under ja and fixes the CP5 name", () => {
    expect(isMislabelledJa("ja", "CS2a")).toBe(true);
    expect(isMislabelledJa("ja", "CP5")).toBe(false);
    expect(isMislabelledJa("en", "CS2a")).toBe(false);
    const cp5: TcgdexSet = { id: "CP5", name: "冷酷の反逆者", releaseDate: "2016-06-17", cardCount: { total: 36, official: 36 }, cards: [] };
    expect(toSetRow("ja", cp5).name_ja).toBe("幻・伝説ドリームキラコレクション");
  });
});
