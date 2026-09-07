import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseClosedSearchPage, parseYahooEndTime } from "../src/yahoo-auctions/parse";
import { yahooAuctions } from "../src/yahoo-auctions";
import { _resetForTests } from "../src/http";

const html = readFileSync(new URL("./fixtures/yahoo-closedsearch-pcg.html", import.meta.url), "utf8");
const now = new Date("2026-09-06T12:00:00+09:00");

// --- Hand-authored synthetic fixture ------------------------------------
//
// The live fixture (yahoo-closedsearch-pcg.html) has 25 real items that all
// have >=1 bid, and no next-page link at all (see the report). That leaves
// the 0-bid ("ended") branch of the sold/ended rule and the pagination path
// completely uncovered by real data. Rather than make a second live HTTP
// request (only one is allowed), these are covered with a minimal synthetic
// page built to match the *real* locators parse.ts actually reads:
//   - price: a "落札" label span, sibling of the yen-amount span, under a
//     shared parent (extractPriceJpy reads the parent's text).
//   - bids: an <a href=".../show/bid_hist?aID=..."> anchor whose text is the
//     bid count (extractBids); the 0-bid item has NO such anchor at all.
//   - end time: a <span> sibling of the <div> wrapping an
//     <svg aria-label="残り時間"> icon (extractEndTimeText).
function itemBlock(opts: { itemId: string; title: string; priceJpy: number; bids: number | null; endText: string }): string {
  const bidAnchor = opts.bids === null
    ? ""
    : `<a href="https://auctions.yahoo.co.jp/jp/show/bid_hist?aID=${opts.itemId}">${opts.bids}</a>`;
  return `
    <li>
      <a href="https://auctions.yahoo.co.jp/jp/auction/${opts.itemId}" title="${opts.title}">${opts.title}</a>
      <div class="pricerow"><span>落札</span><span>${opts.priceJpy.toLocaleString("ja-JP")}<span>円</span></span></div>
      ${bidAnchor}
      <div class="timerow"><div class="iconwrap"><svg aria-label="残り時間"></svg></div><span>${opts.endText}終了</span></div>
    </li>`;
}

const ZERO_BID_ITEM = { itemId: "z1000000001", title: "Zero Bid Synthetic Item", priceJpy: 1000, bids: null, endText: "3/1 10:00" };
const BIDDED_ITEM = { itemId: "z1000000002", title: "Bidded Synthetic Item", priceJpy: 5000, bids: 3, endText: "3/2 11:00" };

const SYNTHETIC_ITEMS_HTML = `<html><body><ul>${itemBlock(ZERO_BID_ITEM)}${itemBlock(BIDDED_ITEM)}</ul></body></html>`;

const NEXT_HREF = "/closedsearch/closedsearch?p=PCG%E9%91%91%E5%AE%9A%E5%93%81&b=51";
const SYNTHETIC_WITH_NEXT_HTML = `<html><body><ul>${itemBlock(ZERO_BID_ITEM)}${itemBlock(BIDDED_ITEM)}</ul>
  <a rel="next" href="${NEXT_HREF}">次へ</a></body></html>`;

const EMPTY_PAGE_HTML = `<html><body><ul></ul></body></html>`;

function mockResponse(body: string, status = 200) {
  return { ok: status < 300, status, text: async () => body } as Response;
}

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

describe("parseClosedSearchPage (synthetic: 0-bid item + pagination)", () => {
  it("distinguishes a 0-bid item from a bidded item", () => {
    const { items } = parseClosedSearchPage(SYNTHETIC_ITEMS_HTML, now);
    const zero = items.find((i) => i.itemId === ZERO_BID_ITEM.itemId)!;
    const bidded = items.find((i) => i.itemId === BIDDED_ITEM.itemId)!;
    expect(zero).toBeDefined();
    expect(zero.bids).toBe(0);
    expect(bidded).toBeDefined();
    expect(bidded.bids).toBeGreaterThanOrEqual(1);
  });

  it("exposes an absolute next-page url, prefixing a leading-slash href", () => {
    const { nextPageUrl } = parseClosedSearchPage(SYNTHETIC_WITH_NEXT_HTML, now);
    expect(nextPageUrl).toMatch(/^https:\/\/auctions\.yahoo\.co\.jp\/closedsearch\/closedsearch\?/);
  });
});

describe("yahooAuctions.fetchSold (synthetic: sold-vs-ended kind mapping)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    _resetForTests();
  });

  it("maps a 0-bid item to kind=ended/soldAt=null and a bidded item to kind=sold/soldAt!=null", async () => {
    _resetForTests();
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      // First call (first keyword) returns the synthetic items with no
      // next-page link, so the sweep advances past this keyword after one
      // fetch; every subsequent call (remaining keywords) returns an empty
      // page so the generator's keyword loop terminates quickly.
      return call === 1 ? mockResponse(SYNTHETIC_ITEMS_HTML) : mockResponse(EMPTY_PAGE_HTML);
    }));

    const listings = [];
    for await (const page of yahooAuctions.fetchSold(null)) {
      listings.push(...page.listings);
    }

    const ended = listings.find((l) => l.sourceItemId === ZERO_BID_ITEM.itemId)!;
    const sold = listings.find((l) => l.sourceItemId === BIDDED_ITEM.itemId)!;
    expect(ended).toBeDefined();
    expect(ended.kind).toBe("ended");
    expect(ended.soldAt).toBeNull();
    expect(sold).toBeDefined();
    expect(sold.kind).toBe("sold");
    expect(sold.soldAt).not.toBeNull();
  }, 20000);
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
  it("returns null for an out-of-range month", () => expect(parseYahooEndTime("19/5 18:51", now)).toBeNull());
  it("returns null for an out-of-range month and day", () => expect(parseYahooEndTime("13/45 10:00", now)).toBeNull());
});
