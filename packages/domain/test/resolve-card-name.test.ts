import { describe, it, expect } from "vitest";
import { levenshtein, normaliseLimitlessEn, resolveCardNameEn } from "../src/names/resolve";

const r = (i: Parameters<typeof resolveCardNameEn>[0]) => resolveCardNameEn(i).nameEn;

describe("normaliseLimitlessEn", () => {
  it("accents the word Pokémon", () => {
    expect(normaliseLimitlessEn("Pokemon Catcher")).toBe("Pokémon Catcher");
    expect(normaliseLimitlessEn("Pokemon Center Lady")).toBe("Pokémon Center Lady");
    expect(normaliseLimitlessEn("Pokémon Catcher")).toBe("Pokémon Catcher");
  });
  it("uses the official spacing for V, VMAX and VSTAR but keeps -EX and -GX", () => {
    expect(normaliseLimitlessEn("Zacian-V")).toBe("Zacian V");
    expect(normaliseLimitlessEn("Dragapult-VMAX")).toBe("Dragapult VMAX");
    expect(normaliseLimitlessEn("Arceus-VSTAR")).toBe("Arceus VSTAR");
    expect(normaliseLimitlessEn("Tapu Koko-V")).toBe("Tapu Koko V");
    expect(normaliseLimitlessEn("Charizard-EX")).toBe("Charizard-EX");
    expect(normaliseLimitlessEn("Honchkrow-GX")).toBe("Honchkrow-GX");
  });
  it("writes Prism Star as ◇, but leaves Prism Energy alone", () => {
    expect(normaliseLimitlessEn("Lysandre Prism Star")).toBe("Lysandre ◇");
    expect(normaliseLimitlessEn("Prism Energy")).toBe("Prism Energy");
  });
  it("trims and maps empty to null", () => {
    expect(normaliseLimitlessEn("  Pikachu  ")).toBe("Pikachu");
    expect(normaliseLimitlessEn("")).toBeNull();
    expect(normaliseLimitlessEn(null)).toBeNull();
  });
});

