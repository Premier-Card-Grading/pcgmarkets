import type { RawListing } from "@pcg/domain";
import type { Connector, Page } from "../types";
import { politeFetch } from "../http";
import { SOLDCOMPS } from "./schema";

/** Free tier is 100 req/mo — cap pages fetched per keyword per sweep. */
export const PAGE_CAP = 3;

const str = (v: unknown): string | undefined => (v == null || v === "" ? undefined : String(v));

export function extractItems(body: unknown): unknown[] {
  const items = body && typeof body === "object" ? (body as Record<string, unknown>).items : undefined;
  return Array.isArray(items) ? items : [];
}

export function toRawListing(item: unknown): RawListing | null {
  if (!item || typeof item !== "object") return null;
  const r = item as Record<string, unknown>;
  const itemId = str(r.itemId);
  const title = str(r.title);
  const endedAtRaw = str(r.endedAt);
  const price = Number(r.soldPrice);
  if (!itemId || !title || !endedAtRaw || !Number.isFinite(price) || price <= 0) return null;
  const endedAt = new Date(endedAtRaw);
  if (Number.isNaN(endedAt.getTime())) return null;
  const endedAtIso = endedAt.toISOString();
  return {
    source: "soldcomps",
    sourceItemId: itemId,
    url: `https://www.ebay.com/itm/${itemId}`,
    title,
    description: null,
    price,
    currency: (str(r.soldCurrency) ?? "USD").toUpperCase(),
    kind: "sold",
    soldAt: endedAtIso,
    endedAt: endedAtIso,
    isBestOffer: false,
    sellerCountry: null,
    externalItemId: itemId,
    imageUrls: [],
    // Title-only source: no structured grader/grade/set/cardNumber/language fields.
    metadata: {},
    // Full vendor payload, PII (sellerUsername/sellerPositivePercent) included — stripped at the
    // DB insert layer (stripSellerFields), not here.
    raw: item,
  };
}

export interface SoldCompsCursor { keywordIndex: number; page: number; seenIds: string[] }

export const soldComps: Connector = {
  name: "soldcomps",
  async *fetchSold(cursorIn: unknown | null): AsyncGenerator<Page> {
    const key = process.env.SOLDCOMPS_KEY;
    if (!key) throw new Error("SOLDCOMPS_KEY is required");
    const cursor: SoldCompsCursor = (cursorIn as SoldCompsCursor | null) ?? { keywordIndex: 0, page: 1, seenIds: [] };
    const seen = new Set(cursor.seenIds);
    let { keywordIndex, page } = cursor;

    while (keywordIndex < SOLDCOMPS.keywords.length) {
      const keyword = SOLDCOMPS.keywords[keywordIndex]!;
      const u = new URL(SOLDCOMPS.scrapePath, SOLDCOMPS.baseUrl);
      u.searchParams.set("keyword", keyword);
      u.searchParams.set("page", String(page));
      u.searchParams.set("count", String(SOLDCOMPS.count));
      const res = await politeFetch(u.toString(), { minIntervalMs: 1000, headers: SOLDCOMPS.authHeader(key) });
      if (!res.ok) throw new Error(`soldcomps ${res.status}`);
      const body = await res.json();
      const items = extractItems(body);
      const fresh = items.filter((it) => {
        const id = str((it as Record<string, unknown> | null)?.itemId);
        return id != null && !seen.has(id);
      });
      fresh.forEach((it) => {
        const id = str((it as Record<string, unknown>).itemId);
        if (id) seen.add(id);
      });
      const hasNextPage = Boolean((body as Record<string, unknown> | null)?.hasNextPage);
      const pageFullyKnown = items.length > 0 && fresh.length === 0;
      const capReached = page >= PAGE_CAP;
      const exhausted = !hasNextPage || pageFullyKnown || capReached;

      const next: SoldCompsCursor = exhausted
        ? { keywordIndex: keywordIndex + 1, page: 1, seenIds: [...seen].slice(-5000) }
        : { keywordIndex, page: page + 1, seenIds: [...seen].slice(-5000) };

      yield {
        listings: fresh.map(toRawListing).filter((l): l is RawListing => l !== null),
        nextCursor: next,
        suspect: items.length === 0 && page === 1,
      };

      keywordIndex = next.keywordIndex;
      page = next.page;
    }
    // Completed a full sweep of all keywords: reset for the next run but keep the seen set.
    yield { listings: [], nextCursor: { keywordIndex: 0, page: 1, seenIds: [...seen].slice(-5000) } };
  },
};
