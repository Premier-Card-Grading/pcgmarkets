import { describe, it, expect } from "vitest";
import { translateJaCardName } from "../src/names/translate";

describe("translateJaCardName", () => {
  it("translates plain species", () => { expect(translateJaCardName("ピカチュウ")).toBe("Pikachu"); });
  it("keeps suffixes", () => {
    expect(translateJaCardName("リザードンex")).toBe("Charizard ex");
    expect(translateJaCardName("ディアルガLV.X")).toBe("Dialga LV.X");
    expect(translateJaCardName("ミュウ☆")).toBe("Mew ☆");
  });
  it("handles owner and form prefixes", () => {
    expect(translateJaCardName("ロケット団のミュウツー")).toBe("Rocket's Mewtwo");
    expect(translateJaCardName("わるいリザードン")).toBe("Dark Charizard");
    expect(translateJaCardName("カスミのスターミー")).toBe("Misty's Starmie");
  });
  it("uses the dictionary for Trainers and Energy", () => {
    expect(translateJaCardName("オーキド博士")).toBe("Professor Oak");
    expect(translateJaCardName("基本超エネルギー")).toBe("Basic Psychic Energy");
  });
  it("knows common XY and Sun & Moon Trainers", () => {
    expect(translateJaCardName("モンスターボール")).toBe("Poké Ball");
    expect(translateJaCardName("プラターヌ博士")).toBe("Professor Sycamore");
    expect(translateJaCardName("基本フェアリーエネルギー")).toBe("Basic Fairy Energy");
  });
  it("uses official English spellings from the generator overrides", () => {
    expect(translateJaCardName("ニドラン♀")).toBe("Nidoran ♀");
    expect(translateJaCardName("ニドラン♂")).toBe("Nidoran ♂");
    expect(translateJaCardName("カモネギ")).toBe("Farfetch'd");
  });
  it("handles card-type suffixes", () => {
    expect(translateJaCardName("フシギバナEX")).toBe("Venusaur-EX");
    expect(translateJaCardName("ミュウVMAX")).toBe("Mew VMAX");
    expect(translateJaCardName("ザシアンV")).toBe("Zacian V");
    expect(translateJaCardName("ゲッコウガBREAK")).toBe("Greninja BREAK");
    expect(translateJaCardName("ウルトラネクロズマGX")).toBeNull();
  });
  it("handles Mega, Primal, Black/White and regional prefixes", () => {
    expect(translateJaCardName("メガフシギバナEX")).toBe("M Venusaur-EX");
    expect(translateJaCardName("メガニウム")).toBe("Meganium");
    expect(translateJaCardName("メガヤンマBREAK")).toBe("Yanmega BREAK");
    expect(translateJaCardName("ゲンシグラードンEX")).toBe("Primal Groudon-EX");
    expect(translateJaCardName("ブラックキュレムEX")).toBe("Black Kyurem-EX");
    expect(translateJaCardName("ホワイトキュレム")).toBe("White Kyurem");
    expect(translateJaCardName("ガラル ギャロップV")).toBe("Galarian Rapidash V");
  });
  it("handles tag teams", () => {
    expect(translateJaCardName("ピカチュウ&ゼクロムGX")).toBe("Pikachu & Zekrom-GX");
    expect(translateJaCardName("アルセウス&ディアルガ&パルキアGX")).toBe("Arceus & Dialga & Palkia-GX");
    expect(translateJaCardName("ピカチュウ&なぞGX")).toBeNull();
  });
  it("ignores surrounding whitespace", () => { expect(translateJaCardName(" ピカチュウ ")).toBe("Pikachu"); });
  it("returns null when any part is unknown, never a partial name", () => {
    expect(translateJaCardName("なぞのカード")).toBeNull();
    expect(translateJaCardName("ピカチュウなぞ")).toBeNull();
    expect(translateJaCardName("")).toBeNull();
    expect(translateJaCardName(null)).toBeNull();
    expect(translateJaCardName("ロケット団のなぞ")).toBeNull();
  });
  it("does not match inherited object keys", () => {
    expect(translateJaCardName("constructor")).toBeNull();
    expect(translateJaCardName("toString")).toBeNull();
    expect(translateJaCardName("__proto__")).toBeNull();
  });
});
