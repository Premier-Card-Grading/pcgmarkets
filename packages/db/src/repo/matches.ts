import type { Db } from "../client";
import { must } from "../client";
import { selectAll } from "../paginate";
import type { EbayMetadata, MatchResult, Source } from "@pcg/domain";

export interface ListingToMatch { id: string; source: Source; title: string; description: string | null; metadata: EbayMetadata | Record<string, never> }
export interface MatchRow extends MatchResult { rawListingId: string; matcherVersion: string }

export async function loadListingsToMatch(db: Db, opts: { all: boolean }): Promise<ListingToMatch[]> {
  type EmbeddedMatch = { state: string; is_override: boolean };
  // Paged: a plain select stops at Supabase's 1000-row cap.
  const rows = await selectAll<ListingToMatch & { listing_matches: EmbeddedMatch | EmbeddedMatch[] | null }>((f, t) =>
    db.from("raw_listings").select("id,source,title,description,metadata,listing_matches(state,is_override)").order("id").range(f, t));
  return rows.filter((r) => {
    // PostgREST embeds a to-one relation (raw_listing_id is unique on listing_matches) as a single
    // object, not an array — but also tolerate an array shape in case that ever changes.
    const raw = r.listing_matches;
    const m = Array.isArray(raw) ? raw[0] : raw;
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
