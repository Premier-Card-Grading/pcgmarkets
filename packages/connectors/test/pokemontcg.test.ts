import { describe, it, expect } from "vitest";
import { matchImages, ptcgSetId } from "../src/pokemontcg";

describe("pokemontcg", () => {
  it("maps set ids that differ", () => {
    expect(ptcgSetId("swsh4.5sv")).toBe("swsh45sv");
    expect(ptcgSetId("tk-ex-latia")).toBe("tk1a");
    expect(ptcgSetId("swshp")).toBe("swshp");
  });
  it("matches by number, ignoring leading zeros and case", () => {
    const ours = [
      { id: "swshp-SWSH050", number_printed: "SWSH050", number_num: null },
      { id: "svp-001", number_printed: "001/SVP", number_num: 1 },
      { id: "svp-999", number_printed: "999", number_num: 999 },
    ];
    const theirs = [{ number: "SWSH050", small: "https://images.pokemontcg.io/swshp/SWSH050.png" }, { number: "1", small: "https://images.pokemontcg.io/svp/1.png" }];
    expect(matchImages(ours, theirs)).toEqual([
      { id: "swshp-SWSH050", url: "https://images.pokemontcg.io/swshp/SWSH050.png" },
      { id: "svp-001", url: "https://images.pokemontcg.io/svp/1.png" },
    ]);
  });
});

describe("pokemontcg ambiguous numbers", () => {
  it("skips a number listed twice in one set rather than picking one", () => {
    const ours = [{ id: "x-005", number_printed: "005", number_num: 5 }, { id: "x-006", number_printed: "006", number_num: 6 }];
    const theirs = [
      { number: "5", small: "https://images.pokemontcg.io/x/5a.png" },
      { number: "005", small: "https://images.pokemontcg.io/x/5b.png" },
      { number: "6", small: "https://images.pokemontcg.io/x/6.png" },
    ];
    expect(matchImages(ours, theirs)).toEqual([{ id: "x-006", url: "https://images.pokemontcg.io/x/6.png" }]);
  });
});
