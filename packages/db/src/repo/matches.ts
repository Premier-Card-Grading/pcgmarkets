import type { Db } from "../client";
import { must } from "../client";
import type { EbayMetadata, MatchResult, Source } from "@pcg/domain";

export interface ListingToMatch { id: string; source: Source; title: string; description: string | null; metadata: EbayMetadata | Record<string, never> }
export interface MatchRow extends MatchResult { rawListingId: string; matcherVersion: string }

export async function loadListingsToMatch(db: Db, opts: { all: boolean }): Promise<ListingToMatch[]> {
  const base = db.from("raw_listings").select("id,source,title,description,metadata,listing_matches(state,is_override)");
  const rows = must(await base) as Array<ListingToMatch & { listing_matches: { state: string; is_override: boolean }[] | null }>;
  return rows.filter((r) => {
    const m = r.listing_matches?.[0];
    if (!m) return true;
    if (m.is_override) return false;
    return opts.all ? true : m.state === "needs_review";
  }).map(({ listing_matches: _lm, ...r }) => r);
}

export async function upsertMatches(db: Db, rows: MatchRow[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({
      raw_listing_id: r.rawListingId, state: r.state, product_id: r.productId, grade_value: r.gradeValue,
      grade_label: r.gradeLabel, cert_id: r.certId, match_method: r.matchMethod, review_reason: r.reviewReason,
      extracted: r.extracted, is_override: false, matcher_version: r.matcherVersion, updated_at: new Date().toISOString(),
    }));
    must(await db.from("listing_matches").upsert(chunk, { onConflict: "raw_listing_id" }));
  }
}
