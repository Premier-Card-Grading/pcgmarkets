import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EstimateBox, ESTIMATE_FOOTNOTE } from "../components/EstimateBox";
import type { GradeOption } from "../lib/grades";

const opt: GradeOption = { key: "10e", gradeValue: 10, tier: null, label: "PCG 10", nSales: 0, medianUsd: 84, minUsd: 84, maxUsd: 84, confidence: "low", lastSoldAt: "", estimate: true };

describe("EstimateBox", () => {
  it("renders the approximate price, Est. marker and exact footnote", () => {
    const html = renderToStaticMarkup(createElement(EstimateBox, { opt }));
    expect(html).toContain("~$84");
    expect(html).toContain("Est.");
    expect(ESTIMATE_FOOTNOTE).toBe("Estimated from PSA market prices and card popularity — no PCG sales yet.");
    expect(html).toContain(ESTIMATE_FOOTNOTE);
  });
});
