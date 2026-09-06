import type { RawListing } from "@pcg/domain";
import type { Connector, Page } from "../types";
import { politeFetch } from "../http";
import { parseClosedSearchPage } from "./parse";

export const YAHOO_KEYWORDS = ["PCG鑑定品", "PCG鑑定", "PCG10", "PCG9.5"];
const SEARCH = (kw: string) => `https://auctions.yahoo.co.jp/closedsearch/closedsearch?p=${encodeURIComponent(kw)}`;

export interface YahooCursor { keywordIndex: number; pageUrl: string | null; seenIds: string[] }

export const yahooAuctions: Connector = {
  name: "yahoo_auc",
  async *fetchSold(cursorIn: unknown | null): AsyncGenerator<Page> {
    const cursor: YahooCursor = (cursorIn as YahooCursor | null) ?? { keywordIndex: 0, pageUrl: null, seenIds: [] };
    const seen = new Set(cursor.seenIds);
    let { keywordIndex, pageUrl } = cursor;
    while (keywordIndex < YAHOO_KEYWORDS.length) {
      const url = pageUrl ?? SEARCH(YAHOO_KEYWORDS[keywordIndex]!);
      const res = await politeFetch(url, { minIntervalMs: 1000, headers: { "Accept-Language": "ja" } });
      if (!res.ok) throw new Error(`yahoo ${res.status} ${url}`);
      const fetchedAt = new Date();
      const { items, nextPageUrl } = parseClosedSearchPage(await res.text(), fetchedAt);
      const fresh = items.filter((i) => !seen.has(i.itemId));
      fresh.forEach((i) => seen.add(i.itemId));
      // Stop paging a keyword once a whole page is already known.
      const exhausted = !nextPageUrl || fresh.length === 0;
      const next: YahooCursor = exhausted
        ? { keywordIndex: keywordIndex + 1, pageUrl: null, seenIds: [...seen].slice(-5000) }
        : { keywordIndex, pageUrl: nextPageUrl, seenIds: [...seen].slice(-5000) };
      yield {
        listings: fresh.map((i): RawListing => ({
          source: "yahoo_auc", sourceItemId: i.itemId, url: i.url, title: i.title, description: null,
          price: i.priceJpy, currency: "JPY", kind: i.bids >= 1 ? "sold" : "ended",
          soldAt: i.bids >= 1 ? i.endedAt?.toISOString() ?? null : null, endedAt: i.endedAt?.toISOString() ?? null,
          isBestOffer: false, sellerCountry: "JP", externalItemId: null,
          imageUrls: i.imageUrl ? [i.imageUrl] : [], metadata: {}, raw: i,
        })),
        nextCursor: next,
        suspect: items.length === 0,
      };
      keywordIndex = next.keywordIndex; pageUrl = next.pageUrl;
    }
    // Completed a full sweep: reset for the next run but keep the seen set.
    yield { listings: [], nextCursor: { keywordIndex: 0, pageUrl: null, seenIds: [...seen].slice(-5000) } };
  },
};
