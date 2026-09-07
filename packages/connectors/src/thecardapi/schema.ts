/** Everything vendor-specific about The Card API lives here. Filled from docs + the recorded sample. */
export const THECARDAPI = {
  baseUrl: "https://thecardapi.com",
  salesPath: "/api/v1/market/sales",
  // Boolean-OR keyword search on title for PCG-graded cards, plus the API's own graded filter.
  // NOTE: as of 2026-09-07 this query returns zero results — see docs/research/2026-09-thecardapi-schema.md.
  queryParams: {
    q: '(pcg,"premier card grading")',
    graded: "true",
    limit: "100",
    sort: "date_desc",
  } as Record<string, string>,
  authHeaders: (key: string): Record<string, string> => ({ "x-market-api-key": key }),
  /** Path into the response to the array of records: { data: [...] }. */
  envelope: ["data"] as string[],
  /** Dot-paths inside one record. Fill from the recorded sample. */
  fields: {
    id: "id",
    title: "title",
    price: "price",
    currency: "currency",
    soldAt: "sold_at",
    url: "listing_url",
    imageUrls: "image_url",
    ebayItemId: "", // not returned — the API exposes its own `id`, not the underlying eBay item id
    // `listing_type` is a 3-way enum ("auction"|"fixed_price"|"best_offer"), not a boolean — the
    // mapper compares its raw string value against `bestOfferValues` below (case-insensitive).
    bestOffer: "listing_type",
    grader: "grader",
    grade: "grade",
    certNumber: "cert",
    set: "card_set",
    cardNumber: "card_number",
    language: "", // not returned — no language field in the sale record
  },
  /**
   * Raw values at `fields.bestOffer` (`listing_type`) that mean "exclude from pricing medians"
   * per spec §9. Our research (docs/research/2026-09-05-western-marketplaces.md) found eBay
   * best-offer rows expose the ASKING price, not the accepted price — so `listing_type ===
   * "best_offer"` is treated as isBestOffer=true conservatively, until/unless the vendor confirms
   * `price` on those rows is the accepted amount rather than the asking price.
   */
  bestOfferValues: ["best_offer"] as string[],
  /** Paging: name of the cursor/offset param and how to read the next cursor from the response. */
  paging: { param: "cursor", nextPath: ["pagination", "next_cursor"] as string[] },
};
