// packages/connectors/test/limitless.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSetIndex, parseSetList, mergeSetPages, parseLimitlessDate, imageUrl, logoUrl } from "../src/limitless/parse";

const fx = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

describe("limitless set index", () => {
  const sets = parseSetIndex(fx("limitless-sets-jp.html"));
  it("lists every Japanese set with code, English name, date, count and series", () => {
    expect(sets.length).toBeGreaterThan(250);
    expect(sets[0]).toEqual({ code: "M6a", nameEn: "30th Celebration", releaseDate: "2026-09-16", cardCount: 111, series: "Mega" });
    expect(sets.find((s) => s.code === "BKB")).toMatchObject({ nameEn: "Black Kyurem-EX Deck", releaseDate: "2012-10-19", cardCount: 20 });
  });
  it("has unique codes", () => { expect(new Set(sets.map((s) => s.code)).size).toBe(sets.length); });
});

describe("limitless set list", () => {
  const ja = parseSetList(fx("limitless-set-SV11B-ja.html"));
  const en = parseSetList(fx("limitless-set-SV11B-en.html"));
  it("reads the header and every row", () => {
    expect(ja.nameJa).toBe("ブラックボルト");
    expect(ja.releaseDate).toBe("2025-06-06");
    expect(ja.rows).toHaveLength(174);
    expect(ja.rows[0]).toEqual({ number: "1", name: "ツタージャ", type: "G Basic", rarity: "Common", imageXs: "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SV11B/SV11B_1_R_JP_XS.png" });
  });
  it("joins Japanese and English rows by number", () => {
    const page = mergeSetPages("SV11B", ja, en);
    expect(page.cards).toHaveLength(174);
    expect(page.cards[2]).toMatchObject({ number: "3", nameJa: "ジャローダex", nameEn: "Serperior ex", rarity: "Double Rare" });
    expect(page.cards.find((c) => c.number === "173")).toMatchObject({ nameEn: "N's Plot", type: "Supporter" });
  });
  it("keeps a row whose English twin is missing, with nameEn null", () => {
    const page = mergeSetPages("SV11B", ja, { ...en, rows: en.rows.filter((r) => r.number !== "5") });
    expect(page.cards.find((c) => c.number === "5")).toMatchObject({ nameJa: "ヤナッキー", nameEn: null });
  });
});

describe("limitless helpers", () => {
  it("parses both date styles", () => {
    expect(parseLimitlessDate("16 Sep 26")).toBe("2026-09-16");
    expect(parseLimitlessDate("19 Oct 12")).toBe("2012-10-19");
    expect(parseLimitlessDate("6th June 2025")).toBe("2025-06-06");
    expect(parseLimitlessDate("1st March 2011")).toBe("2011-03-01");
    expect(parseLimitlessDate("soon")).toBeNull();
  });
  it("builds image and logo URLs", () => {
    expect(imageUrl("https://x/tpc/SV11B/SV11B_1_R_JP_XS.png", "SM")).toBe("https://x/tpc/SV11B/SV11B_1_R_JP_SM.png");
    expect(logoUrl("SV8a")).toBe("https://s3.limitlesstcg.com/sets/jp/SV8a.png");
  });
});
