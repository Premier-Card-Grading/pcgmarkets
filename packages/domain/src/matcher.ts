import type { CertRecord, EbayMetadata, MatchResult, Source } from "./types";
import type { CatalogIndex } from "./catalog-index";
import { matchEbay } from "./match-ebay";
import { matchEbayTitle } from "./match-ebay-title";
import { matchJp } from "./match-jp";

/** Bump when any rule changes; the match job re-runs every non-override row on a bump. */
export const MATCHER_VERSION = "3";

export function matchListing(
  input: { source: Source; title: string; description: string | null; metadata: EbayMetadata | Record<string, never>; cert: CertRecord | null },
  catalog: CatalogIndex,
): MatchResult {
  if (input.source === "thecardapi") return matchEbay({ title: input.title, metadata: input.metadata as EbayMetadata, cert: input.cert }, catalog);
  if (input.source === "soldcomps") return matchEbayTitle({ title: input.title }, catalog);
  return matchJp({ title: input.title, description: input.description }, catalog);
}
