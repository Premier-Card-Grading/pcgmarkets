import type { CertRecord, EbayMetadata, MatchResult, Source } from "./types";
import type { CatalogIndex } from "./catalog-index";
import { matchEbay } from "./match-ebay";
import { matchSlab } from "./pcg-slab";
import { matchJp } from "./match-jp";

/** Bump when any rule changes; the match job re-runs every non-override row on a bump. */
export const MATCHER_VERSION = "4";

export function matchListing(
  input: { source: Source; title: string; description: string | null; metadata: EbayMetadata | Record<string, never>; cert: CertRecord | null },
  catalog: CatalogIndex,
): MatchResult {
  if (input.source === "thecardapi") return matchEbay({ title: input.title, metadata: input.metadata as EbayMetadata, cert: input.cert }, catalog);
  // Seller titles are free text and not trusted: a SoldComps sale is identified only from its slab's PCG cert.
  if (input.source === "soldcomps") return matchSlab((input.metadata as EbayMetadata).pcg, catalog);
  return matchJp({ title: input.title, description: input.description }, catalog);
}
