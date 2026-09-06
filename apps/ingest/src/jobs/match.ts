import type { Job } from "../run";
import { loadCatalog, loadListingsToMatch, upsertMatches, type MatchRow } from "@pcg/db";
import { matchListing, MATCHER_VERSION, type CertRecord, type EbayMetadata } from "@pcg/domain";
import { lookupCert } from "@pcg/connectors";

export function matchJob(opts: { all: boolean }): Job {
  return async ({ db, log }) => {
    const catalog = await loadCatalog(db);
    const listings = await loadListingsToMatch(db, opts);
    log(`matching ${listings.length} listings (all=${opts.all}) with matcher v${MATCHER_VERSION}`);
    const rows: MatchRow[] = [];
    let matched = 0;
    for (const l of listings) {
      const md = l.metadata as EbayMetadata;
      let cert: CertRecord | null = null;
      if (l.source === "thecardapi" && md.certNumber) cert = await lookupCert(md.certNumber, { timeoutMs: 3000 });
      const r = matchListing({ source: l.source, title: l.title, description: l.description, metadata: l.metadata, cert }, catalog);
      if (r.state === "matched") matched++;
      rows.push({ ...r, rawListingId: l.id, matcherVersion: MATCHER_VERSION });
    }
    await upsertMatches(db, rows);
    log(`matched=${matched} review=${rows.filter((r) => r.state === "needs_review").length} rejected=${rows.filter((r) => r.state === "rejected").length}`);
    return { items_seen: listings.length, items_new: matched, items_updated: rows.length - matched };
  };
}
