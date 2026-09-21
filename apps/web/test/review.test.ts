import { describe, it, expect } from "vitest";
import { reasonLabel, extractedRows, sourceLine } from "../lib/review";

describe("review helpers", () => {
  it("labels reasons in plain words", () => {
    expect(reasonLabel("no_card_number")).toBe("No card number");
    expect(reasonLabel("ambiguous_set")).toBe("Ambiguous set");
    expect(reasonLabel("lot")).toBe("Possible lot");
    expect(reasonLabel("grader_missing")).toBe("Grader unclear");
    expect(reasonLabel("ambiguous_grader")).toBe("Grader unclear");
    expect(reasonLabel("possible_pcgs")).toBe("Other");
    expect(reasonLabel(null)).toBe("Other");
  });

  it("turns extracted fields into labelled rows with missing markers, using the matcher's real keys", () => {
    expect(
      extractedRows({
        grader: "PCG",
        grade: "10",
        setCode: "SV4a",
        cardNumber: "350/190",
        language: "Japanese",
        tierHint: "Gem Mint",
      }),
    ).toEqual([
      { label: "Grader", value: "PCG" },
      { label: "Grade", value: "10" },
      { label: "Tier", value: "Gem Mint" },
      { label: "Set", value: "SV4a" },
      { label: "Number", value: "350/190" },
      { label: "Language", value: "Japanese" },
    ]);
  });

  it("marks tier and card number missing when tierHint/cardNumber are absent", () => {
    expect(
      extractedRows({ grader: "PCG", grade: 10, setCode: "SV4a", language: "Japanese" }),
    ).toEqual([
      { label: "Grader", value: "PCG" },
      { label: "Grade", value: "10" },
      { label: "Tier", value: null, missing: "not stated" },
      { label: "Set", value: "SV4a" },
      { label: "Number", value: null, missing: "none found" },
      { label: "Language", value: "Japanese" },
    ]);
  });

  it("falls back to `set` when `setCode` is absent (eBay metadata path)", () => {
    const rows = extractedRows({ grader: "PCG", grade: "10", set: "Obsidian Flames", cardNumber: "201/165", language: "English" });
    expect(rows.find((r) => r.label === "Set")).toEqual({ label: "Set", value: "Obsidian Flames" });
  });

  it("source line", () => {
    expect(sourceLine("yahoo_auc", "2026-09-20T00:00:00Z", "ended")).toBe("Yahoo! Auctions · ended 20 Sept");
    expect(sourceLine("soldcomps", "2026-09-18T00:00:00Z", "sold")).toBe("eBay · sold 18 Sept");
  });
});
