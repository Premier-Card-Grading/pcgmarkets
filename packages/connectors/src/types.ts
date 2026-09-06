import type { RawListing, Source } from "@pcg/domain";

export interface Page {
  listings: RawListing[];
  nextCursor: unknown | null;
  /** HTTP 200 but zero items parsed from a page that should have had items (markup change). */
  suspect?: boolean;
}

export interface Connector {
  name: Source;
  fetchSold(cursor: unknown | null): AsyncGenerator<Page>;
}
