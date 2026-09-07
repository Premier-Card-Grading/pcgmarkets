import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cheerio's own
// node type (domhandler's AnyNode) isn't a direct dependency of this package.
type AnyNode = any;

export interface YahooItem {
  itemId: string; url: string; title: string; priceJpy: number; bids: number; endedAt: Date | null; imageUrl: string | null;
}

// Real closedsearch item anchors point at `auctions.yahoo.co.jp/jp/auction/{id}`
// (not the `page.auctions.yahoo.co.jp` canonical item-detail host); accept both.
const ITEM_URL_RE = /(?:page\.)?auctions\.yahoo\.co\.jp\/jp\/auction\/([a-z]\d+)/;
const JST_OFFSET_MIN = 9 * 60;

export function parseYahooEndTime(text: string, now: Date): Date | null {
  const t = text.replace(/\s+/g, " ");
  let m = /(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/.exec(t);
  let month: number, day: number, hour = 0, minute = 0;
  if (m) { month = +m[1]!; day = +m[2]!; hour = +m[3]!; minute = +m[4]!; }
  else {
    m = /(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2})時(\d{1,2})分)?/.exec(t);
    if (!m) return null;
    month = +m[1]!; day = +m[2]!; hour = m[3] ? +m[3] : 0; minute = m[4] ? +m[4] : 0;
  }
  // Date.UTC silently overflows an out-of-range month/day (e.g. month=19 rolls
  // into a wrong-but-valid later date) instead of rejecting it. Reject
  // malformed input explicitly so a markup-drift regression that feeds this
  // function garbage text produces null, not a silently corrupt date.
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const nowJst = new Date(now.getTime() + JST_OFFSET_MIN * 60000);
  let year = nowJst.getUTCFullYear();
  if (month > nowJst.getUTCMonth() + 1 || (month === nowJst.getUTCMonth() + 1 && day > nowJst.getUTCDate() + 1)) year -= 1;
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - JST_OFFSET_MIN * 60000);
}

// --- Extraction locators -----------------------------------------------
//
// These are read against the real fixture (packages/connectors/test/fixtures/
// yahoo-closedsearch-pcg.html), not against assumed markup. Each one falls
// back to a full-container-text regex (the brief's original approach) so a
// future markup change degrades gracefully instead of throwing.

/**
 * The winning price sits in a "落札"/"即決" label + value pair, e.g.
 * `<span>落札</span><span>15,500<span>円</span></span>` as siblings under a
 * shared parent. A naive `/([\d,]+)円/` scan of the whole item's text can
 * instead match an unrelated "円" earlier in the text (e.g. a title like
 * "送料360円 ..." shipping-fee mention), so we anchor on the price label
 * first and only fall back to the naive scan if no label is found.
 */
function extractPriceJpy(container: Cheerio<AnyNode>, $: CheerioAPI): number | null {
  let price: number | null = null;
  container.find("span, div").each((_, el) => {
    if (price !== null) return;
    const own = $(el).text().trim();
    if (own === "落札" || own === "即決") {
      const rowText = $(el).parent().text().replace(/\s+/g, "");
      const m = /([\d,]+)円/.exec(rowText);
      if (m) price = parseInt(m[1]!.replace(/,/g, ""), 10);
    }
  });
  if (price === null) {
    const m = /([\d,]+)\s*円/.exec(container.text().replace(/\s+/g, " "));
    if (m) price = parseInt(m[1]!.replace(/,/g, ""), 10);
  }
  return price;
}

/**
 * The bid count is the text of the `<a href=".../show/bid_hist?aID=...">`
 * anchor. The "入札" label that names it is only present as an
 * `aria-label="入札件数"` attribute (on a preceding icon), never as visible
 * text, so a text-only regex for "入札\s*\d+" never matches against real
 * markup. It also avoids a real concatenation hazard: cheerio's flattened
 * `.text()` has no separators between sibling text nodes, so a bid count
 * like "1" immediately followed by an end-date "9/5 18:51" collapses into
 * "19/5 18:51" and gets misread as month 19.
 */
function extractBids(container: Cheerio<AnyNode>, $: CheerioAPI): number {
  const bidText = container.find('a[href*="bid_hist"]').first().text().trim();
  if (/^\d+$/.test(bidText)) return +bidText;
  const text = container.text().replace(/\s+/g, " ");
  const m = /入札\s*(\d+)|(\d+)\s*件?\s*入札|(\d+)\s*bids?/i.exec(text);
  return m ? +(m[1] ?? m[2] ?? m[3]!) : 0;
}

/**
 * The end-time text ("4/14 23:05終了") lives in a `<span>` sibling of the
 * icon `<div>` that wraps an `<svg aria-label="残り時間">`. Reading it in
 * isolation avoids the same flattened-text digit-concatenation hazard
 * described above (a bid count fused onto the following end date).
 */
function extractEndTimeText(container: Cheerio<AnyNode>, $: CheerioAPI): string {
  const icon = container.find('svg[aria-label="残り時間"]').first();
  if (icon.length) {
    const t = icon.parent().next().text().trim();
    if (t) return t;
  }
  return container.text().replace(/\s+/g, " ");
}

export function parseClosedSearchPage(html: string, fetchedAt: Date): { items: YahooItem[]; nextPageUrl: string | null } {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: YahooItem[] = [];

  $("a[href*='auctions.yahoo.co.jp/jp/auction/']").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const m = ITEM_URL_RE.exec(href);
    if (!m) return;
    const itemId = m[1]!;
    if (seen.has(itemId)) return;
    const container = $(a).closest("li").length ? $(a).closest("li") : $(a).parent().parent();
    const title = ($(a).attr("title") || $(a).text()).replace(/\s+/g, " ").trim();
    if (!title) return;
    const priceJpy = extractPriceJpy(container, $);
    if (priceJpy === null) return;
    const bids = extractBids(container, $);
    const img = container.find("img").first();
    seen.add(itemId);
    items.push({
      itemId, url: `https://page.auctions.yahoo.co.jp/jp/auction/${itemId}`, title,
      priceJpy, bids,
      endedAt: parseYahooEndTime(extractEndTimeText(container, $), fetchedAt),
      imageUrl: img.attr("data-src") ?? img.attr("src") ?? null,
    });
  });

  let nextPageUrl: string | null = $("a[rel='next']").attr("href") ?? null;
  if (!nextPageUrl) {
    $("a").each((_, a) => { if (!nextPageUrl && /次へ|次の/.test($(a).text())) nextPageUrl = $(a).attr("href") ?? null; });
  }
  if (nextPageUrl && nextPageUrl.startsWith("/")) nextPageUrl = `https://auctions.yahoo.co.jp${nextPageUrl}`;
  return { items, nextPageUrl };
}
