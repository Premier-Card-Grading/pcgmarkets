import { describe, it, expect } from "vitest";
import { mergeLimitlessCards } from "../src/limitless-merge";

const existing = [
  { id: "SV11B-001", number_num: 1, number_suffix: null, image_url: null },
  { id: "SV11B-002", number_num: 2, number_suffix: null, image_url: "https://assets.tcgdex.net/x" },
  { id: "SV11B-x", number_num: null, number_suffix: null, image_url: null },
];
const card = (number: string, nameEn: string | null = "N") => ({ number, nameJa: "ジャ", nameEn, rarity: "Common", imageXs: `https://cdn/tpc/SV11B/SV11B_${number}_R_JP_XS.png` });

describe("mergeLimitlessCards", () => {
  it("matches by number and keeps our id", () => {
    const [a] = mergeLimitlessCards("SV11B", existing, [card("1", "Snivy")]);
    expect(a).toMatchObject({ id: "SV11B-001", isNew: false, name_en: "Snivy", rarity: "Common", hasImage: false });
  });
  it("reports an existing image so it is not replaced", () => {
    expect(mergeLimitlessCards("SV11B", existing, [card("2")])[0]).toMatchObject({ id: "SV11B-002", hasImage: true });
  });
  it("adds unmatched cards with a padded id", () => {
    expect(mergeLimitlessCards("SV11B", existing, [card("173", "N's Plot")])[0]).toMatchObject({ id: "SV11B-173", isNew: true, number: "173" });
  });
  it("never merges a non-numeric number into a numeric card", () => {
    expect(mergeLimitlessCards("SV11B", existing, [card("TG01")])[0]).toMatchObject({ id: "SV11B-TG01", isNew: true });
  });
  it("keeps a null English name rather than inventing one", () => {
    expect(mergeLimitlessCards("SV11B", existing, [card("1", null)])[0]!.name_en).toBeNull();
  });
});