describe("levenshtein", () => {
  it("counts code points", () => {
    expect(levenshtein("Bayleaf", "Bayleef")).toBe(1);
    expect(levenshtein("Flabebe", "Flabébé")).toBe(2);
    expect(levenshtein("Golking", "Seaking")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });
});

describe("resolveCardNameEn: Limitless vs dictionary", () => {
  it("uses the name when both agree", () => {
    expect(r({ nameJa: "ピカチュウ", limitlessEn: "Pikachu" })).toBe("Pikachu");
  });
  it("prefers Limitless when it only adds tokens to the dictionary name", () => {
    expect(r({ nameJa: "ピカチュウ", limitlessEn: "Pikachu on the Ball" })).toBe("Pikachu on the Ball");
  });
  it("fixes Limitless typos within two edits with the dictionary spelling", () => {
    expect(r({ nameJa: "ベイリーフ", limitlessEn: "Bayleaf", series: "Sun & Moon" })).toBe("Bayleef");
    expect(r({ nameJa: "フラベベ", limitlessEn: "Flabebe" })).toBe("Flabébé");
    expect(r({ nameJa: "ゴンベ", limitlessEn: "Muchlax" })).toBe("Munchlax");
    expect(r({ nameJa: "ホウオウ", limitlessEn: "Ho-oh" })).toBe("Ho-Oh");
    expect(r({ nameJa: "コライドン", limitlessEn: "Kuraidon" })).toBe("Koraidon");
    expect(r({ nameJa: "モクロー", limitlessEn: "Rowlett" })).toBe("Rowlet");
    expect(r({ nameJa: "ドンカラスGX", limitlessEn: "Honchcrow-GX" })).toBe("Honchkrow-GX");
    expect(r({ nameJa: "ニドラン♀", limitlessEn: "Nidoran♀" })).toBe("Nidoran ♀");
  });
  it("normalises Limitless style first: Zacian-V -> Zacian V, Pokemon -> Pokémon", () => {
    expect(r({ nameJa: "ザシアンV", limitlessEn: "Zacian-V", series: "Sword & Shield" })).toBe("Zacian V");
    expect(r({ nameJa: "ポケモンキャッチャー", limitlessEn: "Pokemon Catcher" })).toBe("Pokémon Catcher");
    expect(r({ nameJa: "なぞのカード", limitlessEn: "Tapu Koko-V" })).toBe("Tapu Koko V");
  });
  it("drops and reports a disagreement it cannot explain", () => {
    const out = resolveCardNameEn({ nameJa: "アズマオウ", limitlessEn: "Golking", previous: "Golking" });
    expect(out.nameEn).toBeNull();
    expect(out.note).toMatch(/Golking.*Seaking/);
    expect(r({ nameJa: "アローラサンドパンGX", limitlessEn: "Alolan Sandslash" })).toBeNull();
  });
  it("uses whichever of the two is present", () => {
    expect(r({ nameJa: "ピカチュウ", limitlessEn: null })).toBe("Pikachu");
    expect(r({ nameJa: "なぞのカード", limitlessEn: "Mystery Card" })).toBe("Mystery Card");
    expect(r({ nameJa: "なぞのカード", limitlessEn: null })).toBeNull();
  });
});

describe("resolveCardNameEn: swapped Limitless names (M6-098 / M6-099)", () => {
  it("drops an English name that the dictionary gives to a different Japanese card", () => {
    const vest = resolveCardNameEn({ nameJa: "とくちゅうチョッキ", limitlessEn: "Pokemon Catcher", series: "Mega", previous: "Pokemon Catcher" });
    expect(vest.nameEn).toBeNull();
    expect(vest.note).toMatch(/ポケモンキャッチャー/);
  });
  it("drops a Limitless name that disagrees with a certain dictionary name", () => {
    const catcher = resolveCardNameEn({ nameJa: "ポケモンキャッチャー", limitlessEn: "Special Vest", series: "Mega", previous: "Special Vest" });
    expect(catcher.nameEn).toBeNull();
    expect(catcher.note).toMatch(/Special Vest/);
  });
  it("compares Japanese names width-insensitively (ポリゴン2 / ポリゴン２)", () => {
    expect(resolveCardNameEn({ nameJa: "ポリゴン2", limitlessEn: "Porygon2", previous: "Porygon2" })).toEqual({ nameEn: "Porygon2", note: null });
    expect(r({ nameJa: "ポリゴンZ", limitlessEn: "Porygon-Z" })).toBe("Porygon-Z");
  });
  it("does not treat an English name_ja row as a swap", () => {
    expect(r({ nameJa: "Magikarp", limitlessEn: "Magikarp" })).toBe("Magikarp");
  });
});

describe("resolveCardNameEn: Mega Evolution (XY2-055)", () => {
  const mega = "N Mega Evolution";
  it("adds the M that Limitless drops from the Japanese name", () => {
    expect(r({ nameJa: "リザードンEX", limitlessEn: null, type: mega, series: "XY" })).toBe("M Charizard-EX");
    expect(r({ nameJa: "リザードンEX", limitlessEn: "Charizard-EX", type: mega, series: "XY" })).toBe("M Charizard-EX");
    expect(r({ nameJa: "メガリザードンEX", limitlessEn: "M Charizard-EX", type: mega })).toBe("M Charizard-EX");
  });
  it("corrects an existing name that lacks the M", () => {
    const out = resolveCardNameEn({ nameJa: "なぞEX", limitlessEn: null, type: mega, previous: "Charizard-EX" });
    expect(out.nameEn).toBe("M Charizard-EX");
    expect(out.note).toBeTruthy();
  });
  it("leaves Primal Reversion alone even though Limitless types it Mega Evolution", () => {
    expect(r({ nameJa: "ゲンシグラードンEX", limitlessEn: null, type: "F Mega Evolution", series: "XY" })).toBe("Primal Groudon-EX");
    expect(r({ nameJa: "ゲンシカイオーガEX", limitlessEn: null, type: "W Mega Evolution", previous: "M Primal Kyogre-EX" })).toBe("Primal Kyogre-EX");
  });
  it("keeps Scarlet & Violet era Mega ex names", () => {
    expect(r({ nameJa: "メガリザードンXex", limitlessEn: "Mega Charizard X ex", type: "R Mega Evolution", series: "Mega" })).toBe("Mega Charizard X ex");
  });
  it("gives no name when the base is not an -EX", () => {
    const out = resolveCardNameEn({ nameJa: "リザードン", limitlessEn: null, type: mega, previous: "Charizard" });
    expect(out.nameEn).toBeNull();
    expect(out.note).toBeTruthy();
  });
  it("never decides Mega from the dictionary alone", () => {
    expect(r({ nameJa: "リザードンEX", limitlessEn: null, type: "R Basic", series: "XY" })).toBe("Charizard-EX");
  });
});

describe("resolveCardNameEn: Prism Star", () => {
  it("takes ◇ from the Limitless English name (SM8-015 Celebi, SM8-092 Lusamine)", () => {
    expect(r({ nameJa: "セレビィ", limitlessEn: "Celebi Prism Star", type: "G Basic", series: "Sun & Moon" })).toBe("Celebi ◇");
    expect(r({ nameJa: "ルザミーネ", limitlessEn: "Lusamine Prism Star", type: "Supporter", series: "Sun & Moon" })).toBe("Lusamine ◇");
    expect(r({ nameJa: "ヒートファクトリー", limitlessEn: "Heat Factory Prism Star", type: "Stadium" })).toBe("Heat Factory ◇");
  });
  it("adds ◇ to the dictionary name when the rarity or type says Prism Star", () => {
    expect(r({ nameJa: "フラダリ", limitlessEn: null, rarity: "Prism Star" })).toBe("Lysandre ◇");
  });
  it("rewrites an existing 'Prism Star' name in our ◇ convention", () => {
    expect(r({ nameJa: "なぞ", limitlessEn: null, previous: "Tapu Koko Prism Star" })).toBe("Tapu Koko ◇");
  });
});

describe("resolveCardNameEn: era-scoped names", () => {
  it("SMD-010: no invented Rocket's Mimikyu-GX in Sun & Moon", () => {
    const out = resolveCardNameEn({ nameJa: "ロケット団のミミッキュGX", limitlessEn: null, series: "Sun & Moon", previous: "Rocket's Mimikyu-GX" });
    expect(out.nameEn).toBeNull();
    expect(out.note).toBeTruthy();
  });
  it("Team Rocket's in Scarlet & Violet and Mega, Rocket's in the Gym era", () => {
    expect(r({ nameJa: "ロケット団のミュウツーex", limitlessEn: "Team Rocket's Mewtwo ex", series: "Scarlet & Violet" })).toBe("Team Rocket's Mewtwo ex");
    expect(r({ nameJa: "ロケット団のミュウツーex", limitlessEn: null, series: "Mega" })).toBe("Team Rocket's Mewtwo ex");
    expect(r({ nameJa: "ロケット団のサンダー", limitlessEn: null, series: "Original era" })).toBe("Rocket's Zapdos");
  });
  it("corrects a retired Super Potion", () => {
    const out = resolveCardNameEn({ nameJa: "すごいきずぐすり", limitlessEn: null, series: "Original era", previous: "Super Potion" });
    expect(out.nameEn).toBeNull();
    expect(out.note).toBeTruthy();
    expect(r({ nameJa: "すごいきずぐすり", limitlessEn: "Hyper Potion", series: "Sword & Shield" })).toBe("Hyper Potion");
  });
});

describe("resolveCardNameEn: previous name", () => {
  it("keeps a previous name nothing contradicts, silently", () => {
    expect(resolveCardNameEn({ nameJa: "なぞ", limitlessEn: null, previous: "Kept Name" })).toEqual({ nameEn: "Kept Name", note: null });
  });
  it("never writes null over a name without a note", () => {
    const out = resolveCardNameEn({ nameJa: "なぞ", limitlessEn: null, previous: null });
    expect(out).toEqual({ nameEn: null, note: null });
  });
});
