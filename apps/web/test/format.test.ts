import { describe, it, expect } from "vitest";
import { fmtUsd, fmtNative, gradeLabelText } from "../lib/format";

describe("format", () => {
  it("usd", () => expect(fmtUsd(118.4)).toBe("$118"));
  it("native jpy has no decimals", () => expect(fmtNative(18500, "JPY")).toBe("¥18,500"));
  it("grade text", () => {
    expect(gradeLabelText(10, "any")).toBe("10");
    expect(gradeLabelText(10, "Pristine")).toBe("10 Pristine");
    expect(gradeLabelText(9.5, "any")).toBe("9.5");
    expect(gradeLabelText(null, "Authentic")).toBe("Authentic");
  });
});
