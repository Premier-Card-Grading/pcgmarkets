import type { Job } from "../run";
import { PausedError, type Connector } from "@pcg/connectors";
import { getCursor, setCursor, upsertRawListings } from "@pcg/db";

export function soldConnectorJob(connector: Connector): Job {
  return async ({ db, log }) => {
    const stats = { items_seen: 0, items_new: 0, items_updated: 0, suspect: false };
    const cursor = await getCursor(db, connector.name);
    try {
      for await (const page of connector.fetchSold(cursor)) {
        if (page.suspect) { stats.suspect = true; log("suspect page: 0 items parsed; cursor not advanced"); continue; }
        const r = await upsertRawListings(db, page.listings);
        stats.items_seen += page.listings.length; stats.items_new += r.inserted; stats.items_updated += r.updated;
        if (page.nextCursor !== undefined) await setCursor(db, connector.name, page.nextCursor);
      }
    } catch (e) {
      if (e instanceof PausedError) { log(`paused by ${e.status}; will resume next run`); return stats; }
      throw e;
    }
    return stats;
  };
}
