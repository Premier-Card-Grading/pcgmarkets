/**
 * Loads saved SoldComps /scrape responses into raw_listings, so pages already paid for are never
 * fetched twice. usage: tsx scripts/load-soldcomps-files.ts <ebaySite>=<file.json> ...
 * Same mapping and seller filter as the live connector (China and unknown locations dropped).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createServiceClient, upsertRawListings } from "@pcg/db";
import { extractItems, toRawListing, keepSeller } from "@pcg/connectors";
import type { RawListing } from "@pcg/domain";

const byId = new Map<string, RawListing>();
let seen = 0;
for (const arg of process.argv.slice(2)) {
  const [site, file] = arg.split("=") as [string, string];
  for (const item of extractItems(JSON.parse(readFileSync(file, "utf8")))) {
    seen++;
    const l = toRawListing(item, site);
    if (l && keepSeller(l.sellerCountry) && !byId.has(l.sourceItemId)) byId.set(l.sourceItemId, l);
  }
}
const listings = [...byId.values()];
const db = createServiceClient();
let inserted = 0, updated = 0;
for (let i = 0; i < listings.length; i += 200) {
  const r = await upsertRawListings(db, listings.slice(i, i + 200));
  inserted += r.inserted; updated += r.updated;
}
console.log(`items=${seen} kept=${listings.length} inserted=${inserted} updated=${updated}`);
