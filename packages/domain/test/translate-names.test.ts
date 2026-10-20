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
  it("ignores surrounding whitespace", () => { expect(translateJaCardName(" ピカチュウ ")).toBe("Pikachu"); });
  it("returns null when any part is unknown, never a partial name", () => {
    expect(translateJaCardName("なぞのカード")).toBeNull();
    expect(translateJaCardName("ピカチュウなぞ")).toBeNull();
    expect(translateJaCardName("")).toBeNull();
    expect(translateJaCardName(null)).toBeNull();
  });
});
