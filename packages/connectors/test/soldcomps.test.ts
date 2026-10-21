import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { extractItems, toRawListing, soldComps, PAGE_CAP, keepSeller, buildScrapeUrl, type SoldCompsCursor } from "../src/soldcomps";
import { SOLDCOMPS } from "../src/soldcomps/schema";
import { _resetForTests } from "../src/http";

const body = JSON.parse(readFileSync(new URL("./fixtures/soldcomps-sample.json", import.meta.url), "utf8"));

describe("soldcomps mapping", () => {
  const items = extractItems(body);
  it("finds items in the envelope", () => expect(items.length).toBeGreaterThan(0));

  it("maps every item to a RawListing with the required fields", () => {
    for (const it of items) {
      const l = toRawListing(it);
      expect(l).not.toBeNull();
      expect(l!.source).toBe("soldcomps");
      expect(l!.sourceItemId.length).toBeGreaterThan(0);
      expect(l!.kind).toBe("sold");
      expect(l!.price).toBeGreaterThan(0);
      expect(l!.currency).toMatch(/^[A-Z]{3}$/);
      expect(l!.soldAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(l!.url).toMatch(/^https:\/\/www\.ebay\.com\/itm\//);
      expect(l!.isBestOffer).toBe(false);
      expect(l!.metadata).toEqual({});
    }
  });

  it("never copies sellerUsername or sellerPositivePercent into a typed RawListing field", () => {
    for (const it of items) {
      const l = toRawListing(it);
      expect(l).not.toBeNull();
      const json = JSON.stringify({ ...l, raw: undefined });
      expect(json).not.toContain("sellerUsername");
      expect(json).not.toContain("sellerPositivePercent");
      // it may only remain inside raw, untouched
      expect((l!.raw as { sellerUsername?: string }).sellerUsername).toBeDefined();
    }
  });

  it("uses the accepted Best Offer price; flags a Best Offer sale whose price is unknown", () => {
    const base = { itemId: "1", title: "t", endedAt: "2026-10-01", soldPrice: "100.00" };
    expect(toRawListing({ ...base, bestOfferAccepted: true, boaAcceptedPrice: "80.00" })).toMatchObject({ price: 80, isBestOffer: false });
    expect(toRawListing({ ...base, bestOfferAccepted: true, boaAcceptedPrice: null })).toMatchObject({ price: 100, isBestOffer: true });
    expect(toRawListing({ ...base, bestOfferAccepted: false })).toMatchObject({ price: 100, isBestOffer: false });
  });

  it("records the seller's location, taking a domestic-only site's country when the item has none", () => {
    const base = { itemId: "1", title: "t", endedAt: "2026-10-01", soldPrice: "5", fullResThumbnailUrl: "https://i.ebayimg.com/x/s-l500.jpg" };
    expect(toRawListing({ ...base, itemLocation: "United States" }, "ebay.com")).toMatchObject({ sellerCountry: "United States", imageUrls: ["https://i.ebayimg.com/x/s-l500.jpg"] });
    expect(toRawListing({ ...base, itemLocation: null }, "ebay.co.uk")!.sellerCountry).toBe("United Kingdom");
    expect(toRawListing({ ...base, itemLocation: null }, "ebay.com")!.sellerCountry).toBeNull();
  });

  it("drops sellers in China and sellers of unknown location", () => {
    expect(keepSeller("United States")).toBe(true);
    expect(keepSeller("Hong Kong")).toBe(true);
    expect(keepSeller("China")).toBe(false);
    expect(keepSeller(null)).toBe(false);
  });

  it("searches ebay.com worldwide and the UK/AU sites domestic-only, with Best Offer prices", () => {
    expect(buildScrapeUrl("ebay.com", 1).searchParams.get("itemLocation")).toBe("worldwide");
    expect(buildScrapeUrl("ebay.co.uk", 1).searchParams.get("itemLocation")).toBe("domestic");
    expect(buildScrapeUrl("ebay.com", 1).searchParams.get("hydrateBoa")).toBe("true");
    expect(buildScrapeUrl("ebay.com", 1).searchParams.get("count")).toBe("240");
  });

  it("returns null when required fields are missing", () => {
    expect(toRawListing({ title: "no id", soldPrice: "1", endedAt: "2026-01-01" })).toBeNull();
    expect(toRawListing({ itemId: "1", title: "no price", endedAt: "2026-01-01" })).toBeNull();
    expect(toRawListing({ itemId: "1", title: "no ended", soldPrice: "1" })).toBeNull();
    expect(toRawListing({ itemId: "1", soldPrice: "1", endedAt: "2026-01-01" })).toBeNull();
    expect(toRawListing({ itemId: "1", title: "zero price", soldPrice: "0", endedAt: "2026-01-01" })).toBeNull();
  });
});

// --- soldComps.fetchSold (synthetic: mocked fetch, no live requests) --------
//
// These cover the generator's control flow, which the fixture-based mapping
// tests above never exercise: the PAGE_CAP budget guard, cursor
// persist-then-advance, the keyword-stop conditions (!hasNextPage / all-seen
// / page cap), the `suspect` flag, and the missing-key throw.
function mockJsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body } as Response;
}
function fakeItem(itemId: string) {
  return { itemId, title: `Item ${itemId}`, soldPrice: "1.00", soldCurrency: "USD", endedAt: "2026-01-01", itemLocation: "United States" };
}

