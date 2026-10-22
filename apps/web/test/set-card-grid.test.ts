import { describe, it, expect } from "vitest";
import { defaultGridFilter, emptyGridMessage } from "../components/SetCardGrid";

describe("emptyGridMessage", () => {
  it("names the query when a search empties the grid", () => {
    expect(emptyGridMessage("069/187", "all")).toBe("No cards match “069/187”.");
    expect(emptyGridMessage("pikachu", "priced")).toBe("No cards match “pikachu”.");
  });
  it("says no cards have prices when only the With prices filter empties it", () => {
    expect(emptyGridMessage("", "priced")).toBe("No cards with prices yet.");
    expect(emptyGridMessage("   ", "priced")).toBe("No cards with prices yet.");
  });
  it("never shows empty quotes", () => { expect(emptyGridMessage("", "all")).toBe("No cards in this set yet."); });
});

describe("defaultGridFilter", () => {
  it("opens on cards with prices, or on every card when the set has none", () => {
    expect(defaultGridFilter(12)).toBe("priced");
    expect(defaultGridFilter(0)).toBe("all");
  });
});
