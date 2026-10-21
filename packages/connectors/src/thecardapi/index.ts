import type { EbayMetadata, RawListing } from "@pcg/domain";
import type { Connector, Page } from "../types";
import { politeFetch } from "../http";
import { THECARDAPI } from "./schema";

function get(obj: unknown, path: string | string[]): unknown {
  // An empty STRING path is the schema's "field absent" sentinel — must resolve to undefined,
  // not to the whole record. An empty ARRAY path (bare-array envelope root) is a different case
  // and must still return `obj` unchanged, so this check is on `===  ""`, not on emptiness.
  if (path === "") return undefined;
  const parts = Array.isArray(path) ? path : path ? path.split(".") : [];
  return parts.reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}
const str = (v: unknown): string | undefined => (v == null || v === "" ? undefined : String(v));

export function extractRecords(body: unknown): unknown[] {
  const arr = get(body, THECARDAPI.envelope);
  return Array.isArray(arr) ? arr : [];
}

export function toRawListing(rec: unknown): RawListing | null {
  const f = THECARDAPI.fields;
  const id = str(get(rec, f.id)), title = str(get(rec, f.title)), url = str(get(rec, f.url));
  const price = Number(get(rec, f.price)), soldAtRaw = str(get(rec, f.soldAt));
  if (!id || !title || !url || !Number.isFinite(price) || !soldAtRaw) return null;
  const soldAt = new Date(soldAtRaw);
  if (Number.isNaN(soldAt.getTime())) return null;
  const metadata: EbayMetadata = {};
  const md: Array<[Exclude<keyof EbayMetadata, "pcg">, string]> = [["grader", f.grader], ["grade", f.grade], ["certNumber", f.certNumber], ["set", f.set], ["cardNumber", f.cardNumber], ["language", f.language]];
  for (const [k, path] of md) { const v = str(get(rec, path)); if (v) metadata[k] = v; }
  const imgs = get(rec, f.imageUrls);
  // Conservative default: treat any raw value matching THECARDAPI.bestOfferValues as a best-offer
  // sale to exclude from pricing medians (spec §9) — see schema.ts and the research doc for why.
  const bestOfferRaw = str(get(rec, f.bestOffer));
  const isBestOffer = bestOfferRaw != null
    && THECARDAPI.bestOfferValues.some((v) => v.toLowerCase() === bestOfferRaw.toLowerCase());
  return {
    source: "thecardapi", sourceItemId: id, url, title, description: null,
    price, currency: (str(get(rec, f.currency)) ?? "USD").toUpperCase(), kind: "sold",
    soldAt: soldAt.toISOString(), endedAt: soldAt.toISOString(),
    isBestOffer,
    sellerCountry: null, externalItemId: str(get(rec, f.ebayItemId)) ?? null,
    imageUrls: Array.isArray(imgs) ? imgs.map(String) : typeof imgs === "string" ? [imgs] : [],
    metadata, raw: rec,
  };
}

export interface TheCardApiCursor { lastSoldAt: string | null }

export const theCardApi: Connector = {
  name: "thecardapi",
  async *fetchSold(cursorIn: unknown | null): AsyncGenerator<Page> {
    const key = process.env.THECARDAPI_KEY;
    if (!key) throw new Error("THECARDAPI_KEY is required");
    const cursor = (cursorIn as TheCardApiCursor | null) ?? { lastSoldAt: null };
    let pageToken: string | null = null;
    let newest = cursor.lastSoldAt;
    for (let pages = 0; pages < 50; pages++) {
      const u = new URL(THECARDAPI.salesPath, THECARDAPI.baseUrl);
      for (const [k, v] of Object.entries(THECARDAPI.queryParams)) u.searchParams.set(k, v);
      if (pageToken && THECARDAPI.paging.param) u.searchParams.set(THECARDAPI.paging.param, pageToken);
      const res = await politeFetch(u.toString(), { minIntervalMs: 500, headers: THECARDAPI.authHeaders(key) });
      if (!res.ok) throw new Error(`thecardapi ${res.status}`);
      const body = await res.json();
      const listings = extractRecords(body).map(toRawListing).filter((l): l is RawListing => l !== null);
      for (const l of listings) if (!newest || l.soldAt! > newest) newest = l.soldAt;
      const nextToken = str(get(body, THECARDAPI.paging.nextPath)) ?? null;
      const reachedKnown = cursor.lastSoldAt != null && listings.some((l) => l.soldAt! <= cursor.lastSoldAt!);
      yield { listings, nextCursor: { lastSoldAt: newest }, suspect: false };
      if (!nextToken || reachedKnown) break;
      pageToken = nextToken;
    }
  },
};
