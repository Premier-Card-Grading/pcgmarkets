/** Everything vendor-specific about SoldComps lives here. Filled from docs + the recorded sample. */
export const SOLDCOMPS = {
  baseUrl: "https://api.sold-comps.com/v1",
  scrapePath: "/scrape",
  // We used to text-search "PCG 10 pokemon" etc., which returned any listing with "PCG" in the
  // TITLE — including grey-market sellers whose slabs are actually PSA/CGC. Instead we now let
  // eBay's own grading-company facet do the filtering (aspectFilter below) and keep the keyword
  // broad. categoryId locks the search to Pokémon TCG singles.
  keyword: "pokemon",
  categoryId: "183454", // eBay: Pokémon TCG — Individual Trading Card Games (singles)
  // eBay item-aspect facet filters, keys/values written EXACTLY as they appear in eBay's sidebar
  // refinements (SoldComps URL-encodes the JSON for us). "Premier Card Grading (PCG)" is the
  // grading-company value eBay lists for PCG; this restricts results to cards eBay records as
  // genuinely PCG-graded, at the source, rather than trusting seller title text.
  aspectFilter: { "Professional Grader": "Premier Card Grading (PCG)" } as Record<string, string>,
  sortOrder: "endedRecently",
  // SoldComps accepts a single ebaySite per request, so we sweep these one at a time.
  // NOTE: each extra site multiplies request usage (free tier is 100 req/mo).
  ebaySites: ["ebay.com", "ebay.co.uk", "ebay.com.au"] as string[],
  // ebay.com searched worldwide reports each seller's location. The UK and AU sites are searched
  // domestic-only: their items come back with itemLocation null, and the site's country is the
  // seller's. (ebay.ca's domestic filter was found not to restrict anything, so it is not swept.)
  siteOptions: {
    "ebay.com": { itemLocation: "worldwide", country: null },
    "ebay.co.uk": { itemLocation: "domestic", country: "United Kingdom" },
    "ebay.com.au": { itemLocation: "domestic", country: "Australia" },
  } as Record<string, { itemLocation: "worldwide" | "domestic"; country: string | null }>,
  // "PCG" slabs sold from China are from an unrelated Chinese grader that shares the name, so
  // sellers there are dropped; so is any seller whose location is unknown.
  excludedSellerLocations: ["China"] as string[],
  // Fetch the accepted price of Best Offer sales (+1 request per page that has one).
  hydrateBoa: true,
  authHeader: (key: string): Record<string, string> => ({ Authorization: `Bearer ${key}` }),
  count: 240,
};
