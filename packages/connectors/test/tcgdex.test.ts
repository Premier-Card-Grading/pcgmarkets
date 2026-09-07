import { describe, it, expect } from "vitest";
import { toSetRow, toProductRows, type TcgdexSet } from "../src/tcgdex";
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
});
