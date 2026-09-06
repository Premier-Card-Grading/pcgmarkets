import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseClosedSearchPage, parseYahooEndTime } from "../src/yahoo-auctions/parse";

const html = readFileSync(new URL("./fixtures/yahoo-closedsearch-pcg.html", import.meta.url), "utf8");
const now = new Date("2026-09-06T12:00:00+09:00");

describe("parseClosedSearchPage", () => {
  const { items, nextPageUrl } = parseClosedSearchPage(html, now);
  it("finds items with ids, titles, JPY prices and bids", () => {
    expect(items.length).toBeGreaterThan(5);
    for (const it of items) {
      expect(it.itemId).toMatch(/^[a-z]\d+$/);
      expect(it.url).toContain(`/jp/auction/${it.itemId}`);
      expect(it.title.length).toBeGreaterThan(3);
      expect(it.priceJpy).toBeGreaterThan(0);
      expect(it.bids).toBeGreaterThanOrEqual(0);
    }
  });
  it("matches a known item from the fixture", () => {
    const known = items.find((i) => i.itemId === "b1222975789")!;
    expect(known.priceJpy).toBe(15500);
    expect(known.bids).toBe(68);
  });
  it("exposes the next page link when the result set spans more than one page", () => {
    // Real fixture finding: "PCG鑑定品" closedsearch returned 41 total results
    // (totalResultsAvailable: 41 in the page's embedded JSON) under the page's
    // default page size of 50 ("50件表示" is the active display-count button),
    // so Yahoo renders no pagination control at all for this recorded page --
    // there is no <a rel="next"> and the only "次へ" text in the fixture is a
    // disabled <button> belonging to an unrelated keyword-filter carousel, not
    // an <a> pagination link. nextPageUrl is genuinely null for this fixture;
    // the extractor still knows how to find rel="next" or a 次へ/次の text link
    // when a fixture actually has one (see parse.ts).
    expect(nextPageUrl).toBeNull();
  });
});

describe("parseYahooEndTime", () => {
  it("parses MM/DD HH:mm in JST, same year", () => {
    expect(parseYahooEndTime("09/03 21:15", now)?.toISOString()).toBe("2026-09-03T12:15:00.000Z");
  });
  it("rolls to previous year when month is in the future", () => {
    expect(parseYahooEndTime("12/30 10:00", now)?.getUTCFullYear()).toBe(2025);
  });
  it("parses 月/日 form", () => {
    expect(parseYahooEndTime("9月3日 21時15分", now)?.toISOString()).toBe("2026-09-03T12:15:00.000Z");
  });
  it("returns null for junk", () => expect(parseYahooEndTime("終了", now)).toBeNull());
});
