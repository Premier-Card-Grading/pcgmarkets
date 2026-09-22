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
  // NOTE: each extra site multiplies request usage (free tier is 100 req/mo). Trim this list to
  // cut quota use; `.com` alone is the cheapest.
  ebaySites: ["ebay.com", "ebay.com.au", "ebay.co.uk"] as string[],
  authHeader: (key: string): Record<string, string> => ({ Authorization: `Bearer ${key}` }),
  count: 40,
};
