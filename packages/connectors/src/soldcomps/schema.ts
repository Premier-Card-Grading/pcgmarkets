/** Everything vendor-specific about SoldComps lives here. Filled from docs + the recorded sample. */
export const SOLDCOMPS = {
  baseUrl: "https://api.sold-comps.com/v1",
  scrapePath: "/scrape",
  // Free tier is 100 req/mo — keep this list short and let PAGE_CAP in index.ts bound pages/keyword.
  keywords: ["PCG 10 pokemon", "PCG 9.5 pokemon", "PCG 9 pokemon"] as string[],
  authHeader: (key: string): Record<string, string> => ({ Authorization: `Bearer ${key}` }),
  count: 40,
};