describe("soldComps.fetchSold (synthetic: mocked fetch)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    _resetForTests();
    delete process.env.SOLDCOMPS_KEY;
  });

  it("bounds requests to ebaySites.length * PAGE_CAP even when hasNextPage never goes false", async () => {
    process.env.SOLDCOMPS_KEY = "sc_test";
    _resetForTests();
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return mockJsonResponse({ items: [fakeItem(`cap-${calls}`)], hasNextPage: true });
    }));

    for await (const _page of soldComps.fetchSold(null)) { /* drain the sweep */ }

    expect(calls).toBe(SOLDCOMPS.ebaySites.length * PAGE_CAP);
  }, 60000);

  it("persists-then-advances the cursor page-by-page within a site, then to the next site, with no duplicate ids across pages", async () => {
    process.env.SOLDCOMPS_KEY = "sc_test";
    _resetForTests();
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const u = new URL(url);
      const site = u.searchParams.get("ebaySite");
      const page = Number(u.searchParams.get("page"));
      if (site === SOLDCOMPS.ebaySites[0]) {
        // Site 0 has exactly 2 pages of fresh items, then stops.
        return mockJsonResponse({ items: [fakeItem(`s0-p${page}`)], hasNextPage: page < 2 });
      }
      // All other sites are exhausted on their first page.
      return mockJsonResponse({ items: [], hasNextPage: false });
    }));

    const cursors: SoldCompsCursor[] = [];
    const seenAcrossPages = new Set<string>();
    let duplicate = false;
    for await (const page of soldComps.fetchSold(null)) {
      cursors.push(page.nextCursor as SoldCompsCursor);
      for (const l of page.listings) {
        if (seenAcrossPages.has(l.sourceItemId)) duplicate = true;
        seenAcrossPages.add(l.sourceItemId);
      }
    }

    expect(duplicate).toBe(false);
    // page 1 of site 0 -> cursor advances to page 2, same site (persist-then-advance).
    expect(cursors[0]).toMatchObject({ siteIndex: 0, page: 2 });
    // page 2 of site 0 has hasNextPage=false -> cursor moves to site 1, page 1.
    expect(cursors[1]).toMatchObject({ siteIndex: 1, page: 1 });
    // remaining sites each exhaust after one page (siteIndex advances past the last).
    expect(cursors[2]).toMatchObject({ siteIndex: 2, page: 1 });
    // full sweep complete: cursor resets to the start for the next run.
    expect(cursors[cursors.length - 1]).toMatchObject({ siteIndex: 0, page: 1 });
  }, 20000);

  it("stops a site after one page when hasNextPage is false", async () => {
    process.env.SOLDCOMPS_KEY = "sc_test";
    _resetForTests();
    const callsPerSite: Record<string, number> = {};
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const site = new URL(url).searchParams.get("ebaySite")!;
      callsPerSite[site] = (callsPerSite[site] ?? 0) + 1;
      return mockJsonResponse({ items: [fakeItem(`${site}-1`)], hasNextPage: false });
    });
    vi.stubGlobal("fetch", fetchMock);

    for await (const _page of soldComps.fetchSold(null)) { /* drain */ }

    for (const site of SOLDCOMPS.ebaySites) expect(callsPerSite[site]).toBe(1);

    // Regression guard: the request URL must hit the real SoldComps endpoint
    // (https://api.sold-comps.com/v1/scrape?...). A prior bug built the URL as
    // `new URL(scrapePath, baseUrl)`, which — because scrapePath is an absolute
    // path — silently discarded baseUrl's own "/v1" path segment and requested
    // https://api.sold-comps.com/scrape instead, 404ing on every live call.
    const firstCallUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(`${firstCallUrl.origin}${firstCallUrl.pathname}`).toBe("https://api.sold-comps.com/v1/scrape");
    // Accuracy guard: the request filters by eBay's PCG grading-company facet and the
    // Pokémon singles category, instead of text-searching "PCG" in titles.
    expect(JSON.parse(firstCallUrl.searchParams.get("aspectFilter")!)).toEqual({
      "Professional Grader": "Premier Card Grading (PCG)",
    });
    expect(firstCallUrl.searchParams.get("categoryId")).toBe("183454");
    expect(SOLDCOMPS.ebaySites).toContain(firstCallUrl.searchParams.get("ebaySite"));
    const firstCallInit = fetchMock.mock.calls[0]![1] as RequestInit | undefined;
    expect((firstCallInit?.headers as Record<string, string> | undefined)?.Authorization).toBe("Bearer sc_test");
  }, 20000);

  it("stops a site early when a page returns only already-seen items, even though hasNextPage is true", async () => {
    process.env.SOLDCOMPS_KEY = "sc_test";
    _resetForTests();
    const seenId = "dup-1";
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return mockJsonResponse({ items: [fakeItem(seenId)], hasNextPage: true });
    }));

    const cursor: SoldCompsCursor = { siteIndex: 0, page: 1, seenIds: [seenId] };
    const pages = [];
    for await (const page of soldComps.fetchSold(cursor)) pages.push(page);

    // Every site's very first page returns nothing but the already-seen id, so each
    // site stops after exactly one fetch despite hasNextPage:true.
    expect(calls).toBe(SOLDCOMPS.ebaySites.length);
    expect(pages.every((p) => p.listings.length === 0)).toBe(true);
  }, 20000);

  it("marks a page suspect when page 1 returns zero items", async () => {
    process.env.SOLDCOMPS_KEY = "sc_test";
    _resetForTests();
    vi.stubGlobal("fetch", vi.fn(async () => mockJsonResponse({ items: [], hasNextPage: false })));

    const pages = [];
    for await (const page of soldComps.fetchSold(null)) pages.push(page);

    expect(pages[0]!.suspect).toBe(true);
  }, 20000);

  it("throws a clear error when SOLDCOMPS_KEY is missing, without making any request", async () => {
    delete process.env.SOLDCOMPS_KEY;
    _resetForTests();
    const fetchMock = vi.fn(async () => {
      throw new Error("must not fetch when the key is missing");
    });
    vi.stubGlobal("fetch", fetchMock);

    const gen = soldComps.fetchSold(null);
    await expect(gen.next()).rejects.toThrow(/SOLDCOMPS_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
