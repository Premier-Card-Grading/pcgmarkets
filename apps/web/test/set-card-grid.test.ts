import { describe, it, expect } from "vitest";
import { emptyGridMessage } from "../components/SetCardGrid";

describe("emptyGridMessage", () => {
  it("names the query when a search empties the grid", () => {
    expect(emptyGridMessage("069/187", "all")).toBe("No cards match “069/187”.");
    expect(emptyGridMessage("pikachu", "sales")).toBe("No cards match “pikachu”.");
  });
  it("says no cards have sales when only the With sales filter empties it", () => {
    expect(emptyGridMessage("", "sales")).toBe("No cards with sales yet.");
    expect(emptyGridMessage("   ", "sales")).toBe("No cards with sales yet.");
  });
  it("never shows empty quotes", () => { expect(emptyGridMessage("", "all")).toBe("No cards in this set yet."); });
});
