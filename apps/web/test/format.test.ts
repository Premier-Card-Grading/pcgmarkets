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

import { fmtNative as fmtNative2, fmtDateLong, fmtDateShort, relativeTime, fmtDuration } from "../lib/format";
describe("format additions", () => {
  it("native prices", () => { expect(fmtNative2(62000, "JPY")).toBe("¥62,000"); expect(fmtNative2(640, "USD")).toBe("$640"); expect(fmtNative2(640.5, "USD")).toBe("$640.50"); });
  it("dates", () => { expect(fmtDateLong("2026-09-19T10:00:00Z")).toBe("19 Sept 2026"); expect(fmtDateShort("2026-09-19T10:00:00Z")).toBe("19 Sept"); });
  it("relative time", () => {
    const now = new Date("2026-09-21T12:00:00Z");
    expect(relativeTime("2026-09-21T10:00:00Z", now)).toBe("2 h ago");
    expect(relativeTime("2026-09-18T10:00:00Z", now)).toBe("3 d ago");
    expect(relativeTime("2026-09-21T11:58:00Z", now)).toBe("2 m ago");
    expect(relativeTime("2026-09-21T15:40:00Z", now)).toBe("in 3 h 40 m");
  });
  it("durations", () => { expect(fmtDuration(252000)).toBe("4 m 12 s"); expect(fmtDuration(6000)).toBe("6 s"); expect(fmtDuration(665000)).toBe("11 m 05 s"); });
});
